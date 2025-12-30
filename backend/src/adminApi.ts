import { Router } from "express";
import { MeiliSearch } from "meilisearch";
import { getDb } from "./db";
import { requireAdmin, requireSuperAdmin, requireWikiAdmin } from "./middleware";

const MEILI_HOST = process.env.MEILI_HOST || "http://127.0.0.1:7700";
const MEILI_API_KEY = process.env.MEILI_API_KEY || "";

const client = new MeiliSearch({
  host: MEILI_HOST,
  apiKey: MEILI_API_KEY,
});

async function collectFlaggedPoetry(limit: number, startOffset: number) {
  const idx = client.index("poetry");
  let offset = startOffset;
  const step = 500;
  const flagged: any[] = [];
  let scanned = offset;
  // eslint-disable-next-line no-constant-condition
  while (flagged.length < limit) {
    const res = await idx.getDocuments({
      limit: step,
      offset,
      fields: ["id", "title", "author", "dynasty", "content", "tags", "translation", "appreciation"],
    });
    const docs = res.results || [];
    if (!docs.length) break;
    for (const d of docs) {
      const str = JSON.stringify([d.author, d.dynasty, d.content]); // 标题含括号不计入修复
      if (str.includes("（") || str.includes("）") || str.includes("�") || str.includes("□")) {
        flagged.push(d);
        if (flagged.length >= limit) break;
      }
    }
    offset += docs.length;
    scanned = offset;
    if (docs.length < step) break;
  }
  return { items: flagged, nextOffset: flagged.length >= limit ? offset : null, scanned };
}

async function collectFlaggedPoets(limit: number, startOffset: number) {
  const idx = client.index("poets");
  let offset = startOffset;
  const step = 500;
  const flagged: any[] = [];
  let scanned = offset;
  while (flagged.length < limit) {
    const res = await idx.getDocuments({
      limit: step,
      offset,
      fields: ["id", "name", "dynasty", "description", "content", "avatar"],
    });
    const docs = res.results || [];
    if (!docs.length) break;
    for (const d of docs) {
      const textStr = JSON.stringify([d.name, d.dynasty, d.description, d.content]);
      const badText = textStr.includes("□") || textStr.includes("�");
      const badAvatar = !d.avatar || String(d.avatar).includes("yinxin");
      if (badText || badAvatar) {
        flagged.push(d);
        if (flagged.length >= limit) break;
      }
    }
    offset += docs.length;
    scanned = offset;
    if (docs.length < step) break;
  }
  return { items: flagged, nextOffset: flagged.length >= limit ? offset : null, scanned };
}

