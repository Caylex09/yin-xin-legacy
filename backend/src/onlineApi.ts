import { Router, Request, Response } from "express";
import { verifyToken } from "./auth";
import { assertTokenFresh } from "./middleware";

// 在线用户心跳（内存，5 分钟过期）
export const onlineUsers = new Map<number, { username?: string; last: number }>();
export const ONLINE_TTL = 5 * 60 * 1000;

// 清理过期用户
export function startOnlineUserCleanup() {
  setInterval(() => {
    const now = Date.now();
    for (const [uid, info] of onlineUsers.entries()) {
      if (now - info.last > ONLINE_TTL) onlineUsers.delete(uid);
    }
  }, 60 * 1000);
}

export function createOnlineApiRouter(): Router {
  const router = Router();

  router.post("/api/online/ping", (req, res) => {
    try {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!token) return res.status(401).json({ error: "缺少 token" });
      const payload = verifyToken(token) as { sub: number; username?: string; tokenVersion?: number };
      assertTokenFresh(payload.sub, payload.tokenVersion);
      onlineUsers.set(payload.sub, { username: payload.username, last: Date.now() });
      res.json({ ok: true });
    } catch (e) {
      res.status(401).json({ error: (e as Error).message });
    }
  });

  router.get("/api/online/list", (_req, res) => {
    const now = Date.now();
    const list = Array.from(onlineUsers.entries())
      .filter(([, info]) => now - info.last <= ONLINE_TTL)
      .map(([uid, info]) => ({ uid, username: info.username, last: info.last }))
      .sort((a, b) => b.last - a.last); // 按上线时间倒序
    res.json(list);
  });

  return router;
}

