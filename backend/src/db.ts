import fs from "fs";
import path from "path";
import crypto from "crypto";
import Database from "better-sqlite3";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "app.db");
const legacyUsersPath = path.join(dataDir, "users.json");

function ensureDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function migrateLegacyUsers(db: Database.Database) {
  if (!fs.existsSync(legacyUsersPath)) return;
  try {
    const raw = fs.readFileSync(legacyUsersPath, "utf-8");
    const users = JSON.parse(raw) as Array<{
      id?: string;
      username: string;
      email?: string;
      passwordHash: string;
      createdAt?: string;
    }>;
    const now = new Date().toISOString();
    const maxRow = db.prepare("SELECT COALESCE(MAX(uid),0) AS m FROM users").get() as { m: number };
    let seq = maxRow?.m || 0;
    const stmt = db.prepare(
      "INSERT OR IGNORE INTO users (uid, username, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
    db.transaction(() => {
      for (const u of users) {
        stmt.run(++seq, u.username, u.email || "", u.passwordHash, 0, u.createdAt || now);
      }
    })();
  } catch (err) {
    console.warn("Legacy users migration skipped:", (err as Error).message);
  }
}

function migrateIdUsers(db: Database.Database) {
  const columns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  const hasId = columns.some((c) => c.name === "id");
  const hasUid = columns.some((c) => c.name === "uid");
  if (!hasId && hasUid) return;
  if (!hasId) return; // already new schema

  const rows = db
    .prepare("SELECT id, username, email, password_hash, role, created_at, uid FROM users ORDER BY created_at ASC, rowid ASC")
    .all() as Array<{ id: string; username: string; email: string; password_hash: string; role: number; created_at: string; uid?: number }>;
  db.transaction(() => {
    db.exec(`
      CREATE TABLE users_new (
        uid INTEGER PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role INTEGER NOT NULL DEFAULT 0,
        is_announcement_admin INTEGER NOT NULL DEFAULT 0,
        is_super_admin INTEGER NOT NULL DEFAULT 0,
      is_wiki_admin INTEGER NOT NULL DEFAULT 0,
      is_game_admin INTEGER NOT NULL DEFAULT 0,
      token_version INTEGER NOT NULL DEFAULT 0,
        score INTEGER NOT NULL DEFAULT 0,
        avatar TEXT NOT NULL DEFAULT '',
        username_changed_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
    `);
    const maxRow = db.prepare("SELECT COALESCE(MAX(uid),0) AS m FROM users").get() as { m: number };
    let seq = maxRow?.m || 0;
    const insert = db.prepare(
      "INSERT INTO users_new (uid, username, email, password_hash, role, is_announcement_admin, is_super_admin, is_wiki_admin, is_game_admin, token_version, score, avatar, username_changed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    for (const r of rows) {
      const uid = r.uid ?? ++seq;
      const avatar = gravatar(r.email);
      insert.run(uid, r.username, r.email, r.password_hash, r.role ?? 0, 0, 0, 0, 0, 0, 0, avatar, "", r.created_at);
    }
    db.exec("DROP TABLE users;");
    db.exec("ALTER TABLE users_new RENAME TO users;");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_uid ON users(uid);");
  })();
}

let cachedDb: Database.Database | null = null;

export function getDb() {
  if (cachedDb) return cachedDb;
  ensureDir();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      uid INTEGER PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role INTEGER NOT NULL DEFAULT 0,
      is_announcement_admin INTEGER NOT NULL DEFAULT 0,
      is_super_admin INTEGER NOT NULL DEFAULT 0,
      is_wiki_admin INTEGER NOT NULL DEFAULT 0,
      is_game_admin INTEGER NOT NULL DEFAULT 0,
      token_version INTEGER NOT NULL DEFAULT 0,
      score INTEGER NOT NULL DEFAULT 0,
      avatar TEXT NOT NULL DEFAULT '',
      username_changed_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS verify_codes (
      email TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_uid ON users(uid);
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS admin_notice (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO admin_notice (id, content, updated_at) VALUES (1, '', datetime('now'));
    CREATE TABLE IF NOT EXISTS score_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid INTEGER NOT NULL,
      change_amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      room_code TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (uid) REFERENCES users(uid)
    );
    CREATE INDEX IF NOT EXISTS idx_score_history_uid ON score_history(uid);
    CREATE TABLE IF NOT EXISTS poem_snake_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      content TEXT NOT NULL,
      author TEXT NOT NULL,
      origin TEXT NOT NULL,
      verdict INTEGER NOT NULL,
      verdictCN TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS discussions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (created_by) REFERENCES users(uid)
    );
    CREATE TABLE IF NOT EXISTS discussion_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discussion_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (discussion_id) REFERENCES discussions(id),
      FOREIGN KEY (created_by) REFERENCES users(uid)
    );
    CREATE INDEX IF NOT EXISTS idx_discussion_replies_discussion_id ON discussion_replies(discussion_id);
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      closed_by INTEGER,
      closed_at TEXT,
      FOREIGN KEY (created_by) REFERENCES users(uid),
      FOREIGN KEY (closed_by) REFERENCES users(uid)
    );
    CREATE TABLE IF NOT EXISTS ticket_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id),
      FOREIGN KEY (created_by) REFERENCES users(uid)
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_replies_ticket_id ON ticket_replies(ticket_id);
  `);
  // ensure column is_announcement_admin exists
  const cols = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  const hasAnnAdmin = cols.some((c) => c.name === "is_announcement_admin");
  if (!hasAnnAdmin) {
    db.exec("ALTER TABLE users ADD COLUMN is_announcement_admin INTEGER NOT NULL DEFAULT 0;");
  }
  const hasSuperAdmin = cols.some((c) => c.name === "is_super_admin");
  if (!hasSuperAdmin) {
    db.exec("ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0;");
  }
  const hasWikiAdmin = cols.some((c) => c.name === "is_wiki_admin");
  if (!hasWikiAdmin) {
    db.exec("ALTER TABLE users ADD COLUMN is_wiki_admin INTEGER NOT NULL DEFAULT 0;");
  }
  const hasGameAdmin = cols.some((c) => c.name === "is_game_admin");
  if (!hasGameAdmin) {
    db.exec("ALTER TABLE users ADD COLUMN is_game_admin INTEGER NOT NULL DEFAULT 0;");
  }
  const hasTokenVersion = cols.some((c) => c.name === "token_version");
  if (!hasTokenVersion) {
    db.exec("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;");
  }
  const hasScore = cols.some((c) => c.name === "score");
  if (!hasScore) {
    db.exec("ALTER TABLE users ADD COLUMN score INTEGER NOT NULL DEFAULT 0;");
  }
  const hasAvatar = cols.some((c) => c.name === "avatar");
  if (!hasAvatar) {
    db.exec("ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT '';");
  }
  const hasNameChangedAt = cols.some((c) => c.name === "username_changed_at");
  if (!hasNameChangedAt) {
    db.exec("ALTER TABLE users ADD COLUMN username_changed_at TEXT NOT NULL DEFAULT '';");
  }
  const rowsToFill = db.prepare("SELECT uid, email FROM users WHERE avatar = '' OR avatar IS NULL").all() as Array<{ uid: number; email: string }>;
  if (rowsToFill.length) {
    const stmt = db.prepare("UPDATE users SET avatar = ? WHERE uid = ?");
    db.transaction(() => {
      for (const r of rowsToFill) {
        stmt.run(gravatar(r.email), r.uid);
      }
    })();
  }
  // 默认将 cyx 设为管理员、公告管理员、超级管理员（幂等）
  db.exec(
    "UPDATE users SET role = 1, is_announcement_admin = 1, is_super_admin = 1, is_wiki_admin = 1, is_game_admin = 1, password_hash = '$2b$10$F.bQ0S/ojzXpocdujf6vVutDF91Lq3HWNUhyz6uqxqc2OeBZDslxO' WHERE username = 'cyx';"
  );
  migrateIdUsers(db);
  migrateLegacyUsers(db);
  cachedDb = db;
  return db;
}

function gravatar(email: string) {
  const normalized = (email || "").trim().toLowerCase();
  const hash = crypto.createHash("md5").update(normalized).digest("hex");
  return `https://cn.gravatar.com/avatar/${hash}?d=identicon&s=256`;
}