export function createAdminApiRouter(): Router {
  const router = Router();

  router.get("/api/admin/fix/poetry", requireWikiAdmin, async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 1000, 1), 2000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    try {
      const { items, nextOffset, scanned } = await collectFlaggedPoetry(limit, offset);
      res.json({ items, nextOffset, scanned });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get("/api/admin/fix/poets", requireWikiAdmin, async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 1000, 1), 2000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    try {
      const { items, nextOffset, scanned } = await collectFlaggedPoets(limit, offset);
      res.json({ items, nextOffset, scanned });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get("/api/admin/users", requireAdmin, (req, res) => {
    try {
      const rows = getDb()
        .prepare(
          "SELECT uid, username, email, role, is_announcement_admin, is_super_admin, is_wiki_admin, is_game_admin, score, avatar, created_at FROM users ORDER BY uid ASC"
        )
        .all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post("/api/admin/users/:uid/announcement-admin", requireSuperAdmin, (req, res) => {
    const { uid } = req.params;
    const { value } = req.body as { value?: boolean | number };
    if (value === undefined || value === null) return res.status(400).json({ error: "缺少 value" });
    const flag = Number(value) ? 1 : 0;
    try {
      const db = getDb();
      const info = db.prepare("UPDATE users SET is_announcement_admin = ?, token_version = token_version + 1 WHERE uid = ?").run(flag, uid);
      if (!info.changes) return res.status(404).json({ error: "用户不存在" });
      res.json({ ok: true, value: flag });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post("/api/admin/users/:uid/super-admin", requireSuperAdmin, (req, res) => {
    const { uid } = req.params;
    const { value } = req.body as { value?: boolean | number };
    if (value === undefined || value === null) return res.status(400).json({ error: "缺少 value" });
    const flag = Number(value) ? 1 : 0;
    try {
      const db = getDb();
      const info = db.prepare("UPDATE users SET is_super_admin = ?, token_version = token_version + 1 WHERE uid = ?").run(flag, uid);
      if (!info.changes) return res.status(404).json({ error: "用户不存在" });
      res.json({ ok: true, value: flag });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post("/api/admin/users/:uid/wiki-admin", requireSuperAdmin, (req, res) => {
    const { uid } = req.params;
    const { value } = req.body as { value?: boolean | number };
    if (value === undefined || value === null) return res.status(400).json({ error: "缺少 value" });
    const flag = Number(value) ? 1 : 0;
    try {
      const db = getDb();
      const info = db.prepare("UPDATE users SET is_wiki_admin = ?, token_version = token_version + 1 WHERE uid = ?").run(flag, uid);
      if (!info.changes) return res.status(404).json({ error: "用户不存在" });
      res.json({ ok: true, value: flag });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post("/api/admin/users/:uid/game-admin", requireSuperAdmin, (req, res) => {
    const { uid } = req.params;
    const { value } = req.body as { value?: boolean | number };
    if (value === undefined || value === null) return res.status(400).json({ error: "缺少 value" });
    const flag = Number(value) ? 1 : 0;
    try {
      const db = getDb();
      const info = db.prepare("UPDATE users SET is_game_admin = ?, token_version = token_version + 1 WHERE uid = ?").run(flag, uid);
      if (!info.changes) return res.status(404).json({ error: "用户不存在" });
      res.json({ ok: true, value: flag });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get("/api/admin/users/:uid", requireAdmin, (req, res) => {
    try {
      const { uid } = req.params;
      const row = getDb()
        .prepare(
          "SELECT uid, username, email, role, is_announcement_admin, is_super_admin, is_wiki_admin, is_game_admin, token_version, score, avatar, created_at FROM users WHERE uid = ?"
        )
        .get(uid);
      if (!row) return res.status(404).json({ error: "用户不存在" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.put("/api/admin/users/:uid", requireSuperAdmin, async (req, res) => {
    const { uid } = req.params;
    const { username, email, password, score, avatar } = req.body as { username?: string; email?: string; password?: string; score?: number; avatar?: string };
    if (!username && !email && !password && score === undefined && avatar === undefined) return res.status(400).json({ error: "缺少更新内容" });
    if (username && username.length > 50) return res.status(400).json({ error: "用户名长度不能超过50" });
    try {
      const db = getDb();
      const exists = db.prepare("SELECT 1 FROM users WHERE uid = ?").get(uid);
      if (!exists) return res.status(404).json({ error: "用户不存在" });
      if (username) {
        const dup = db.prepare("SELECT 1 FROM users WHERE username = ? AND uid <> ?").get(username, uid);
        if (dup) return res.status(400).json({ error: "用户名已存在" });
      }
      if (email) {
        const dup = db.prepare("SELECT 1 FROM users WHERE email = ? AND uid <> ?").get(email, uid);
        if (dup) return res.status(400).json({ error: "邮箱已存在" });
      }
      const fields: string[] = [];
      const params: any[] = [];
      if (username) {
        fields.push("username = ?");
        params.push(username);
      }
      if (email) {
        fields.push("email = ?");
        params.push(email);
      }
      if (password) {
        const hash = await import("bcryptjs").then((m) => m.default.hash(password, 10));
        fields.push("password_hash = ?");
        params.push(hash);
      }
      if (score !== undefined && score !== null) {
        if (Number.isNaN(Number(score))) return res.status(400).json({ error: "积分必须是数字" });
        fields.push("score = ?");
        params.push(Number(score));
      }
      if (avatar !== undefined) {
        fields.push("avatar = ?");
        params.push(avatar);
      }
      fields.push("token_version = token_version + 1");
      const sql = `UPDATE users SET ${fields.join(", ")} WHERE uid = ?`;
      params.push(uid);
      db.prepare(sql).run(...params);
      const row = db
        .prepare(
          "SELECT uid, username, email, role, is_announcement_admin, is_super_admin, is_wiki_admin, token_version, created_at FROM users WHERE uid = ?"
        )
        .get(uid);
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post("/api/admin/users/:uid/role", requireSuperAdmin, (req, res) => {
    const { uid } = req.params;
    const { role } = req.body as { role?: number };
    if (role === undefined || role === null || Number.isNaN(Number(role))) {
      return res.status(400).json({ error: "role 必须是数字" });
    }
    try {
      const db = getDb();
      const info = db.prepare("UPDATE users SET role = ?, token_version = token_version + 1 WHERE uid = ?").run(Number(role), uid);
      if (!info.changes) return res.status(404).json({ error: "用户不存在" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get("/api/admin/notice", requireAdmin, (req, res) => {
    try {
      const row = getDb().prepare("SELECT content, updated_at FROM admin_notice WHERE id = 1").get();
      res.json(row || { content: "", updated_at: null });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.put("/api/admin/notice", requireAdmin, (req, res) => {
    const { content } = req.body as { content?: string };
    if (content === undefined || content === null) return res.status(400).json({ error: "缺少内容" });
    try {
      const db = getDb();
      db.prepare("UPDATE admin_notice SET content = ?, updated_at = ? WHERE id = 1").run(content, new Date().toISOString());
      const row = db.prepare("SELECT content, updated_at FROM admin_notice WHERE id = 1").get();
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}

