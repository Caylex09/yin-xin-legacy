const { MeiliSearch } = require("meilisearch");

const MEILI_HOST = process.env.MEILI_HOST || "http://127.0.0.1:7700";
const MEILI_API_KEY = process.env.MEILI_API_KEY || "";
const INDEX = process.env.MEILI_INDEX || "poetry";

async function run() {
  const client = new MeiliSearch({ host: MEILI_HOST, apiKey: MEILI_API_KEY });
  const stats = await client.index(INDEX).getStats();
  console.log(JSON.stringify(stats, null, 2));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

