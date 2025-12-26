import { Router, Request, Response } from "express";
import { getDb } from "./db";
import { getUserPublicByUid } from "./auth";
import { verifyCode } from "./email";
import { requireLogin } from "./middleware";
import { gravatar } from "./utils";

export function createUserApiRouter(): Router {
  const router = Router();

  router.get("/api/user/uid/:uid", (req, res) => {
    try {
      const uidNum = Number(req.params.uid);
      if (Number.isNaN(uidNum)) return res.status(400).json({ error: "uid 无效" });
      const profile = getUserPublicByUid(uidNum);
      res.json(profile);
    } catch (e) {
      res.status(404).json({ error: (e as Error).message });
    }
  });

  router.get("/api/about/admins", (_req, res) => {
    try {
      const rows = getDb()
        .prepare(
          `SELECT uid, username, role, is_announcement_admin, is_super_admin, is_wiki_admin, score, created_at
           FROM users
           WHERE role > 0 OR is_super_admin = 1 OR is_announcement_admin = 1 OR is_wiki_admin = 1
           ORDER BY is_super_admin DESC, role DESC, score DESC, uid ASC`
        )
        .all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get("/api/rankings", (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    try {
      const db = getDb();
      const totalRow = db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
      const rows = db
        .prepare("SELECT uid, username, score, avatar, created_at FROM users ORDER BY score DESC, uid ASC LIMIT ? OFFSET ?")
        .all(limit, offset);
      res.json({ total: totalRow.c || 0, limit, offset, list: rows });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get("/api/rankings/:uid", (req, res) => {
    const uid = Number(req.params.uid);
    if (Number.isNaN(uid)) return res.status(400).json({ error: "uid 无效" });
    try {
      const db = getDb();
      const user = db
        .prepare("SELECT uid, score FROM users WHERE uid = ?")
        .get(uid) as { uid: number; score: number } | undefined;
      if (!user) return res.status(404).json({ error: "用户不存在" });
      const totalRow = db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
      const betterRow = db.prepare("SELECT COUNT(*) AS c FROM users WHERE score > ?").get(user.score) as { c: number };
      const rank = (betterRow?.c || 0) + 1; // 严格大于的人数 + 1，可出现并列名次
      res.json({ uid, rank, score: user.score, total: totalRow.c || 0 });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post("/api/profile/update-name", requireLogin, (req, res) => {
    const { username } = req.body as { username?: string };
    if (!username || username.trim().length < 3) return res.status(400).json({ error: "用户名至少 3 个字符" });
    if (username.length > 50) return res.status(400).json({ error: "用户名长度不能超过50" });
    const now = new Date();
    const db = getDb();
    try {
      const existing = db.prepare("SELECT 1 FROM users WHERE username = ?").get(username);
      if (existing) return res.status(400).json({ error: "用户名已存在" });
      const row = db
        .prepare("SELECT username_changed_at FROM users WHERE uid = ?")
        .get((req as any).uid) as { username_changed_at?: string } | undefined;
      if (!row) return res.status(404).json({ error: "用户不存在" });
      if (row.username_changed_at) {
        const last = new Date(row.username_changed_at);
        const diff = now.getTime() - last.getTime();
        if (!Number.isNaN(diff) && diff < 7 * 24 * 3600 * 1000) {
          const next = new Date(last.getTime() + 7 * 24 * 3600 * 1000).toISOString();
          return res.status(400).json({ error: "一周内只能改一次昵称", nextAllowedAt: next });
        }
      }
      db.prepare(
        "UPDATE users SET username = ?, username_changed_at = ?, token_version = token_version + 1 WHERE uid = ?"
      ).run(username, now.toISOString(), (req as any).uid);
      res.json({ ok: true, username, nextAllowedAt: new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString() });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post("/api/profile/update-password", requireLogin, async (req, res) => {
    const { oldPassword, newPassword } = req.body as { oldPassword?: string; newPassword?: string };
    if (!oldPassword || !newPassword) return res.status(400).json({ error: "缺少密码" });
    if (newPassword.length < 6) return res.status(400).json({ error: "新密码至少 6 位" });
    try {
      const db = getDb();
      const row = db.prepare("SELECT password_hash FROM users WHERE uid = ?").get((req as any).uid) as { password_hash: string } | undefined;
      if (!row) return res.status(404).json({ error: "用户不存在" });
      const ok = await import("bcryptjs").then((m) => m.default.compare(oldPassword, row.password_hash));
      if (!ok) return res.status(400).json({ error: "原密码错误" });
      const hash = await import("bcryptjs").then((m) => m.default.hash(newPassword, 10));
      db.prepare("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE uid = ?").run(hash, (req as any).uid);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post("/api/profile/update-email", requireLogin, (req, res) => {
    const { email, code, oldEmailCode } = req.body as { email?: string; code?: string; oldEmailCode?: string };
    if (!email || !code) return res.status(400).json({ error: "新邮箱和验证码必填" });
    if (!oldEmailCode) return res.status(400).json({ error: "原邮箱验证码必填" });
    try {
      const db = getDb();
      // 获取当前用户的邮箱
      const currentUser = db.prepare("SELECT email FROM users WHERE uid = ?").get((req as any).uid) as { email: string } | undefined;
      if (!currentUser || !currentUser.email) return res.status(400).json({ error: "未找到当前邮箱" });

      // 验证原邮箱验证码
      const oldOk = verifyCode(currentUser.email, oldEmailCode);
      if (!oldOk) return res.status(400).json({ error: "原邮箱验证码错误或已过期" });

      // 检查新邮箱是否已被使用
      const dup = db.prepare("SELECT 1 FROM users WHERE email = ? AND uid <> ?").get(email, (req as any).uid);
      if (dup) return res.status(400).json({ error: "新邮箱已被使用" });

      // 验证新邮箱验证码
      const newOk = verifyCode(email, code);
      if (!newOk) return res.status(400).json({ error: "新邮箱验证码错误或已过期" });

      // 更新邮箱
      const avatar = gravatar(email);
      db.prepare("UPDATE users SET email = ?, avatar = ?, token_version = token_version + 1 WHERE uid = ?").run(
        email,
        avatar,
        (req as any).uid
      );
      res.json({ ok: true, email, avatar });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}

