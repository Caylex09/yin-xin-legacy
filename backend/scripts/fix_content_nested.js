const { MeiliSearch } = require("meilisearch");

const MEILI_HOST = process.env.MEILI_HOST || "http://127.0.0.1:7700";
const MEILI_API_KEY = process.env.MEILI_API_KEY || "";
const INDEX = process.env.MEILI_INDEX || "poetry";
const BATCH = Number(process.env.BATCH || 1000);

function splitSentences(text) {
  return String(text || "")
    .split(/(?<=[。！？!?；;])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function toNested(content) {
  if (Array.isArray(content)) {
    // 已是二维
    if (content.every((seg) => Array.isArray(seg))) {
      return content
        .map((seg) => splitSentences(seg.flat(Infinity).map((s) => String(s || "")).join("")))
        .filter((seg) => seg.length);
    }
    // 一维字符串数组，合并后按句切，放入单段
    const text = content.map((s) => String(s || "")).join("");
    const seg = splitSentences(text);
    return seg.length ? [seg] : [];
  }
  const text = String(content || "").trim();
  if (!text) return [];
  const seg = splitSentences(text);
  return seg.length ? [seg] : [];
}

async function run() {
  const client = new MeiliSearch({ host: MEILI_HOST, apiKey: MEILI_API_KEY });
  const index = client.index(INDEX);
  let offset = 0;
  let total = 0;
  while (true) {
    const res = await index.search("", { limit: BATCH, offset, attributesToRetrieve: ["id", "content"] });
    if (!res.hits.length) break;
    const updates = res.hits.map((doc) => {
      const nested = toNested(doc.content);
      return { id: doc.id, content: nested };
    });
    await index.updateDocuments(updates);
    offset += res.hits.length;
    total += res.hits.length;
    console.log("updated", total);
  }
  console.log("done");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

