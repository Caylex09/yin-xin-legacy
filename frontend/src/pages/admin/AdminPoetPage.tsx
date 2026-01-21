// import React from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../../layout";
import { fetchProfile, getToken, type ProfileWithRole } from "../../auth";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useEffect, useState } from "react";

export function AdminPoetPage() {
  usePageTitle("诗人管理");
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState<any>({
    id: "",
    name: "",
    dynasty: "",
    description: "",
    content: "",
    avatar: "avatar/yinxin.png",
  });
  const [profile, setProfile] = useState<ProfileWithRole | null>(null);

  const load = async () => {
    setError("");
    try {
      const resp = await fetch(`${API_BASE}/search/poets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, limit: 20 }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setList(data.hits || []);
      const p = await fetchProfile(API_BASE);
      setProfile(p);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const token = getToken();
    if (!token) {
      setError("请先登录");
      return;
    }
    try {
      const payload: any = {
        id: form.id.trim() || Math.random().toString(36).slice(2, 10),
        name: form.name.trim(),
        dynasty: form.dynasty.trim(),
        description: form.description.trim(),
        content: form.content.trim(),
        avatar: form.avatar.trim() || "avatar/yinxin.png",
      };
      const resp = await fetch(`${API_BASE}/wiki/poets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setForm({ id: "", name: "", dynasty: "", description: "", content: "", avatar: "avatar/yinxin.png" });
      setQ("");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="results">
      <h2>诗人管理</h2>
      <div className="result-list">
        <div className="search" style={{ justifyContent: "flex-start" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索诗人"
            onKeyDown={(e) => e.key === "Enter" && load()}
            style={{ maxWidth: 300 }}
          />
          <button onClick={load}>搜索</button>
        </div>
        {error && <div className="muted">{error}</div>}
        <div className="hit-list" style={{ marginTop: 10 }}>
          {list.map((p) => (
            <article className="hit" key={p.id}>
              <div className="hit-title">
                <Link to={`/poet/${p.id}`}>{p.name || p.id}</Link>
                {profile?.isWikiAdmin ? (
                  <>
                    {" · "}
                    <Link className="link-blue" to={`/admin/poet/${p.id}`}>
                      编辑
                    </Link>
                  </>
                ) : null}
              </div>
              <div className="hit-meta">{p.dynasty || ""}</div>
              <div className="hit-content">{p.description || p.content || ""}</div>
            </article>
          ))}
        </div>
      </div>
      {profile?.isWikiAdmin && (
        <div className="result-list" style={{ marginTop: 12 }}>
          <h3>新增诗人</h3>
          <form className="form" onSubmit={onAdd}>
            <label>
              ID（可空，留空自动生成）
              <input value={form.id} onChange={(e) => setForm((p: any) => ({ ...p, id: e.target.value }))} />
            </label>
            <label>
              头像（可留空默认 yinxin.png）
              <input value={form.avatar} onChange={(e) => setForm((p: any) => ({ ...p, avatar: e.target.value }))} />
            </label>
            <label>
              姓名
              <input value={form.name} onChange={(e) => setForm((p: any) => ({ ...p, name: e.target.value }))} />
            </label>
            <label>
              朝代
              <input value={form.dynasty} onChange={(e) => setForm((p: any) => ({ ...p, dynasty: e.target.value }))} />
            </label>
            <label>
              简介
              <textarea
                value={form.description}
                onChange={(e) => setForm((p: any) => ({ ...p, description: e.target.value }))}
                style={{ minHeight: 220, width: "100%" }}
              />
            </label>
            <label>
              生平
              <textarea
                value={form.content}
                onChange={(e) => setForm((p: any) => ({ ...p, content: e.target.value }))}
                style={{ minHeight: 320, width: "100%" }}
              />
            </label>
            <button className="btn" type="submit">
              提交
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

