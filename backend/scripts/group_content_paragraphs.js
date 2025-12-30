const { MeiliSearch } = require("meilisearch");

const MEILI_HOST = process.env.MEILI_HOST || "http://127.0.0.1:7700";
const MEILI_API_KEY = process.env.MEILI_API_KEY || "";
const INDEX = process.env.MEILI_INDEX || "poetry";
const BATCH = Number(process.env.BATCH || 1000);

/**
 * 将一维数组（每句话一个元素）转换为二维数组（所有句子合并为一段）
 * 
 * 例如：
 * ["句子1", "句子2", "句子3"] 
 * => [["句子1", "句子2", "句子3"]]
 */
function groupIntoParagraphs(content) {
  if (!Array.isArray(content)) {
    // 如果不是数组，返回空数组或单段
    const text = String(content || "").trim();
    return text ? [[text]] : [];
  }

  // 如果已经是二维数组，直接返回
  if (content.every((item) => Array.isArray(item))) {
    return content
      .map((para) => para.map((s) => String(s || "").trim()).filter(Boolean))
      .filter((para) => para.length > 0);
  }

  // 一维数组：将所有非空元素合并为一个段落
  const paragraph = content
    .map((item) => String(item || "").trim())
    .filter((text) => text !== "");

  // 如果段落为空，返回空数组；否则返回包含一个段落的二维数组
  return paragraph.length > 0 ? [paragraph] : [];
}

async function run() {
  const client = new MeiliSearch({ host: MEILI_HOST, apiKey: MEILI_API_KEY });
  const index = client.index(INDEX);
  let offset = 0;
  let total = 0;
  let changed = 0;

  console.log(`开始处理索引: ${INDEX}`);
  console.log(`批次大小: ${BATCH}`);
  console.log("");

  while (true) {
    const res = await index.getDocuments({
      limit: BATCH,
      offset,
      fields: ["id", "content"],
    });

    const docs = res.results || [];
    if (!docs.length) break;

    const updates = [];
    for (const doc of docs) {
      // 只处理一维数组的情况
      if (Array.isArray(doc.content) && !doc.content.every((item) => Array.isArray(item))) {
        const grouped = groupIntoParagraphs(doc.content);
        // 只有当结果不同时才更新
        if (JSON.stringify(grouped) !== JSON.stringify(doc.content)) {
          updates.push({ id: doc.id, content: grouped });
          changed++;
        }
      }
    }

    if (updates.length > 0) {
      await index.updateDocuments(updates);
      console.log(`offset ${offset}: 更新了 ${updates.length} 条记录`);
    } else {
      console.log(`offset ${offset}: 无需更新`);
    }

    offset += docs.length;
    total += docs.length;
  }

  console.log("");
  console.log("=".repeat(50));
  console.log(`处理完成！`);
  console.log(`总计: ${total} 条记录`);
  console.log(`更新: ${changed} 条记录`);
  console.log("=".repeat(50));
}

run().catch((err) => {
  console.error("错误:", err);
  process.exit(1);
});

