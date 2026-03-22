
const { MeiliSearch } = require("meilisearch");
const client = new MeiliSearch({ host: "http://127.0.0.1:7700", apiKey: "h-gRKMpBUukHrLcBpCSoNyM2pPLEIs4F5JVLZrBtwnI" });
async function check() {
  const index = client.index("poetry");
  const docs = await index.search("七言诗");
  console.log(docs.hits.slice(0, 1));
}
check().catch(console.error);

