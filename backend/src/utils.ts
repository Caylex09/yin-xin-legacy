import crypto from "crypto";

export function gravatar(email: string) {
  const normalized = (email || "").trim().toLowerCase();
  const hash = crypto.createHash("md5").update(normalized).digest("hex");
  // return `https://cn.gravatar.com/avatar/${hash}?d=identicon&s=256`;
  return `https://cravatar.com/avatar/${hash}?d=identicon&s=256`;
}

