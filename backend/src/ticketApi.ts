import { Router } from "express";
import { getDb } from "./db";
import { requireLogin, requireAdmin } from "./middleware";
import { verifyToken } from "./auth";

export function createTicketApiRouter(): Router {
  const router = Router();

  // 获取工单列表
  router.get("/api/tickets", (req, res) => {
    try {
      const status = req.query.status as string | undefined; // 'open', 'closed', 'resolved', 'rejected', 'duplicate'
      const validStatuses = ["open", "resolved", "rejected", "duplicate"];
      const page = parseInt(req.query.page as string);
      const limit = parseInt(req.query.limit as string) || 20;

      const hasStatusFilter = status && validStatuses.includes(status);
      const baseQuery = `
        FROM tickets t
        LEFT JOIN users u ON t.created_by = u.uid
        LEFT JOIN users cu ON t.closed_by = cu.uid
        ${hasStatusFilter ? "WHERE t.status = ?" : ""}
      `;

      const db = getDb();

      if (!isNaN(page) && page > 0) {
        const offset = (page - 1) * limit;
        const totalRow = hasStatusFilter
          ? db.prepare(`SELECT COUNT(*) as total ${baseQuery}`).get(status) as { total: number }
          : db.prepare(`SELECT COUNT(*) as total ${baseQuery}`).get() as { total: number };

        const rows = hasStatusFilter
          ? db.prepare(`
              SELECT t.id, t.title, t.content, t.created_by, t.created_at, t.updated_at, t.status, t.closed_by, t.closed_at,
                     u.username as creator_username, u.avatar as creator_avatar,
                     cu.username as closer_username,
                     (SELECT COUNT(*) FROM ticket_replies WHERE ticket_id = t.id AND deleted = 0) as reply_count
              ${baseQuery}
              ORDER BY t.updated_at DESC
              LIMIT ? OFFSET ?
            `).all(status, limit, offset)
          : db.prepare(`
              SELECT t.id, t.title, t.content, t.created_by, t.created_at, t.updated_at, t.status, t.closed_by, t.closed_at,
                     u.username as creator_username, u.avatar as creator_avatar,
                     cu.username as closer_username,
                     (SELECT COUNT(*) FROM ticket_replies WHERE ticket_id = t.id AND deleted = 0) as reply_count
              ${baseQuery}
              ORDER BY t.updated_at DESC
              LIMIT ? OFFSET ?
            `).all(limit, offset);

        return res.json({
          items: rows,
          total: totalRow.total,
          page,
          totalPages: Math.ceil(totalRow.total / limit)
        });
      } else {
        let rows;
        if (hasStatusFilter) {
          rows = db
            .prepare(
              `SELECT t.id, t.title, t.content, t.created_by, t.created_at, t.updated_at, t.status, t.closed_by, t.closed_at,
                      u.username as creator_username, u.avatar as creator_avatar,
                      cu.username as closer_username,
                      (SELECT COUNT(*) FROM ticket_replies WHERE ticket_id = t.id AND deleted = 0) as reply_count
               ${baseQuery}
               ORDER BY t.updated_at DESC`
            )
            .all(status);
        } else {
          rows = db
            .prepare(
              `SELECT t.id, t.title, t.content, t.created_by, t.created_at, t.updated_at, t.status, t.closed_by, t.closed_at,
                      u.username as creator_username, u.avatar as creator_avatar,
                      cu.username as closer_username,
                      (SELECT COUNT(*) FROM ticket_replies WHERE ticket_id = t.id AND deleted = 0) as reply_count
               ${baseQuery}
               ORDER BY t.updated_at DESC`
            )
            .all();
        }
        res.json(rows);
      }
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 获取工单详情
  router.get("/api/tickets/:id", (req, res) => {
    try {
      const { id } = req.params;
      const row = getDb()
        .prepare(
          `SELECT t.id, t.title, t.content, t.created_by, t.created_at, t.updated_at, t.status, t.closed_by, t.closed_at,
                  u.username as creator_username, u.avatar as creator_avatar,
                  cu.username as closer_username
           FROM tickets t
           LEFT JOIN users u ON t.created_by = u.uid
           LEFT JOIN users cu ON t.closed_by = cu.uid
           WHERE t.id = ?`
        )
        .get(id);
      if (!row) return res.status(404).json({ error: "工单不存在" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 创建工单
  router.post("/api/tickets", requireLogin, (req, res) => {
    const { title, content } = req.body as { title?: string; content?: string };
    if (!title || !content) return res.status(400).json({ error: "标题和内容必填" });
    const now = new Date().toISOString();
    try {
      const db = getDb();
      const info = db
        .prepare("INSERT INTO tickets (title, content, created_by, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?, 'open')")
        .run(title, content, (req as any).uid, now, now);
      const row = db
        .prepare(
          `SELECT t.id, t.title, t.content, t.created_by, t.created_at, t.updated_at, t.status, t.closed_by, t.closed_at,
                  u.username as creator_username, u.avatar as creator_avatar,
                  cu.username as closer_username
           FROM tickets t
           LEFT JOIN users u ON t.created_by = u.uid
           LEFT JOIN users cu ON t.closed_by = cu.uid
           WHERE t.id = ?`
        )
        .get(info.lastInsertRowid as number);
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 更新工单（创建者或 superadmin 可以更新）
  router.put("/api/tickets/:id", requireLogin, (req, res) => {
    const { id } = req.params;
    const { title, content } = req.body as { title?: string; content?: string };
    if (!title && !content) return res.status(400).json({ error: "缺少内容" });
    const now = new Date().toISOString();
    try {
      const db = getDb();
      const row = db.prepare("SELECT id, created_by, status FROM tickets WHERE id = ?").get(id) as {
        id: number;
        created_by: number;
        status: string;
      } | undefined;
      if (!row) return res.status(404).json({ error: "工单不存在" });

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
        return res.status(403).json({ error: "只能编辑自己的工单" });
      }
      // 只有创建者需要检查工单状态，superadmin 可以编辑任何状态的工单
      if (row.created_by === (req as any).uid && row.status !== "open") {
        return res.status(400).json({ error: "只能编辑未关闭的工单" });
      }
      db.prepare("UPDATE tickets SET title = COALESCE(?, title), content = COALESCE(?, content), updated_at = ? WHERE id = ?").run(
        title ?? null,
        content ?? null,
        now,
        id
      );
      const updated = db
        .prepare(
          `SELECT t.id, t.title, t.content, t.created_by, t.created_at, t.updated_at, t.status, t.closed_by, t.closed_at,
                  u.username as creator_username, u.avatar as creator_avatar,
                  cu.username as closer_username
           FROM tickets t
           LEFT JOIN users u ON t.created_by = u.uid
           LEFT JOIN users cu ON t.closed_by = cu.uid
           WHERE t.id = ?`
        )
        .get(id);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 管理员关闭工单（标记为已解决/不考虑/重复）
  router.post("/api/tickets/:id/close", requireAdmin, (req, res) => {
    const { id } = req.params;
    const { status } = req.body as { status?: string }; // 'resolved', 'rejected', 'duplicate'
    if (!status || !["resolved", "rejected", "duplicate"].includes(status)) {
      return res.status(400).json({ error: "状态必须是 resolved、rejected 或 duplicate" });
    }
    const now = new Date().toISOString();
    try {
      const db = getDb();
      const row = db.prepare("SELECT id, status FROM tickets WHERE id = ?").get(id);
      if (!row) return res.status(404).json({ error: "工单不存在" });
      db.prepare("UPDATE tickets SET status = ?, closed_by = ?, closed_at = ?, updated_at = ? WHERE id = ?").run(
        status,
        (req as any).uid,
        now,
        now,
        id
      );
      const updated = db
        .prepare(
          `SELECT t.id, t.title, t.content, t.created_by, t.created_at, t.updated_at, t.status, t.closed_by, t.closed_at,
                  u.username as creator_username, u.avatar as creator_avatar,
                  cu.username as closer_username
           FROM tickets t
           LEFT JOIN users u ON t.created_by = u.uid
           LEFT JOIN users cu ON t.closed_by = cu.uid
           WHERE t.id = ?`
        )
        .get(id);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 管理员重新打开工单
  router.post("/api/tickets/:id/reopen", requireAdmin, (req, res) => {
    const { id } = req.params;
    const now = new Date().toISOString();
    try {
      const db = getDb();
      const row = db.prepare("SELECT id, status FROM tickets WHERE id = ?").get(id);
      if (!row) return res.status(404).json({ error: "工单不存在" });
      db.prepare("UPDATE tickets SET status = 'open', closed_by = NULL, closed_at = NULL, updated_at = ? WHERE id = ?").run(now, id);
      const updated = db
        .prepare(
          `SELECT t.id, t.title, t.content, t.created_by, t.created_at, t.updated_at, t.status, t.closed_by, t.closed_at,
                  u.username as creator_username, u.avatar as creator_avatar,
                  cu.username as closer_username
           FROM tickets t
           LEFT JOIN users u ON t.created_by = u.uid
           LEFT JOIN users cu ON t.closed_by = cu.uid
           WHERE t.id = ?`
        )
        .get(id);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 获取工单的回复列表
  router.get("/api/tickets/:id/replies", (req, res) => {
    try {
      const { id } = req.params;
      const includeDeleted = req.query.includeDeleted === "1";
      const rows = getDb()
        .prepare(
          `SELECT r.id, r.ticket_id, r.content, r.created_by, r.created_at, r.updated_at, r.deleted,
                  u.username as creator_username, u.avatar as creator_avatar
           FROM ticket_replies r
           LEFT JOIN users u ON r.created_by = u.uid
           WHERE r.ticket_id = ? ${includeDeleted ? "" : "AND r.deleted = 0"}
           ORDER BY r.created_at ASC`
        )
        .all(id);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 创建回复
  router.post("/api/tickets/:id/replies", requireLogin, (req, res) => {
    const { id } = req.params;
    const { content } = req.body as { content?: string };
    if (!content || !content.trim()) return res.status(400).json({ error: "回复内容必填" });
    const now = new Date().toISOString();
    try {
      const db = getDb();
      // 检查工单是否存在
      const ticket = db.prepare("SELECT id FROM tickets WHERE id = ?").get(id);
      if (!ticket) return res.status(404).json({ error: "工单不存在" });

      const info = db
        .prepare("INSERT INTO ticket_replies (ticket_id, content, created_by, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, 0)")
        .run(id, content.trim(), (req as any).uid, now, now);

      // 更新工单的更新时间
      db.prepare("UPDATE tickets SET updated_at = ? WHERE id = ?").run(now, id);

      const row = db
        .prepare(
          `SELECT r.id, r.ticket_id, r.content, r.created_by, r.created_at, r.updated_at, r.deleted,
                  u.username as creator_username, u.avatar as creator_avatar
           FROM ticket_replies r
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
  router.put("/api/tickets/:id/replies/:replyId", requireLogin, (req, res) => {
    const { id, replyId } = req.params;
    const { content } = req.body as { content?: string };
    if (!content) return res.status(400).json({ error: "回复内容必填" });
    const now = new Date().toISOString();
    try {
      const db = getDb();
      const row = db
        .prepare("SELECT id, created_by, ticket_id FROM ticket_replies WHERE id = ? AND ticket_id = ?")
        .get(replyId, id) as { id: number; created_by: number; ticket_id: number } | undefined;
      if (!row) return res.status(404).json({ error: "回复不存在" });
      if (row.created_by !== (req as any).uid) {
        return res.status(403).json({ error: "只能编辑自己的回复" });
      }
      db.prepare("UPDATE ticket_replies SET content = ?, updated_at = ? WHERE id = ?").run(content.trim(), now, replyId);
      // 更新工单的更新时间
      db.prepare("UPDATE tickets SET updated_at = ? WHERE id = ?").run(now, id);
      const updated = db
        .prepare(
          `SELECT r.id, r.ticket_id, r.content, r.created_by, r.created_at, r.updated_at, r.deleted,
                  u.username as creator_username, u.avatar as creator_avatar
           FROM ticket_replies r
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
  router.delete("/api/tickets/:id/replies/:replyId", requireLogin, (req, res) => {
    const { id, replyId } = req.params;
    const now = new Date().toISOString();
    try {
      const db = getDb();
      const row = db
        .prepare("SELECT id, created_by, ticket_id FROM ticket_replies WHERE id = ? AND ticket_id = ?")
        .get(replyId, id) as { id: number; created_by: number; ticket_id: number } | undefined;
      if (!row) return res.status(404).json({ error: "回复不存在" });
      if (row.created_by !== (req as any).uid) {
        return res.status(403).json({ error: "只能删除自己的回复" });
      }
      db.prepare("UPDATE ticket_replies SET deleted = 1, updated_at = ? WHERE id = ?").run(now, replyId);
      // 更新工单的更新时间
      db.prepare("UPDATE tickets SET updated_at = ? WHERE id = ?").run(now, id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}

