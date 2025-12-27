#!/usr/bin/env node
/**
 * 重置用户密码脚本
 * 用法: 
 *   tsx scripts/reset-password.ts <username> <new-password>
 *   或
 *   node dist/scripts/reset-password.js <username> <new-password>
 */

import bcrypt from "bcryptjs";
import path from "path";
import dotenv from "dotenv";

// 加载环境变量（如果存在 .env 文件）
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import { getDb } from "../src/db";

async function resetPassword(username: string, newPassword: string) {
  if (!username || !newPassword) {
    console.error("❌ 错误: 用户名和新密码都是必填项");
    console.log("\n用法:");
    console.log("  tsx scripts/reset-password.ts <username> <new-password>");
    console.log("  或");
    console.log("  node dist/scripts/reset-password.js <username> <new-password>");
    console.log("\n示例:");
    console.log("  tsx scripts/reset-password.ts cyx newpassword123");
    process.exit(1);
  }

  if (newPassword.length < 6) {
    console.error("❌ 错误: 密码长度至少为 6 个字符");
    process.exit(1);
  }

  try {
    const db = getDb();
    
    // 查找用户
    const user = db
      .prepare("SELECT uid, username, email FROM users WHERE username = ? OR email = ?")
      .get(username, username) as { uid: number; username: string; email: string } | undefined;

    if (!user) {
      console.error(`❌ 错误: 用户 "${username}" 不存在`);
      process.exit(1);
    }

    console.log(`📋 找到用户:`);
    console.log(`   用户名: ${user.username}`);
    console.log(`   邮箱: ${user.email}`);
    console.log(`   UID: ${user.uid}`);
    console.log("");

    // 生成新密码哈希
    console.log("🔐 正在生成密码哈希...");
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // 更新密码并增加 token_version（使旧 token 失效）
    const result = db
      .prepare("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE uid = ?")
      .run(passwordHash, user.uid);

    if (result.changes === 0) {
      console.error("❌ 错误: 更新密码失败");
      process.exit(1);
    }

    console.log("✅ 密码重置成功！");
    console.log(`   用户名: ${user.username}`);
    console.log(`   新密码: ${newPassword}`);
    console.log("\n⚠️  注意: 所有现有的登录 token 已失效，用户需要重新登录");
  } catch (error) {
    console.error("❌ 错误:", (error as Error).message);
    process.exit(1);
  }
}

// 从命令行参数获取用户名和新密码
const args = process.argv.slice(2);
const username = args[0];
const newPassword = args[1];

resetPassword(username, newPassword);

