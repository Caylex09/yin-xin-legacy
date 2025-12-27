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

# 检查数据文件
if [ ! -f "$DATA_DIR/poetry.ndjson" ]; then
    echo "❌ 数据文件不存在: $DATA_DIR/poetry.ndjson"
    echo "   请确保数据文件已准备好"
    exit 1
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

async function importIndex(indexName, filePath) {
  console.log(`\n📦 导入索引: ${indexName}`);
  console.log(`   文件: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    console.log(`   ⚠️  文件不存在，跳过`);
    return;
  }

  const index = client.index(indexName);
  
  // 检查索引是否存在
  try {
    const stats = await index.getStats();
    console.log(`   ℹ️  索引已存在，文档数: ${stats.numberOfDocuments || 0}`);
    
    // 询问是否清空
    if (stats.numberOfDocuments > 0) {
      console.log(`   ⚠️  索引已有数据，将清空后重新导入`);
      await index.deleteAllDocuments();
    }
  } catch (e) {
    console.log(`   ℹ️  创建新索引`);
  }

  // 读取 NDJSON 文件
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const documents = [];
  let lineCount = 0;
  const BATCH_SIZE = 1000;

  console.log(`   📖 读取文件...`);
  
  for await (const line of rl) {
    if (line.trim()) {
      try {
        const doc = JSON.parse(line);
        documents.push(doc);
        lineCount++;
        
        // 批量导入
        if (documents.length >= BATCH_SIZE) {
          await index.addDocuments(documents);
          console.log(`   ✅ 已导入 ${lineCount} 条记录...`);
          documents.length = 0; // 清空数组
        }
      } catch (e) {
        console.error(`   ❌ 解析错误 (行 ${lineCount + 1}): ${e.message}`);
      }
    }
  }

  // 导入剩余文档
  if (documents.length > 0) {
    await index.addDocuments(documents);
  }

  console.log(`   ✅ 导入完成，共 ${lineCount} 条记录`);
  
  // 等待索引完成
  console.log(`   ⏳ 等待索引完成...`);
  let task;
  do {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const tasks = await client.getTasks({ indexUids: [indexName], limit: 1 });
    task = tasks.results[0];
  } while (task && task.status === 'enqueued' || task?.status === 'processing');
  
  if (task?.status === 'succeeded') {
    console.log(`   ✅ 索引完成`);
  } else if (task?.status === 'failed') {
    console.log(`   ❌ 索引失败: ${task.error?.message || 'unknown error'}`);
  }
}

async function main() {
  try {
    console.log('========================================');
    console.log('  开始导入数据');
    console.log('========================================');
    
    // 导入 poets 索引
    await importIndex('poets', `${DATA_DIR}/poets.ndjson`);
    
    // 导入 poetry 索引
    await importIndex('poetry', `${DATA_DIR}/poetry.ndjson`);
    
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
MEILI_HOST="$MEILI_HOST" \
MEILI_API_KEY="$MEILI_API_KEY" \
DATA_DIR="$DATA_DIR" \
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

