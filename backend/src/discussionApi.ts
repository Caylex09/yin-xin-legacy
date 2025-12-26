import { Router } from "express";
import { getDb } from "./db";
import { requireLogin } from "./middleware";
import { verifyToken } from "./auth";

export function createDiscussionApiRouter(): Router {
  const router = Router();

  // 获取讨论列表
  router.get("/api/discussions", (req, res) => {
    try {
      const includeDeleted = req.query.includeDeleted === "1";
      const rows = getDb()
        .prepare(
          `SELECT d.id, d.title, d.content, d.created_by, d.created_at, d.updated_at, d.deleted,
                  u.username as creator_username, u.avatar as creator_avatar,
                  (SELECT COUNT(*) FROM discussion_replies WHERE discussion_id = d.id AND deleted = 0) as reply_count
           FROM discussions d
           LEFT JOIN users u ON d.created_by = u.uid
           ${includeDeleted ? "" : "WHERE d.deleted = 0"}
           ORDER BY d.updated_at DESC`
        )
        .all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 获取讨论详情
  router.get("/api/discussions/:id", (req, res) => {
    try {
      const { id } = req.params;
      const row = getDb()
        .prepare(
          `SELECT d.id, d.title, d.content, d.created_by, d.created_at, d.updated_at, d.deleted,
                  u.username as creator_username, u.avatar as creator_avatar
           FROM discussions d
           LEFT JOIN users u ON d.created_by = u.uid
           WHERE d.id = ?`
        )
        .get(id);
      if (!row) return res.status(404).json({ error: "讨论不存在" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 创建讨论
  router.post("/api/discussions", requireLogin, (req, res) => {
    const { title, content } = req.body as { title?: string; content?: string };
    if (!title || !content) return res.status(400).json({ error: "标题和内容必填" });
    const now = new Date().toISOString();
    try {
      const db = getDb();
      const info = db
        .prepare("INSERT INTO discussions (title, content, created_by, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, 0)")
        .run(title, content, (req as any).uid, now, now);
      const row = db
        .prepare(
          `SELECT d.id, d.title, d.content, d.created_by, d.created_at, d.updated_at, d.deleted,
                  u.username as creator_username, u.avatar as creator_avatar
           FROM discussions d
           LEFT JOIN users u ON d.created_by = u.uid
           WHERE d.id = ?`
        )
        .get(info.lastInsertRowid as number);
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 更新讨论
  router.put("/api/discussions/:id", requireLogin, (req, res) => {
    const { id } = req.params;
    const { title, content } = req.body as { title?: string; content?: string };
    if (!title && !content) return res.status(400).json({ error: "缺少内容" });
    const now = new Date().toISOString();
    try {
      const db = getDb();
      const row = db.prepare("SELECT id, created_by FROM discussions WHERE id = ?").get(id) as { id: number; created_by: number } | undefined;
      if (!row) return res.status(404).json({ error: "讨论不存在" });
      
      // 检查权限：创建者或 superadmin 可以编辑
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      let isSuperAdmin = false;
      if (token) {
        try {
          const payload = verifyToken(token) as { isSuperAdmin?: number };
          isSuperAdmin = !!payload.isSuperAdmin;
        } catch {
          // ignore
        }
      }
      if (row.created_by !== (req as any).uid && !isSuperAdmin) {
        return res.status(403).json({ error: "只能编辑自己的讨论" });
      }
      db.prepare("UPDATE discussions SET title = COALESCE(?, title), content = COALESCE(?, content), updated_at = ? WHERE id = ?").run(
        title ?? null,
        content ?? null,
        now,
        id
      );
      const updated = db
        .prepare(
          `SELECT d.id, d.title, d.content, d.created_by, d.created_at, d.updated_at, d.deleted,
                  u.username as creator_username, u.avatar as creator_avatar
           FROM discussions d
           LEFT JOIN users u ON d.created_by = u.uid
           WHERE d.id = ?`
        )
        .get(id);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 删除讨论
  router.delete("/api/discussions/:id", requireLogin, (req, res) => {
    const { id } = req.params;
    const now = new Date().toISOString();
    try {
      const db = getDb();
      const row = db.prepare("SELECT id, created_by FROM discussions WHERE id = ?").get(id) as { id: number; created_by: number } | undefined;
      if (!row) return res.status(404).json({ error: "讨论不存在" });
      
      // 检查权限：创建者或 superadmin 可以删除
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      let isSuperAdmin = false;
      if (token) {
        try {
          const payload = verifyToken(token) as { isSuperAdmin?: number };
          isSuperAdmin = !!payload.isSuperAdmin;
        } catch {
          // ignore
        }
      }
      if (row.created_by !== (req as any).uid && !isSuperAdmin) {
        return res.status(403).json({ error: "只能删除自己的讨论" });
      }
      db.prepare("UPDATE discussions SET deleted = 1, updated_at = ? WHERE id = ?").run(now, id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 获取讨论的回复列表
  router.get("/api/discussions/:id/replies", (req, res) => {
    try {
      const { id } = req.params;
      const includeDeleted = req.query.includeDeleted === "1";
      const rows = getDb()
        .prepare(
          `SELECT r.id, r.discussion_id, r.content, r.created_by, r.created_at, r.updated_at, r.deleted,
                  u.username as creator_username, u.avatar as creator_avatar
           FROM discussion_replies r
           LEFT JOIN users u ON r.created_by = u.uid
           WHERE r.discussion_id = ? ${includeDeleted ? "" : "AND r.deleted = 0"}
           ORDER BY r.created_at ASC`
        )
        .all(id);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 创建回复
  router.post("/api/discussions/:id/replies", requireLogin, (req, res) => {
    const { id } = req.params;
    const { content } = req.body as { content?: string };
    if (!content || !content.trim()) return res.status(400).json({ error: "回复内容必填" });
    const now = new Date().toISOString();
    try {
      const db = getDb();
      // 检查讨论是否存在
      const discussion = db.prepare("SELECT id FROM discussions WHERE id = ? AND deleted = 0").get(id);
      if (!discussion) return res.status(404).json({ error: "讨论不存在或已删除" });

      const info = db
        .prepare("INSERT INTO discussion_replies (discussion_id, content, created_by, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, 0)")
        .run(id, content.trim(), (req as any).uid, now, now);

      // 更新讨论的更新时间
      db.prepare("UPDATE discussions SET updated_at = ? WHERE id = ?").run(now, id);

      const row = db
        .prepare(
          `SELECT r.id, r.discussion_id, r.content, r.created_by, r.created_at, r.updated_at, r.deleted,
                  u.username as creator_username, u.avatar as creator_avatar
           FROM discussion_replies r
           LEFT JOIN users u ON r.created_by = u.uid
           WHERE r.id = ?`
        )
        .get(info.lastInsertRowid as number);
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 更新回复
  router.put("/api/discussions/:id/replies/:replyId", requireLogin, (req, res) => {
    const { id, replyId } = req.params;
    const { content } = req.body as { content?: string };
    if (!content) return res.status(400).json({ error: "回复内容必填" });
    const now = new Date().toISOString();
    try {
      const db = getDb();
      const row = db
        .prepare("SELECT id, created_by, discussion_id FROM discussion_replies WHERE id = ? AND discussion_id = ?")
        .get(replyId, id) as { id: number; created_by: number; discussion_id: number } | undefined;
      if (!row) return res.status(404).json({ error: "回复不存在" });
      
      // 检查权限：创建者或 superadmin 可以编辑
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      let isSuperAdmin = false;
      if (token) {
        try {
          const payload = verifyToken(token) as { isSuperAdmin?: number };
          isSuperAdmin = !!payload.isSuperAdmin;
        } catch {
          // ignore
        }
      }
      if (row.created_by !== (req as any).uid && !isSuperAdmin) {
        return res.status(403).json({ error: "只能编辑自己的回复" });
      }
      db.prepare("UPDATE discussion_replies SET content = ?, updated_at = ? WHERE id = ?").run(content.trim(), now, replyId);
      // 更新讨论的更新时间
      db.prepare("UPDATE discussions SET updated_at = ? WHERE id = ?").run(now, id);
      const updated = db
        .prepare(
          `SELECT r.id, r.discussion_id, r.content, r.created_by, r.created_at, r.updated_at, r.deleted,
                  u.username as creator_username, u.avatar as creator_avatar
           FROM discussion_replies r
           LEFT JOIN users u ON r.created_by = u.uid
           WHERE r.id = ?`
        )
        .get(replyId);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 删除回复
  router.delete("/api/discussions/:id/replies/:replyId", requireLogin, (req, res) => {
    const { id, replyId } = req.params;
    const now = new Date().toISOString();
    try {
      const db = getDb();
      const row = db
        .prepare("SELECT id, created_by, discussion_id FROM discussion_replies WHERE id = ? AND discussion_id = ?")
        .get(replyId, id) as { id: number; created_by: number; discussion_id: number } | undefined;
      if (!row) return res.status(404).json({ error: "回复不存在" });
      
      // 检查权限：创建者或 superadmin 可以删除
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      let isSuperAdmin = false;
      if (token) {
        try {
          const payload = verifyToken(token) as { isSuperAdmin?: number };
          isSuperAdmin = !!payload.isSuperAdmin;
        } catch {
          // ignore
        }
      }
      if (row.created_by !== (req as any).uid && !isSuperAdmin) {
        return res.status(403).json({ error: "只能删除自己的回复" });
      }
      db.prepare("UPDATE discussion_replies SET deleted = 1, updated_at = ? WHERE id = ?").run(now, replyId);
      // 更新讨论的更新时间
      db.prepare("UPDATE discussions SET updated_at = ? WHERE id = ?").run(now, id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}

