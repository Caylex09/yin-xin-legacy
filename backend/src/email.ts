import nodemailer from "nodemailer";
import { getDb } from "./db";

function getMailConfig() {
  const MAIL_HOST = process.env.SMTP_HOST || "smtp.qq.com";
  const MAIL_PORT = Number(process.env.SMTP_PORT || 465);
  const MAIL_USER = process.env.SMTP_USER || "";
  const MAIL_PASS = process.env.SMTP_PASS || "";
  const MAIL_FROM = process.env.MAIL_FROM || MAIL_USER;
  return { MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, MAIL_FROM };
}

function randomCode(len = 6) {
  const chars = "0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function sendVerifyCode(email: string) {
  const { MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, MAIL_FROM } = getMailConfig();
  if (!MAIL_USER || !MAIL_PASS) throw new Error("邮件服务未配置");
  const transporter = nodemailer.createTransport({
    host: MAIL_HOST,
    port: MAIL_PORT,
    secure: MAIL_PORT === 465,
    auth: {
      user: MAIL_USER,
      pass: MAIL_PASS,
    },
  });

  const db = getDb();
  db.prepare("DELETE FROM verify_codes WHERE expires_at <= ?").run(Date.now());
  const existing = db
    .prepare("SELECT expires_at FROM verify_codes WHERE email = ?")
    .get(email) as { expires_at: number } | undefined;
  if (existing && Date.now() < existing.expires_at - 9 * 60 * 1000) {
    // allow resend only if past 1 minute since last send
    throw new Error("发送过于频繁，请稍后再试");
  }
  const code = randomCode(6);
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 分钟
  db.prepare(
    "INSERT INTO verify_codes (email, code, expires_at) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET code=excluded.code, expires_at=excluded.expires_at"
  ).run(email, code, expiresAt);

  await transporter.sendMail({
    from: MAIL_FROM,
    to: email,
    subject: "吟心注册验证码",
    text: `您的验证码是 ${code}，10 分钟内有效。`,
  });
}

export function verifyCode(email: string, code: string) {
  const db = getDb();
  db.prepare("DELETE FROM verify_codes WHERE expires_at <= ?").run(Date.now());
  const rec = db
    .prepare("SELECT email, code FROM verify_codes WHERE email = ? AND code = ?")
    .get(email, code) as { email: string; code: string } | undefined;
  if (!rec) return false;
  db.prepare("DELETE FROM verify_codes WHERE email = ?").run(email);
  return true;
}

