// import React from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { API_BASE } from "../config";
import { usePageTitle } from "../hooks/usePageTitle";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { getToken } from "../auth";
import { useEffect, useState } from "react";

export function TicketEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", content: "" });

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError("");
    fetch(`${API_BASE}/tickets/${id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        return d;
      })
      .then((data) => {
        setTicket(data);
        setForm({ title: data.title, content: data.content });
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  const saveTicket = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setError("标题和内容必填");
      return;
    }
    const token = getToken();
    if (!token) {
      setError("请先登录");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const resp = await fetch(`${API_BASE}/tickets/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: form.title, content: form.content }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      navigate(`/ticket/${id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  usePageTitle(ticket ? `编辑：${ticket.title}` : "编辑工单");

  if (loading) {
    return (
      <>
        <section className="hero">
          <h1>编辑工单</h1>
        </section>
        <section className="results">
          <div className="result-list">
            <div className="muted">加载中...</div>
          </div>
        </section>
      </>
    );
  }

  if (error && !ticket) {
    return (
      <>
        <section className="hero">
          <h1>编辑工单</h1>
        </section>
        <section className="results">
          <div className="result-list">
            <div className="muted">{error}</div>
            <div style={{ marginTop: 12 }}>
              <Link className="btn ghost" to="/ticket">
                返回工单列表
              </Link>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <section className="hero">
        <h1>编辑工单</h1>
        <p>{ticket?.title}</p>
      </section>
      <section className="results">
        <div className="result-list">
          {error && <div className="muted" style={{ color: "#d32f2f", marginBottom: 12 }}>{error}</div>}
          <div>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>标题</label>
            <input
              type="text"
              placeholder="标题"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              style={{ width: "100%", marginBottom: 16, padding: 8, borderRadius: 8, border: "1px solid rgba(200,109,63,0.25)" }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>内容（支持 Markdown 和 LaTeX 数学公式）</label>
            <textarea
              placeholder="内容（支持 Markdown 和 LaTeX 数学公式）"
              value={form.content}
              onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
              style={{
                width: "100%",
                maxWidth: "100%",
                minHeight: 300,
                padding: 8,
                borderRadius: 8,
                border: "1px solid rgba(200,109,63,0.25)",
                background: "#fffaf5",
                color: "#2c1a0d",
                fontFamily: "monospace",
                fontSize: "14px",
                boxSizing: "border-box",
                wordBreak: "break-word",
                overflowWrap: "break-word",
                whiteSpace: "pre-wrap",
              }}
            />
          </div>
          {form.content && (
            <div style={{ marginTop: 16, padding: 12, background: "#f9f9f9", borderRadius: 8, border: "1px solid rgba(200,109,63,0.15)" }}>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>预览：</div>
              <MarkdownRenderer content={form.content} />
            </div>
          )}
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button className="btn" onClick={saveTicket} disabled={saving}>
              {saving ? "保存中..." : "保存修改"}
            </button>
            <Link className="btn ghost" to={`/ticket/${id}`}>
              取消
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

