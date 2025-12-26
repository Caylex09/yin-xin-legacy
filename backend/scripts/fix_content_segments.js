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

function normalizeContent(v) {
  if (Array.isArray(v)) {
    if (v.every((seg) => Array.isArray(seg))) {
      return v.map((seg) => seg.map((s) => String(s || "")).filter(Boolean)).filter((seg) => seg.length);
    }
    return v
      .map((s) => splitSentences(s))
      .filter((seg) => seg.length);
  }
  if (v === undefined || v === null || v === "") return [];
  return [splitSentences(v)].filter((seg) => seg.length);
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
      const content = normalizeContent(doc.content);
      return { id: doc.id, content };
    });
    await index.updateDocuments(updates);
    offset += res.hits.length;
    total += res.hits.length;
    console.log(`updated ${total}`);
  }
  console.log("done");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

