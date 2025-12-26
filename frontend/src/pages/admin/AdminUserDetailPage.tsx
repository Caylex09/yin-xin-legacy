// import React from "react";
import { Link, useParams } from "react-router-dom";
import { API_BASE } from "../../layout";
import { getToken, type ProfileWithRole } from "../../auth";
import { usePageTitle } from "../../hooks/usePageTitle";
import { roleText, formatDate } from "../../utils/format";

export function AdminUserDetailPage() {
  usePageTitle("用户详情");
  const { uid } = useParams();
  const [data, setData] = React.useState<any>(null);
  const [error, setError] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const token = getToken();
      if (!token) throw new Error("请先登录");
      setLoading(true);
      setError("");
      const resp = await fetch(`${API_BASE}/admin/users/${uid}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error || `HTTP ${resp.status}`);
      setData(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  React.useEffect(() => {
    if (uid) load();
  }, [uid, load]);

  const onSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMsg("");
    setError("");
    const form = e.currentTarget;
    const formData = new FormData(form);
    const username = (formData.get("username") as string).trim();
    const email = (formData.get("email") as string).trim();
    const password = (formData.get("password") as string).trim();
    const scoreRaw = (formData.get("score") as string).trim();
    const avatar = (formData.get("avatar") as string).trim();
    const score = scoreRaw === "" ? undefined : Number(scoreRaw);
    if (!username && !email && !password && scoreRaw === "" && avatar === "") {
      setMsg("无需修改");
      return;
    }
    if (scoreRaw !== "" && Number.isNaN(score)) {
      setError("积分必须是数字");
      return;
    }
    try {
      const token = getToken();
      if (!token) throw new Error("请先登录");
      const resp = await fetch(`${API_BASE}/admin/users/${uid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          username: username || undefined,
          email: email || undefined,
          password: password || undefined,
          score,
          avatar: avatar || undefined,
        }),
      });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error || `HTTP ${resp.status}`);
      setData(d);
      setMsg("保存成功");
      form.reset();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const updateRole = async (role: number) => {
    try {
      const token = getToken();
      if (!token) throw new Error("请先登录");
      const resp = await fetch(`${API_BASE}/admin/users/${uid}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role }),
      });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(d.error || `HTTP ${resp.status}`);
      setData((prev: any) => (prev ? { ...prev, role } : prev));
      setMsg("角色已更新");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const updateFlag = async (field: "announcement" | "wiki" | "super" | "game", value: boolean) => {
    try {
      const token = getToken();
      if (!token) throw new Error("请先登录");
      const map: Record<typeof field, string> = {
        announcement: "announcement-admin",
        wiki: "wiki-admin",
        super: "super-admin",
        game: "game-admin",
      };
      const resp = await fetch(`${API_BASE}/admin/users/${uid}/${map[field]}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value }),
      });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(d.error || `HTTP ${resp.status}`);
      setData((prev: any) =>
        prev
          ? {
            ...prev,
            is_announcement_admin: field === "announcement" ? (value ? 1 : 0) : prev.is_announcement_admin,
            is_wiki_admin: field === "wiki" ? (value ? 1 : 0) : prev.is_wiki_admin,
            is_super_admin: field === "super" ? (value ? 1 : 0) : prev.is_super_admin,
            is_game_admin: field === "game" ? (value ? 1 : 0) : prev.is_game_admin,
          }
          : prev
      );
      setMsg("权限已更新");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="results">
      <h2>用户详情</h2>
      {loading && <div className="muted">加载中...</div>}
      {error && <div className="muted">{error}</div>}
      {data && (
        <div className="result-list">
          <h3>原始数据</h3>
          <pre style={{ background: "#fffaf5", padding: 12, borderRadius: 10, overflowX: "auto" }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
      {data && (
        <div className="result-list" style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 12 }}>
            <img
              src={data.avatar || ""}
              alt="avatar"
              style={{ width: 100, height: 100, borderRadius: "50%", objectFit: "cover", background: "#f3e7dd" }}
            />
          </div>
          <p>UID：{data.uid}</p>
          <p>用户名：{data.username}</p>
          <p>邮箱：{data.email}</p>
          <p>角色：{roleText(data.role)}</p>
          <p>公告权限：{data.is_announcement_admin ? "是" : "否"}</p>
          <p>资料权限：{data.is_wiki_admin ? "是" : "否"}</p>
          <p>超管：{data.is_super_admin ? "是" : "否"}</p>
          <p>游戏管理员：{data.is_game_admin ? "是" : "否"}</p>
          <p>积分：{data.score ?? 0}</p>
          <p>TokenVersion：{data.token_version}</p>
          <p>注册时间：{formatDate(data.created_at)}</p>
        </div>
      )}
      <div className="result-list" style={{ marginTop: 12 }}>
        <h3>修改所有字段</h3>
        <form className="form" onSubmit={onSave}>
          <label>
            新用户名（可选）
            <input name="username" type="text" maxLength={50} placeholder="不改留空" />
          </label>
          <label>
            新邮箱（可选）
            <input name="email" type="email" placeholder="不改留空" />
          </label>
          <label>
            新密码（可选）
            <input name="password" type="password" placeholder="不改留空" />
          </label>
          <label>
            头像链接（可选）
            <input name="avatar" type="url" placeholder="不改留空，默认使用 Gravatar" />
          </label>
          <label>
            积分（可选）
            <input name="score" type="number" placeholder="不改留空" />
          </label>
          <div className="muted small">以下权限/角色操作即时生效</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
            <button className="btn ghost" type="button" onClick={() => updateRole(1)}>
              设为管理员
            </button>
            <button className="btn ghost" type="button" onClick={() => updateRole(0)}>
              设为普通
            </button>
            <button className="btn ghost" type="button" onClick={() => updateRole(-1)}>
              封禁
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => updateFlag("announcement", !(data?.is_announcement_admin ? true : false))}
            >
              {data?.is_announcement_admin ? "取消公告权限" : "授权公告权限"}
            </button>
            <button className="btn ghost" type="button" onClick={() => updateFlag("wiki", !(data?.is_wiki_admin ? true : false))}>
              {data?.is_wiki_admin ? "取消资料权限" : "授权资料权限"}
            </button>
            <button className="btn ghost" type="button" onClick={() => updateFlag("super", !(data?.is_super_admin ? true : false))}>
              {data?.is_super_admin ? "取消超管" : "授权超管"}
            </button>
            <button className="btn ghost" type="button" onClick={() => updateFlag("game", !(data?.is_game_admin ? true : false))}>
              {data?.is_game_admin ? "取消游戏管理员" : "授权游戏管理员"}
            </button>
          </div>
          <button className="btn" type="submit" style={{ marginTop: 8 }}>
            保存（用户名/邮箱/密码/积分/头像）
          </button>
          {msg && <div className="muted small">{msg}</div>}
          {error && <div className="muted small">{error}</div>}
        </form>
      </div>
    </section>
  );
}

