// import React from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../../layout";
import { getToken, fetchProfile, type ProfileWithRole } from "../../auth";
import { usePageTitle } from "../../hooks/usePageTitle";
import { renderSegments, splitSentences } from "../../utils/poetry.tsx";
import { useEffect, useState } from "react";

export function AdminPoetryPage() {
  usePageTitle("诗词管理");
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState<any>({ id: "", title: "", author: "", dynasty: "", content: "", tags: "" });
  const [profile, setProfile] = useState<ProfileWithRole | null>(null);

  const load = async () => {
    setError("");
    try {
      const resp = await fetch(`${API_BASE}/search/poetry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, limit: 20 }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setList(data.hits || []);
      setProfile(await fetchProfile(API_BASE));
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
      const contentArray = form.content
        .split(/\r?\n/)
        .map((line: string) => line.trim())
        .filter(Boolean)
        .map((line: string) => splitSentences(line));
      const payload: any = {
        id: form.id.trim() || Math.random().toString(36).slice(2, 10),
        title: form.title.trim(),
        author: form.author.trim(),
        dynasty: form.dynasty.trim(),
        content: contentArray.length ? contentArray : [],
      };
      if (form.tags) payload.tags = form.tags.split(",").map((s: string) => s.trim()).filter(Boolean);
      const resp = await fetch(`${API_BASE}/wiki/poetry`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setForm({ id: "", title: "", author: "", dynasty: "", content: "", tags: "" });
      setQ("");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="results">
      <h2>诗词管理</h2>
      <div className="result-list">
        <div className="search" style={{ justifyContent: "flex-start" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索诗词"
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
                <Link to={`/poetry/${p.id}`}>{p.title || p.id}</Link>
                {profile?.isWikiAdmin ? (
                  <>
                    {" · "}
                    <Link className="link-blue" to={`/admin/poetry/${p.id}`}>
                      编辑
                    </Link>
                  </>
                ) : null}
              </div>
              <div className="hit-meta">{p.dynasty || ""}</div>
              {renderSegments(p.content)}
            </article>
          ))}
        </div>
      </div>
      {profile?.isWikiAdmin && (
        <div className="result-list" style={{ marginTop: 12 }}>
          <h3>新增诗词</h3>
          <form className="form" onSubmit={onAdd}>
            <label>
              ID（可空，留空自动生成）
              <input value={form.id} onChange={(e) => setForm((p: any) => ({ ...p, id: e.target.value }))} />
            </label>
            <label>
              标题
              <input value={form.title} onChange={(e) => setForm((p: any) => ({ ...p, title: e.target.value }))} />
            </label>
            <label>
              作者 ID
              <input value={form.author} onChange={(e) => setForm((p: any) => ({ ...p, author: e.target.value }))} />
            </label>
            <label>
              朝代
              <input value={form.dynasty} onChange={(e) => setForm((p: any) => ({ ...p, dynasty: e.target.value }))} />
            </label>
            <label>
              内容（按行分段，行内按标点拆句）
              <textarea
                value={form.content}
                onChange={(e) => setForm((p: any) => ({ ...p, content: e.target.value }))}
                style={{ minHeight: 360, width: "100%" }}
              />
            </label>
            <label>
              标签（逗号分隔）
              <input value={form.tags} onChange={(e) => setForm((p: any) => ({ ...p, tags: e.target.value }))} />
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

