const TOKEN_KEY = "yinxin_token";

export type ProfileWithRole = {
  uid: number;
  username: string;
  createdAt: string;
  email?: string;
  avatar?: string;
  role?: number;
  isAnnouncementAdmin?: number;
  isSuperAdmin?: number;
  isWikiAdmin?: number;
  isGameAdmin?: number;
  score?: number;
  usernameChangedAt?: string;
};

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function fetchProfile(apiBase: string): Promise<ProfileWithRole | null> {
  const token = getToken();
  if (!token) return null;
  const resp = await fetch(`${apiBase}/auth/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  return (await resp.json()) as ProfileWithRole;
}

export async function login(apiBase: string, username: string, password: string) {
  const resp = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "登录失败");
  setToken(data.token);
  return data.user as { uid: number; username: string; role?: number };
}

export async function sendCode(apiBase: string, email: string) {
  const resp = await fetch(`${apiBase}/auth/send-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "发送失败");
  return data;
}

export async function register(apiBase: string, username: string, password: string, email: string, code: string) {
  const resp = await fetch(`${apiBase}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, email, code }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "注册失败");
  setToken(data.token);
  return data.user as { uid: number; username: string; role?: number };
}

export async function initAuthUI(apiBase: string) {
  const container = document.querySelector<HTMLDivElement>("#auth-actions");
  if (!container) return;

  const token = getToken();
  const profile = await fetchProfile(apiBase);

  if (token && profile) {
    container.innerHTML = `
      <span class="welcome">你好，${profile.username}${profile.role && profile.role > 0 ? " · 管理员" : ""}</span>
      <a class="btn ghost" href="/profile/${profile.uid}">个人主页</a>
      ${profile.role && profile.role > 0 ? '<a class="btn ghost" href="/admin">后台</a>' : ""}
      <button class="btn" id="logout-btn">登出</button>
    `;
    const logoutBtn = container.querySelector<HTMLButtonElement>("#logout-btn");
    if (logoutBtn) {
      logoutBtn.onclick = () => {
        clearToken();
        window.location.reload();
      };
    }
  } else {
    container.innerHTML = `
      <a class="btn ghost" href="/login">登录</a>
      <a class="btn" href="/register">注册</a>
    `;
  }
}

