#!/bin/bash
# MeiliSearch 数据导入脚本
# 用法: ./import-meilisearch-data.sh

set -e

echo "========================================"
echo "  MeiliSearch 数据导入脚本"
echo "========================================"
echo ""

PROJECT_DIR="/var/www/yinxin"
DATA_DIR="$PROJECT_DIR/data"
BACKEND_ENV="$PROJECT_DIR/backend/.env"

# 从 backend/.env 读取 MeiliSearch 配置
if [ -f "$BACKEND_ENV" ]; then
    # 读取环境变量
    export $(grep -v '^#' "$BACKEND_ENV" | grep -E 'MEILI_HOST|MEILI_API_KEY' | xargs)
fi

MEILI_HOST="${MEILI_HOST:-http://127.0.0.1:7700}"
MEILI_API_KEY="${MEILI_API_KEY:-}"

# 检查 API Key
if [ -z "$MEILI_API_KEY" ]; then
    echo "❌ 错误: MEILI_API_KEY 未设置"
    echo "   请确保 backend/.env 文件中包含 MEILI_API_KEY"
    echo "   或通过环境变量设置: export MEILI_API_KEY=your_key"
    exit 1
fi

echo "🔑 MeiliSearch API Key: ${MEILI_API_KEY:0:10}..." # 只显示前10个字符

# 检查项目目录
if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ 项目目录不存在: $PROJECT_DIR"
    exit 1
fi

cd "$PROJECT_DIR"

# 检查数据文件（支持分片格式）
POETRY_PART_0="$DATA_DIR/poetry_part_0.ndjson"
POETRY_SINGLE="$DATA_DIR/poetry.ndjson"

if [ ! -f "$POETRY_PART_0" ] && [ ! -f "$POETRY_SINGLE" ]; then
    echo "❌ 数据文件不存在"
    echo "   期望: $POETRY_PART_0 或 $POETRY_SINGLE"
    echo "   请确保数据文件已准备好"
    exit 1
fi

# 检测数据格式
if [ -f "$POETRY_PART_0" ]; then
    USE_PARTS=true
    echo "ℹ️  检测到分片格式 (poetry_part_*.ndjson)"
else
    USE_PARTS=false
    echo "ℹ️  检测到单文件格式 (poetry.ndjson)"
fi

echo "📋 配置信息："
echo "   MeiliSearch 地址: $MEILI_HOST"
echo "   数据目录: $DATA_DIR"
echo ""

# 检查 MeiliSearch 连接
echo "🔌 检查 MeiliSearch 连接..."
echo "   尝试连接: $MEILI_HOST/health"

# 尝试连接，检查 HTTP 状态码
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$MEILI_HOST/health" 2>&1)
CURL_EXIT=$?

if [ $CURL_EXIT -ne 0 ]; then
    echo "❌ curl 命令执行失败 (退出码: $CURL_EXIT)"
    echo "   错误信息: $(curl -s "$MEILI_HOST/health" 2>&1)"
    echo ""
    echo "🔍 诊断步骤："
    echo "   1. 检查 MeiliSearch 服务状态:"
    echo "      sudo systemctl status meilisearch"
    echo ""
    echo "   2. 检查 MeiliSearch 是否在运行:"
    echo "      ps aux | grep meilisearch"
    echo ""
    echo "   3. 检查端口是否监听:"
    echo "      sudo netstat -tlnp | grep 7700"
    echo "      或"
    echo "      sudo ss -tlnp | grep 7700"
    echo ""
    echo "   4. 尝试手动测试:"
    echo "      curl $MEILI_HOST/health"
    echo ""
    exit 1
fi

if [ "$HTTP_CODE" != "200" ]; then
    echo "❌ MeiliSearch 返回异常状态码: $HTTP_CODE"
    echo "   响应内容: $(curl -s "$MEILI_HOST/health")"
    echo ""
    exit 1
fi

echo "✅ MeiliSearch 连接正常 (HTTP $HTTP_CODE)"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未安装 Node.js"
    exit 1
fi

# 创建导入脚本
IMPORT_SCRIPT="$PROJECT_DIR/import-data.js"
cat > "$IMPORT_SCRIPT" << 'IMPORT_EOF'
const fs = require('fs');
const { MeiliSearch } = require('meilisearch');
const readline = require('readline');

const MEILI_HOST = process.env.MEILI_HOST || 'http://127.0.0.1:7700';
const MEILI_API_KEY = process.env.MEILI_API_KEY || '';
const DATA_DIR = process.env.DATA_DIR || './data';

