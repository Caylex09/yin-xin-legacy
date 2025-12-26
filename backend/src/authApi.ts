import { Router, Request, Response } from "express";
import { sendVerifyCode } from "./email";
import { loginUser, registerUser, verifyToken, getUserProfile } from "./auth";
import { assertTokenFresh } from "./middleware";

export function createAuthApiRouter(): Router {
  const router = Router();

  router.post("/api/auth/send-code", async (req, res) => {
    const { email } = req.body as { email?: string };
    if (!email) return res.status(400).json({ error: "邮箱必填" });
    try {
      await sendVerifyCode(email.trim());
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post("/api/auth/register", async (req, res) => {
    const { username, password, email, code } = req.body as { username?: string; password?: string; email?: string; code?: string };
    if (!username || !password || !email || !code) {
      return res.status(400).json({ error: "用户名、邮箱、验证码、密码必填" });
    }
    try {
      const result = await registerUser(username.trim(), email.trim(), password, code.trim());
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      return res.status(400).json({ error: "用户名和密码必填" });
    }
    try {
      const result = await loginUser(username.trim(), password);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.get("/api/auth/profile", (req, res) => {
    try {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!token) return res.status(401).json({ error: "缺少 token" });
      const payload = verifyToken(token) as { sub: number; tokenVersion?: number };
      assertTokenFresh(payload.sub, payload.tokenVersion);
      const profile = getUserProfile(payload.sub);
      res.json(profile);
    } catch (e) {
      res.status(401).json({ error: (e as Error).message });
    }
  });

  return router;
}

