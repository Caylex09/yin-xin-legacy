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
MEILI_HOST="${MEILI_HOST:-http://127.0.0.1:7700}"
MEILI_API_KEY="${MEILI_API_KEY:-}"

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
if ! curl -s "$MEILI_HOST/health" > /dev/null; then
    echo "❌ 无法连接到 MeiliSearch: $MEILI_HOST"
    echo "   请确保 MeiliSearch 服务正在运行"
    exit 1
fi
echo "✅ MeiliSearch 连接正常"
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

const client = new MeiliSearch({
  host: MEILI_HOST,
  apiKey: MEILI_API_KEY,
});

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
  const BATCH_SIZE = 1000;

  for await (const line of rl) {
    if (line.trim()) {
      try {
        const doc = JSON.parse(line);
        documents.push(doc);
        lineCount++;
        
        // 批量导入
        if (documents.length >= BATCH_SIZE) {
          await index.addDocuments(documents);
          process.stdout.write(`\r   📦 已导入 ${lineCount} 条记录...`);
          documents.length = 0; // 清空数组
        }
      } catch (e) {
        console.error(`\n   ❌ 解析错误 (行 ${lineCount + 1}): ${e.message}`);
      }
    }
  }

  // 导入剩余文档
  if (documents.length > 0) {
    await index.addDocuments(documents);
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

  console.log(`   ✅ 导入完成，共 ${totalCount} 条记录`);
  
  // 等待索引完成
  console.log(`   ⏳ 等待索引完成...`);
  let task;
  let waitCount = 0;
  do {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const tasks = await client.getTasks({ indexUids: [indexName], limit: 1 });
    task = tasks.results[0];
    waitCount++;
    if (waitCount % 5 === 0) {
      process.stdout.write(`\r   ⏳ 等待中... (${waitCount * 2}秒)`);
    }
  } while (task && (task.status === 'enqueued' || task.status === 'processing'));
  
  console.log(''); // 换行
  
  if (task?.status === 'succeeded') {
    console.log(`   ✅ 索引完成`);
  } else if (task?.status === 'failed') {
    console.log(`   ❌ 索引失败: ${task.error?.message || 'unknown error'}`);
  } else {
    console.log(`   ✅ 索引处理完成`);
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

