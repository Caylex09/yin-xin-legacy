// 将诗词中出现的章节标记（（一章）…（十章））转换为换行分段，并按标点分句
// 环境变量：MEILI_HOST, MEILI_API_KEY
const { MeiliSearch } = require("meilisearch");

const MEILI_HOST = process.env.MEILI_HOST || "http://127.0.0.1:7700";
const MEILI_API_KEY = process.env.MEILI_API_KEY || "";
const INDEX = "poetry";
const BATCH = 500;
// 匹配（1-99章），含全角数字“一”到“九十九”，以及“十”
const MARKER_REGEX = /（(?:[一二三四五六七八九]?十[一二三四五六七八九]?|[一二三四五六七八九])章）/g;

const client = new MeiliSearch({ host: MEILI_HOST, apiKey: MEILI_API_KEY });

function splitSentences(text) {
  return text
    .split(/(?<=[。！？!?；;])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeToParagraphs(content) {
  // content 可能是嵌套数组，也可能是字符串
  if (Array.isArray(content)) {
    return content
      .map((seg) => {
        if (Array.isArray(seg)) return seg;
        return [String(seg ?? "")];
      })
      .filter((seg) => Array.isArray(seg) && seg.length);
  }
  if (content === undefined || content === null) return [];
  return [[String(content)]];
}

function processContent(doc) {
  const paragraphs = normalizeToParagraphs(doc.content);
  const flatText = paragraphs
    .map((seg) => (Array.isArray(seg) ? seg.join("") : String(seg ?? "")))
    .join("");
  if (!MARKER_REGEX.test(flatText)) return { changed: false };

  const replaced = flatText.replace(MARKER_REGEX, "\n");
  const newParas = replaced
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => splitSentences(p));
  return { changed: true, content: newParas };
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
      const result = processContent(doc);
      if (result.changed) {
        updates.push({ id: doc.id, content: result.content });
      }
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

