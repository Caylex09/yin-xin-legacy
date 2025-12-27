#!/usr/bin/env node
// 简化的 MeiliSearch 数据导入脚本
// 用法: node import-data-simple.js

const fs = require('fs');
const { MeiliSearch } = require('meilisearch');
const readline = require('readline');
const path = require('path');

// 从环境变量或 .env 文件读取配置
const MEILI_HOST = process.env.MEILI_HOST || 'http://127.0.0.1:7700';
const MEILI_API_KEY = process.env.MEILI_API_KEY || '';
const DATA_DIR = process.env.DATA_DIR || './data';

if (!MEILI_API_KEY) {
  console.error('❌ 错误: MEILI_API_KEY 未设置');
  process.exit(1);
}

console.log('🔑 MeiliSearch:', MEILI_HOST);
console.log('📁 数据目录:', DATA_DIR);
console.log('');

const client = new MeiliSearch({
  host: MEILI_HOST,
  apiKey: MEILI_API_KEY,
});

async function importFile(indexName, filePath) {
  console.log(`\n📦 导入索引: ${indexName}`);
  console.log(`📄 文件: ${path.basename(filePath)}`);
  
  if (!fs.existsSync(filePath)) {
    console.log('❌ 文件不存在');
    return 0;
  }

  const index = client.index(indexName);
  
  // 检查并清空索引
  try {
    const stats = await index.getStats();
    if (stats.numberOfDocuments > 0) {
      console.log(`⚠️  索引已有 ${stats.numberOfDocuments} 条记录，清空中...`);
      await index.deleteAllDocuments();
      // 等待删除完成
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (e) {
    // 索引不存在，继续
  }

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const documents = [];
  let lineCount = 0;
  let errorCount = 0;
  const BATCH_SIZE = 50; // 小批次，更稳定

  console.log('📖 开始读取文件...');

  for await (const line of rl) {
    if (line.trim()) {
      try {
        const doc = JSON.parse(line);
        documents.push(doc);
        lineCount++;
        
        if (documents.length >= BATCH_SIZE) {
          try {
            await index.addDocuments(documents);
            process.stdout.write(`\r✅ 已导入 ${lineCount} 条记录 (错误: ${errorCount})`);
            documents.length = 0;
          } catch (e) {
            errorCount++;
            console.error(`\n❌ 批量导入失败: ${e.message}`);
            // 继续处理，不中断
            documents.length = 0;
          }
        }
      } catch (e) {
        errorCount++;
        if (errorCount <= 5) {
          console.error(`\n⚠️  JSON 解析错误 (行 ${lineCount + 1}): ${e.message}`);
        }
      }
    }
  }

  // 导入剩余文档
  if (documents.length > 0) {
    try {
      await index.addDocuments(documents);
      process.stdout.write(`\r✅ 已导入 ${lineCount} 条记录 (错误: ${errorCount})`);
    } catch (e) {
      errorCount++;
      console.error(`\n❌ 导入剩余文档失败: ${e.message}`);
    }
  }

  console.log('');
  console.log(`✅ 完成: 共 ${lineCount} 条记录, ${errorCount} 个错误`);
  
  return lineCount;
}

async function main() {
  try {
    // 测试连接
    console.log('🔌 测试 MeiliSearch 连接...');
    await client.health();
    console.log('✅ 连接成功\n');

    // 导入 poets
    const poetsFile = path.join(DATA_DIR, 'poets.ndjson');
    if (fs.existsSync(poetsFile)) {
      await importFile('poets', poetsFile);
    } else {
      console.log('⚠️  poets.ndjson 不存在，跳过');
    }

    // 导入 poetry（分片格式）
    const files = fs.readdirSync(DATA_DIR)
      .filter(f => f.startsWith('poetry_part_') && f.endsWith('.ndjson'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] || '0');
        const numB = parseInt(b.match(/\d+/)?.[0] || '0');
        return numA - numB;
      });

    if (files.length > 0) {
      console.log(`\n📦 找到 ${files.length} 个分片文件`);
      let totalCount = 0;
      
      for (const file of files) {
        const filePath = path.join(DATA_DIR, file);
        const count = await importFile('poetry', filePath);
        totalCount += count;
      }
      
      console.log(`\n✅ Poetry 导入完成，共 ${totalCount} 条记录`);
    } else {
      // 尝试单文件
      const singleFile = path.join(DATA_DIR, 'poetry.ndjson');
      if (fs.existsSync(singleFile)) {
        await importFile('poetry', singleFile);
      } else {
        console.log('❌ 未找到 poetry 数据文件');
      }
    }

    // 显示统计
    console.log('\n📊 最终统计：');
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





