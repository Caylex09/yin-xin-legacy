import { Request, Response } from "express";
import { verifyToken } from "./auth";
import { getDb } from "./db";

export function assertNotBanned(uid: number) {
  const row = getDb().prepare("SELECT role FROM users WHERE uid = ?").get(uid) as { role: number } | undefined;
  if (!row) throw new Error("用户不存在");
  if (row.role < 0) throw new Error("账号已封禁");
}

export function assertTokenFresh(sub: number, tokenVersion?: number) {
  const row = getDb()
    .prepare("SELECT token_version, role FROM users WHERE uid = ?")
    .get(sub) as { token_version: number; role: number } | undefined;
  if (!row) throw new Error("用户不存在");
  if (row.token_version !== tokenVersion) throw new Error("token 失效，请重新登录");
  if (row.role < 0) throw new Error("账号已封禁");
}

export function requireLogin(req: Request, res: Response, next: () => void) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return res.status(401).json({ error: "缺少 token" });
    const payload = verifyToken(token) as { sub: number; tokenVersion?: number };
    assertTokenFresh(payload.sub, payload.tokenVersion);
    (req as any).uid = payload.sub;
    next();
  } catch (e) {
    res.status(401).json({ error: (e as Error).message });
  }
}

export function requireAdmin(req: Request, res: Response, next: () => void) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return res.status(401).json({ error: "缺少 token" });
    const payload = verifyToken(token) as { role?: number; sub: number; tokenVersion?: number };
    assertTokenFresh(payload.sub, payload.tokenVersion);
    if (!payload.role || payload.role < 1) return res.status(403).json({ error: "没有权限" });
    (req as any).uid = payload.sub;
    next();
  } catch (e) {
    res.status(401).json({ error: (e as Error).message });
  }
}

export function requireSuperAdmin(req: Request, res: Response, next: () => void) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return res.status(401).json({ error: "缺少 token" });
    const payload = verifyToken(token) as { isSuperAdmin?: number; sub: number; role?: number; tokenVersion?: number };
    assertTokenFresh(payload.sub, payload.tokenVersion);
    if (!payload.isSuperAdmin) return res.status(403).json({ error: "没有权限" });
    (req as any).uid = payload.sub;
    next();
  } catch (e) {
    res.status(401).json({ error: (e as Error).message });
  }
}

export function requireWikiAdmin(req: Request, res: Response, next: () => void) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return res.status(401).json({ error: "缺少 token" });
    const payload = verifyToken(token) as { role?: number; isWikiAdmin?: number; sub: number; tokenVersion?: number };
    assertTokenFresh(payload.sub, payload.tokenVersion);
    if (!payload.role || payload.role < 1 || !payload.isWikiAdmin) return res.status(403).json({ error: "没有权限" });
    (req as any).uid = payload.sub;
    next();
  } catch (e) {
    res.status(401).json({ error: (e as Error).message });
  }
}

export function requireAnnouncementAdmin(req: Request, res: Response, next: () => void) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return res.status(401).json({ error: "缺少 token" });
    const payload = verifyToken(token) as { sub: number; isAnnouncementAdmin?: number; role?: number; tokenVersion?: number };
    assertTokenFresh(payload.sub, payload.tokenVersion);
    if (!payload.role || payload.role < 1) return res.status(403).json({ error: "没有权限" });
    if (!payload.isAnnouncementAdmin) return res.status(403).json({ error: "没有公告权限" });
    (req as any).uid = payload.sub;
    next();
  } catch (e) {
    res.status(401).json({ error: (e as Error).message });
  }
}

