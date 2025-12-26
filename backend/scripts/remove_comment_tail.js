// 批量移除诗文尾句中的“评注（点击查看或隐藏评注）”占位，并清理空段
// 使用环境变量：MEILI_HOST, MEILI_API_KEY
const { MeiliSearch } = require("meilisearch");

const MEILI_HOST = process.env.MEILI_HOST || "http://127.0.0.1:7700";
const MEILI_API_KEY = process.env.MEILI_API_KEY || "";
const INDEX = "poetry";
const TARGET = "评注（点击查看或隐藏评注）";
const BATCH = 500;

const client = new MeiliSearch({ host: MEILI_HOST, apiKey: MEILI_API_KEY });

function cleanContent(content) {
  if (!Array.isArray(content)) return { content, changed: false };
  let changed = false;
  const paragraphs = content
    .map((seg) => {
      if (!Array.isArray(seg)) return seg;
      const filtered = seg.filter((s) => typeof s === "string" && !s.includes(TARGET));
      if (filtered.length !== seg.length) changed = true;
      return filtered;
    })
    .filter((seg) => {
      if (Array.isArray(seg)) return seg.length > 0;
      return true;
    });

  return { content: paragraphs, changed };
}

async function run() {
  const idx = client.index(INDEX);
  let offset = 0;
  let updated = 0;
  while (true) {
    const res = await idx.getDocuments({
      limit: BATCH,
      offset,
      fields: ["id", "content"],
    });
    const docs = res.results || [];
    if (!docs.length) break;
    const updates = [];
    for (const doc of docs) {
      const { content, changed } = cleanContent(doc.content);
      if (!changed) continue;
      // 仅当末句含目标时才更新
      const lastPara = Array.isArray(content) && content.length ? content[content.length - 1] : null;
      const lastSentence =
        Array.isArray(lastPara) && lastPara.length ? lastPara[lastPara.length - 1] : undefined;
      if (lastSentence && typeof lastSentence === "string" && lastSentence.includes(TARGET)) {
        // 已被滤掉，说明末句就是目标；若末段空，会被前面过滤掉
      }
      updates.push({ id: doc.id, content });
    }
    if (updates.length) {
      await idx.updateDocuments(updates);
      updated += updates.length;
      console.log(`offset ${offset}: updated ${updates.length}, total ${updated}`);
    } else {
      console.log(`offset ${offset}: no changes`);
    }
    offset += docs.length;
  }
  console.log("done, updated", updated);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

