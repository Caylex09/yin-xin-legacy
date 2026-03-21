import { Router } from "express";
import { getDb } from "./db";
import { requireAnnouncementAdmin } from "./middleware";

export function createAnnouncementApiRouter(): Router {
  const router = Router();

  router.get("/api/announcements", (req, res) => {
    try {
      const includeDeleted = req.query.includeDeleted === "1";
      const page = parseInt(req.query.page as string);
      const limit = parseInt(req.query.limit as string) || 20;

      const baseQuery = `
        FROM announcements
        ${includeDeleted ? "" : "WHERE deleted = 0"}
      `;

      const db = getDb();

      if (!isNaN(page) && page > 0) {
        const offset = (page - 1) * limit;
        const totalRow = db.prepare(`SELECT COUNT(*) as total ${baseQuery}`).get() as { total: number };
        const rows = db.prepare(`
          SELECT id, title, content, created_by, created_at, updated_at, deleted
          ${baseQuery}
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `).all(limit, offset);

        const summaries = rows.map((row: any) => ({
          ...row,
          summary: row.content && row.content.length > 200
            ? row.content.substring(0, 200) + "..."
            : row.content,
        }));

        return res.json({
          items: summaries,
          total: totalRow.total,
          page,
          totalPages: Math.ceil(totalRow.total / limit)
        });
      } else {
        const rows = db
          .prepare(
            `SELECT id, title, content, created_by, created_at, updated_at, deleted
             ${baseQuery}
             ORDER BY created_at DESC`
          )
          .all();
        // 在前端生成摘要，避免 SQL 复杂性
        const summaries = rows.map((row: any) => ({
          ...row,
          summary: row.content && row.content.length > 200
            ? row.content.substring(0, 200) + "..."
            : row.content,
        }));
        res.json(summaries);
      }
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get("/api/announcements/:id", (req, res) => {
    try {
      const { id } = req.params;
      const row = getDb()
        .prepare("SELECT id, title, content, created_by, created_at, updated_at, deleted FROM announcements WHERE id = ?")
        .get(id);
      if (!row) return res.status(404).json({ error: "公告不存在" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post("/api/announcements", requireAnnouncementAdmin, (req, res) => {
    const { title, content } = req.body as { title?: string; content?: string };
    if (!title || !content) return res.status(400).json({ error: "标题和内容必填" });
    const now = new Date().toISOString();
    try {
      const db = getDb();
      const info = db
        .prepare(
          "INSERT INTO announcements (title, content, created_by, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, 0)"
        )
        .run(title, content, (req as any).uid, now, now);
      const row = db
        .prepare("SELECT id, title, content, created_by, created_at, updated_at, deleted FROM announcements WHERE id = ?")
        .get(info.lastInsertRowid as number);
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.put("/api/announcements/:id", requireAnnouncementAdmin, (req, res) => {
    const { id } = req.params;
    const { title, content } = req.body as { title?: string; content?: string };
    if (!title && !content) return res.status(400).json({ error: "缺少内容" });
    const now = new Date().toISOString();
    try {
      const db = getDb();
      const row = db.prepare("SELECT id FROM announcements WHERE id = ?").get(id);
      if (!row) return res.status(404).json({ error: "不存在" });
      db.prepare(
        "UPDATE announcements SET title = COALESCE(?, title), content = COALESCE(?, content), updated_at = ? WHERE id = ?"
      ).run(title ?? null, content ?? null, now, id);
      const updated = db
        .prepare("SELECT id, title, content, created_by, created_at, updated_at, deleted FROM announcements WHERE id = ?")
        .get(id);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.delete("/api/announcements/:id", requireAnnouncementAdmin, (req, res) => {
    const { id } = req.params;
    const now = new Date().toISOString();
    try {
      const db = getDb();
      const row = db.prepare("SELECT id FROM announcements WHERE id = ?").get(id);
      if (!row) return res.status(404).json({ error: "不存在" });
      db.prepare("UPDATE announcements SET deleted = 1, updated_at = ? WHERE id = ?").run(now, id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post("/api/announcements/:id/restore", requireAnnouncementAdmin, (req, res) => {
    const { id } = req.params;
    const now = new Date().toISOString();
    try {
      const db = getDb();
      const row = db.prepare("SELECT id FROM announcements WHERE id = ?").get(id);
      if (!row) return res.status(404).json({ error: "不存在" });
      db.prepare("UPDATE announcements SET deleted = 0, updated_at = ? WHERE id = ?").run(now, id);
      const restored = db
        .prepare("SELECT id, title, content, created_by, created_at, updated_at, deleted FROM announcements WHERE id = ?")
        .get(id);
      res.json(restored);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}

