// import React from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../../config";
import { getToken } from "../../auth";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useEffect, useState } from "react";

export function AdminNoticePage() {
  usePageTitle("管理员通知");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const token = getToken();
        if (!token) throw new Error("请先登录");
        const resp = await fetch(`${API_BASE}/admin/notice`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        setContent(data?.content || "");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    setOk("");
    setError("");
    try {
      const token = getToken();
      if (!token) throw new Error("请先登录");
      const resp = await fetch(`${API_BASE}/admin/notice`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setOk("已保存");
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="results">
      <h2>管理员通知</h2>
      <div className="result-list" style={{ marginBottom: 12 }}>
        <div className="hit-list">
          <div className="hit-title">快速入口</div>
          <div className="hit-content" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className="btn ghost" to="/admin/user">用户管理</Link>
            <Link className="btn ghost" to="/admin/poet">诗人管理</Link>
            <Link className="btn ghost" to="/admin/poetry">诗词管理</Link>
            <Link className="btn ghost" to="/admin/fix/poet">诗人修复</Link>
            <Link className="btn ghost" to="/admin/fix/poetry">诗词修复</Link>
            <Link className="btn ghost" to="/admin/wiki">百科属性配置</Link>
            <Link className="btn ghost" to="/admin/popular">百科内容分配</Link>
          </div>
        </div>
      </div>
      {loading && <div className="muted">加载中...</div>}
      {error && <div className="muted">{error}</div>}
      {!editing && (
        <div className="result-list">
          <div className="hit-content pre-line">{content || "暂无管理员通知"}</div>
          <div style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => setEditing(true)}>
              编辑
            </button>
            {ok && <span className="muted small" style={{ marginLeft: 8 }}>{ok}</span>}
          </div>
        </div>
      )}
      {editing && (
        <div className="result-list">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={{
              width: "100%",
              minHeight: 320,
              padding: 12,
              borderRadius: 10,
              border: "1px solid rgba(200,109,63,0.25)",
              background: "#fffaf5",
              color: "#2c1a0d",
              marginTop: 8,
            }}
          />
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button className="btn" onClick={save} disabled={saving}>
              {saving ? "保存中..." : "保存通知"}
            </button>
            <button className="btn ghost" onClick={() => setEditing(false)} disabled={saving}>
              取消
            </button>
            {ok && <span className="muted small">{ok}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

