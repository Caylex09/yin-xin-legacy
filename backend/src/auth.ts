import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { verifyCode } from "./email";
import { getDb } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export async function registerUser(username: string, email: string, password: string, code: string) {
  const db = getDb();
  if (username.length > 50) throw new Error("用户名长度不能超过50");
  const existing = db
    .prepare("SELECT 1 FROM users WHERE username = ? OR email = ?")
    .get(username, email) as { 1: number } | undefined;
  if (existing) throw new Error("用户名或邮箱已存在");

  const ok = verifyCode(email, code);
  if (!ok) throw new Error("验证码错误或已过期");

  const passwordHash = await bcrypt.hash(password, 10);
  const seqRow = db.prepare("SELECT COALESCE(MAX(uid),0) AS m FROM users").get() as { m: number };
  const uid = (seqRow?.m || 0) + 1;
  const avatar = gravatar(email);
  db.prepare(
    "INSERT INTO users (uid, username, email, password_hash, role, is_announcement_admin, is_super_admin, is_wiki_admin, is_game_admin, token_version, score, avatar, username_changed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(uid, username, email, passwordHash, 0, 0, 0, 0, 0, 0, 0, avatar, "", new Date().toISOString());

  const token = jwt.sign(
    {
      sub: uid,
      username,
      role: 0,
      isAnnouncementAdmin: 0,
      isSuperAdmin: 0,
      isWikiAdmin: 0,
      isGameAdmin: 0,
      tokenVersion: 0,
      avatar,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
  return { token, user: { uid, username, role: 0, isAnnouncementAdmin: 0, isSuperAdmin: 0, isWikiAdmin: 0, isGameAdmin: 0, avatar } };
}

export async function loginUser(username: string, password: string) {
  const db = getDb();
  const user = db
    .prepare("SELECT * FROM users WHERE username = ? OR email = ?")
    .get(username, username) as
    | {
        uid: number;
        username: string;
        email: string;
        password_hash: string;
        role: number;
        is_announcement_admin: number;
        is_super_admin: number;
        is_wiki_admin: number;
        is_game_admin: number;
        token_version: number;
        score: number;
        avatar: string;
        created_at: string;
      }
    | undefined;
  if (!user) throw new Error("用户不存在");
  if (user.role === -1) throw new Error("账号已封禁");
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new Error("密码错误");
  const token = jwt.sign(
    {
      sub: user.uid,
      username: user.username,
      role: user.role,
      isAnnouncementAdmin: user.is_announcement_admin,
      isSuperAdmin: user.is_super_admin,
      isWikiAdmin: user.is_wiki_admin,
      isGameAdmin: user.is_game_admin,
      tokenVersion: user.token_version,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
  return {
    token,
    user: {
      uid: user.uid,
      username: user.username,
      role: user.role,
      isAnnouncementAdmin: user.is_announcement_admin,
      isSuperAdmin: user.is_super_admin,
      isWikiAdmin: user.is_wiki_admin,
      isGameAdmin: user.is_game_admin,
      score: user.score,
      avatar: user.avatar,
    },
  };
}

export function verifyToken(token: string) {
  const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload | string;
  if (typeof payload === "string") throw new Error("无效 token");
  const sub = payload.sub;
  if (typeof sub !== "number") throw new Error("无效 token");
  return {
    sub,
    username: payload.username as string | undefined,
    role: payload.role as number | undefined,
    isAnnouncementAdmin: payload.isAnnouncementAdmin as number | undefined,
    isSuperAdmin: payload.isSuperAdmin as number | undefined,
    isWikiAdmin: payload.isWikiAdmin as number | undefined,
    isGameAdmin: payload.isGameAdmin as number | undefined,
    tokenVersion: payload.tokenVersion as number | undefined,
  };
}

export function getUserProfile(uid: number) {
  const db = getDb();
  const user = db
    .prepare(
      "SELECT uid, username, email, role, is_announcement_admin, is_super_admin, is_wiki_admin, is_game_admin, token_version, score, avatar, username_changed_at, created_at FROM users WHERE uid = ?"
    )
    .get(uid) as
    | {
        uid: number;
        username: string;
        email: string;
        role: number;
        is_announcement_admin: number;
        is_super_admin: number;
        is_wiki_admin: number;
        is_game_admin: number;
        token_version: number;
        score: number;
        avatar: string;
        username_changed_at: string;
        created_at: string;
      }
    | undefined;
  if (!user) throw new Error("用户不存在");
  return {
    uid: user.uid,
    username: user.username,
    email: user.email,
    role: user.role,
    isAnnouncementAdmin: user.is_announcement_admin,
    isSuperAdmin: user.is_super_admin,
    isWikiAdmin: user.is_wiki_admin,
    isGameAdmin: user.is_game_admin,
    tokenVersion: user.token_version,
    score: user.score,
    avatar: user.avatar,
    usernameChangedAt: user.username_changed_at,
    createdAt: user.created_at,
  };
}

export function getUserPublic(uid: number) {
  const db = getDb();
  const user = db
    .prepare(
      "SELECT uid, username, role, is_announcement_admin, is_super_admin, is_wiki_admin, is_game_admin, token_version, score, avatar, created_at FROM users WHERE uid = ?"
    )
    .get(uid) as
    | {
        uid: number;
        username: string;
        role: number;
        is_announcement_admin: number;
        is_super_admin: number;
        is_wiki_admin: number;
        is_game_admin: number;
        token_version: number;
        score: number;
        avatar: string;
        created_at: string;
      }
    | undefined;
  if (!user) throw new Error("用户不存在");
  return {
    uid: user.uid,
    username: user.username,
    role: user.role,
    isAnnouncementAdmin: user.is_announcement_admin,
    isSuperAdmin: user.is_super_admin,
    isWikiAdmin: user.is_wiki_admin,
    isGameAdmin: user.is_game_admin,
    tokenVersion: user.token_version,
    score: user.score,
    avatar: user.avatar,
    createdAt: user.created_at,
  };
}

function gravatar(email: string) {
  const normalized = (email || "").trim().toLowerCase();
  const hash = crypto.createHash("md5").update(normalized).digest("hex");
  return `https://cn.gravatar.com/avatar/${hash}?d=identicon&s=256`;
}

export function getUserPublicByUid(uid: number) {
  return getUserPublic(uid);
}