// 检查 API Key
if (!MEILI_API_KEY) {
  console.error('❌ 错误: MEILI_API_KEY 未设置');
  console.error('   请确保设置了环境变量 MEILI_API_KEY');
  process.exit(1);
}

console.log(`🔑 使用 MeiliSearch: ${MEILI_HOST}`);
console.log(`🔑 API Key: ${MEILI_API_KEY.substring(0, 10)}...`);

const client = new MeiliSearch({
  host: MEILI_HOST,
  apiKey: MEILI_API_KEY,
});

async function waitForTask(indexUid, maxWait = 30) {
  let waitCount = 0;
  while (waitCount < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      const tasks = await client.getTasks({ indexUids: [indexUid], limit: 1 });
      const task = tasks.results[0];
      
      if (!task || task.status === 'succeeded') {
        return true;
      }
      if (task.status === 'failed') {
        throw new Error(task.error?.message || 'Task failed');
      }
    } catch (e) {
      // 如果获取任务失败，继续等待
      if (e.message && !e.message.includes('Task failed')) {
        // 网络错误等，继续等待
      } else {
        throw e;
      }
    }
    waitCount++;
  }
  return false;
}

async function addDocumentsWithRetry(index, documents, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const task = await index.addDocuments(documents);
      // 简单等待，不阻塞
      return task;
    } catch (e) {
      if (i === retries - 1) {
        throw e;
      }
      const waitTime = (i + 1) * 2000; // 递增等待时间
      console.log(`\n   ⚠️  导入失败，${waitTime/1000}秒后重试 ${i + 1}/${retries}...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

async function importFile(index, filePath) {
  if (!fs.existsSync(filePath)) {
    return 0;
  }

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const documents = [];
  let lineCount = 0;
  const BATCH_SIZE = 100; // 减小批次大小，避免请求过大

  for await (const line of rl) {
    if (line.trim()) {
      try {
        const doc = JSON.parse(line);
        documents.push(doc);
        lineCount++;
        
        // 批量导入
        if (documents.length >= BATCH_SIZE) {
          try {
            await addDocumentsWithRetry(index, documents);
            process.stdout.write(`\r   📦 已导入 ${lineCount} 条记录...`);
          } catch (e) {
            console.error(`\n   ❌ 导入失败 (行 ${lineCount}): ${e.message}`);
            // 继续处理，不中断
          }
          documents.length = 0; // 清空数组
        }
      } catch (e) {
        console.error(`\n   ❌ JSON 解析错误 (行 ${lineCount + 1}): ${e.message}`);
      }
    }
  }

  // 导入剩余文档
  if (documents.length > 0) {
    try {
      await addDocumentsWithRetry(index, documents);
    } catch (e) {
      console.error(`\n   ❌ 导入剩余文档失败: ${e.message}`);
    }
  }

  return lineCount;
}

async function importIndex(indexName, filePaths) {
  console.log(`\n📦 导入索引: ${indexName}`);
  
  const index = client.index(indexName);
  
  // 检查索引是否存在
  try {
    const stats = await index.getStats();
    console.log(`   ℹ️  索引已存在，文档数: ${stats.numberOfDocuments || 0}`);
    
    // 如果已有数据，清空
    if (stats.numberOfDocuments > 0) {
      console.log(`   ⚠️  索引已有数据，将清空后重新导入`);
      await index.deleteAllDocuments();
    }
  } catch (e) {
    console.log(`   ℹ️  创建新索引`);
  }

  // 确保 filePaths 是数组
  const files = Array.isArray(filePaths) ? filePaths : [filePaths];
  let totalCount = 0;

  console.log(`   📖 开始导入 ${files.length} 个文件...`);
  
  for (const filePath of files) {
    if (!fs.existsSync(filePath)) {
      console.log(`   ⚠️  文件不存在，跳过: ${filePath}`);
      continue;
    }
    
    const fileName = filePath.split('/').pop();
    console.log(`   📄 导入文件: ${fileName}`);
    
    const count = await importFile(index, filePath);
    totalCount += count;
    console.log(`\r   ✅ ${fileName}: ${count} 条记录`);
  }

  console.log(`\n   ✅ 导入完成，共 ${totalCount} 条记录`);
  
  // 等待所有任务完成
  console.log(`   ⏳ 等待所有索引任务完成...`);
  let allTasksDone = false;
  let waitCount = 0;
  const maxWait = 300; // 最多等待 10 分钟
  
  while (!allTasksDone && waitCount < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const tasks = await client.getTasks({ indexUids: [indexName], limit: 10 });
    
    const pendingTasks = tasks.results.filter(t => 
      t.status === 'enqueued' || t.status === 'processing'
    );
    
    if (pendingTasks.length === 0) {
      allTasksDone = true;
    } else {
      waitCount++;
      if (waitCount % 5 === 0) {
        process.stdout.write(`\r   ⏳ 等待中... (${waitCount * 2}秒, ${pendingTasks.length} 个任务进行中)`);
      }
    }
  }
  
  console.log(''); // 换行
  
  if (allTasksDone) {
    console.log(`   ✅ 所有索引任务完成`);
  } else {
    console.log(`   ⚠️  等待超时，但可能仍在处理中`);
  }
}

async function main() {
  try {
    console.log('========================================');
    console.log('  开始导入数据');
    console.log('========================================');
    
    // 导入 poets 索引
    const poetsFile = `${DATA_DIR}/poets.ndjson`;
    if (fs.existsSync(poetsFile)) {
      await importIndex('poets', poetsFile);
    } else {
      console.log('\n⚠️  poets.ndjson 不存在，跳过 poets 索引');
    }
    
    // 导入 poetry 索引（支持分片格式）
    const USE_PARTS = process.env.USE_PARTS === 'true';
    let poetryFiles = [];
    
    if (USE_PARTS) {
      // 查找所有分片文件
      const files = fs.readdirSync(DATA_DIR);
      const partFiles = files
        .filter(f => f.startsWith('poetry_part_') && f.endsWith('.ndjson'))
        .sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)?.[0] || '0');
          const numB = parseInt(b.match(/\d+/)?.[0] || '0');
          return numA - numB;
        })
        .map(f => `${DATA_DIR}/${f}`);
      
      if (partFiles.length > 0) {
        poetryFiles = partFiles;
        console.log(`\n📦 找到 ${partFiles.length} 个分片文件`);
      }
    }
    
    // 如果没有分片文件，尝试单文件
    if (poetryFiles.length === 0) {
      const singleFile = `${DATA_DIR}/poetry.ndjson`;
      if (fs.existsSync(singleFile)) {
        poetryFiles = [singleFile];
      }
    }
    
    if (poetryFiles.length > 0) {
      await importIndex('poetry', poetryFiles);
    } else {
      console.log('\n❌ 未找到 poetry 数据文件');
      console.log('   期望: poetry_part_*.ndjson 或 poetry.ndjson');
    }
    
    console.log('\n========================================');
    console.log('  导入完成！');
    console.log('========================================');
    
    // 显示统计信息
    console.log('\n📊 索引统计：');
    try {
      const poetryStats = await client.index('poetry').getStats();
      console.log(`   poetry: ${poetryStats.numberOfDocuments || 0} 条`);
    } catch (e) {
      console.log(`   poetry: 未创建`);
    }
    
    try {
      const poetsStats = await client.index('poets').getStats();
      console.log(`   poets: ${poetsStats.numberOfDocuments || 0} 条`);
    } catch (e) {
      console.log(`   poets: 未创建`);
    }
    
  } catch (e) {
    console.error('\n❌ 导入失败:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
}

main();
IMPORT_EOF

echo "✅ 导入脚本已创建"
echo ""

# 检查后端依赖
echo "📦 检查依赖..."
cd "$PROJECT_DIR/backend"
if [ ! -d "node_modules" ] || [ ! -d "node_modules/meilisearch" ]; then
    echo "   安装后端依赖..."
    npm install
fi
echo "✅ 依赖检查完成"
echo ""

# 运行导入脚本
echo "🚀 开始导入数据..."
echo ""

cd "$PROJECT_DIR"

# 检测是否使用分片格式
if [ "$USE_PARTS" = "true" ]; then
    USE_PARTS_FLAG="true"
else
    USE_PARTS_FLAG="false"
fi

# 显示配置信息（用于调试）
echo "📋 运行配置："
echo "   MEILI_HOST: $MEILI_HOST"
echo "   MEILI_API_KEY: ${MEILI_API_KEY:0:10}... (已设置)"
echo "   DATA_DIR: $DATA_DIR"
echo "   USE_PARTS: $USE_PARTS_FLAG"
echo ""

# 运行导入脚本，确保传递所有环境变量
MEILI_HOST="$MEILI_HOST" \
MEILI_API_KEY="$MEILI_API_KEY" \
DATA_DIR="$DATA_DIR" \
USE_PARTS="$USE_PARTS_FLAG" \
node "$IMPORT_SCRIPT"

# 清理临时脚本
rm -f "$IMPORT_SCRIPT"

echo ""
echo "========================================"
echo "  导入完成！"
echo "========================================"
echo ""
echo "🧪 测试 API："
echo "   curl http://yin-xin.fun/api/poetry/random-line"
echo "   curl http://yin-xin.fun/api/poetry/random"
echo ""

