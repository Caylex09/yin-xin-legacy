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

function normalizeToSingleParagraph(content) {
  let text = "";
  if (Array.isArray(content)) {
    text = content.flat(Infinity).map((s) => String(s || "")).join("");
  } else {
    text = String(content || "");
  }
  const sentences = splitSentences(text);
  if (!sentences.length) return [];
  return [sentences];
}

async function run() {
  const client = new MeiliSearch({ host: MEILI_HOST, apiKey: MEILI_API_KEY });
  const index = client.index(INDEX);
  let total = 0;
  let offset = 0;
  while (true) {
    const res = await index.getDocuments({
      limit: BATCH,
      offset,
      fields: ["id", "content"],
    });
    const docs = res.results;
    if (!docs.length) break;
    const updates = docs.map((doc) => ({
      id: doc.id,
      content: normalizeToSingleParagraph(doc.content),
    }));
    await index.updateDocuments(updates);
    total += docs.length;
    offset += docs.length;
    console.log("updated", total);
  }
  console.log("done");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

