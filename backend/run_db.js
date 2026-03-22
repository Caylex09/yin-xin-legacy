
const db = require("better-sqlite3")("./data/app.db");
db.exec(`
    CREATE TABLE IF NOT EXISTS wiki_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT "",
      attributes TEXT NOT NULL,
      UNIQUE(target_type, target_id)
    );
`);
console.log("wiki_items table created/exists.");

