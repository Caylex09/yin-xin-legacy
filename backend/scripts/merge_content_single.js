const { MeiliSearch } = require("meilisearch");

const MEILI_HOST = process.env.MEILI_HOST || "http://127.0.0.1:7700";
const MEILI_API_KEY = process.env.MEILI_API_KEY || "";
const INDEX = process.env.MEILI_INDEX || "poetry";
const BATCH = Number(process.env.BATCH || 1000);

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
    const updates = docs.map((doc) => {
      const c = doc.content;
      let text = "";
      if (Array.isArray(c)) {
        text = c.flat(Infinity).map((s) => String(s || "")).join("");
      } else {
        text = String(c || "");
      }
      return { id: doc.id, content: text };
    });
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

