// import React from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../layout";
import { usePageTitle } from "../hooks/usePageTitle";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { getToken } from "../auth";

export function TicketNewPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [form, setForm] = React.useState({ title: "", content: "" });

  usePageTitle("提交新工单");

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
      const resp = await fetch(`${API_BASE}/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: form.title, content: form.content }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      navigate(`/ticket/${data.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="hero">
        <h1>提交新工单</h1>
        <p>申请修改、报告问题</p>
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
              placeholder="详细描述你的申请或问题（支持 Markdown 和 LaTeX 数学公式）&#10;例如：&#10;- 行内公式：$E = mc^2$&#10;- 块级公式：$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$"
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
              {saving ? "提交中..." : "提交工单"}
            </button>
            <button className="btn ghost" onClick={() => navigate("/ticket")}>
              取消
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

