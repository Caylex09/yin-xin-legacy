import React from "react";
import { useParams } from "react-router-dom";
import { API_BASE } from "../../layout";
import { getToken } from "../../auth";
import { usePageTitle } from "../../hooks/usePageTitle";
import { splitSentences } from "../../utils/poetry.tsx";

export function AdminPoetryEditPage() {
  usePageTitle("编辑诗词");
  const { id } = useParams();
  const [data, setData] = React.useState<any>(null);
  const [error, setError] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [rawJson, setRawJson] = React.useState("");
  const [rawMsg, setRawMsg] = React.useState("");

  const load = React.useCallback(async () => {
    if (!id) return;
    setError("");
    try {
      const resp = await fetch(`${API_BASE}/poetry/${id}`);
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error || `HTTP ${resp.status}`);
      setData(d);
      setRawJson(JSON.stringify(d, null, 2));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const onSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMsg("");
    setError("");
    if (!data) return;
    const token = getToken();
    if (!token) {
      setError("请先登录");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const contentVal = fd.get("content") as string;
    const contentArray = (contentVal || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => splitSentences(line));
    const payload: any = {
      title: fd.get("title") as string,
      author: fd.get("author") as string,
      dynasty: fd.get("dynasty") as string,
      content: contentArray.length ? contentArray : [],
      translation: fd.get("translation") as string,
      appreciation: fd.get("appreciation") as string,
    };
    const tags = (fd.get("tags") as string) || "";
    if (tags) payload.tags = tags.split(",").map((s) => s.trim()).filter(Boolean);
    try {
      const resp = await fetch(`${API_BASE}/wiki/poetry/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error || `HTTP ${resp.status}`);
      setMsg("保存成功");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onSaveRaw = async () => {
    setRawMsg("");
    setError("");
    const token = getToken();
    if (!token) {
      setError("请先登录");
      return;
    }
    try {
      const payload = JSON.parse(rawJson || "{}");
      payload.id = payload.id || id;
      const resp = await fetch(`${API_BASE}/wiki/poetry/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error || `HTTP ${resp.status}`);
      setRawMsg("原始 JSON 已保存");
      setData(payload);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="results">
      <h2>编辑诗词</h2>
      {error && <div className="muted">{error}</div>}
      {!data && !error && <div className="muted">加载中...</div>}
      {data && (
        <form className="form" onSubmit={onSave}>
          <label>
            标题
            <input name="title" defaultValue={data.title || ""} />
          </label>
          <label>
            作者 ID
            <input name="author" defaultValue={data.author || ""} />
          </label>
          <label>
            朝代
            <input name="dynasty" defaultValue={data.dynasty || ""} />
          </label>
          <label>
            内容（按行分段，行内按标点拆句）
            <textarea
              name="content"
              defaultValue={
                Array.isArray(data.content)
                  ? data.content
                    .map((seg: any) => (Array.isArray(seg) ? seg.join("") : String(seg ?? "")))
                    .filter(Boolean)
                    .join("\n")
                  : data.content || ""
              }
              style={{ minHeight: 400, height: 400, width: "100%", fontSize: "15px", lineHeight: "1.6", padding: "12px", fontFamily: "inherit" }}
            />
          </label>
          <label>
            译文
            <textarea name="translation" defaultValue={data.translation || ""} style={{ minHeight: 300, height: 300, width: "100%", fontSize: "15px", lineHeight: "1.6", padding: "12px", fontFamily: "inherit" }} />
          </label>
          <label>
            赏析
            <textarea name="appreciation" defaultValue={data.appreciation || ""} style={{ minHeight: 300, height: 300, width: "100%", fontSize: "15px", lineHeight: "1.6", padding: "12px", fontFamily: "inherit" }} />
          </label>
          <label>
            标签（逗号分隔）
            <input name="tags" defaultValue={Array.isArray(data.tags) ? data.tags.join(",") : ""} />
          </label>
          <button className="btn" type="submit">
            保存
          </button>
          {msg && <div className="muted small">{msg}</div>}
        </form>
      )}
      {data && (
        <div className="result-list" style={{ marginTop: 16 }}>
          <h3>原始 JSON 编辑</h3>
          <textarea
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            style={{
              width: "100%",
              minHeight: 400,
              height: 400,
              fontSize: "14px",
              lineHeight: "1.6",
              padding: 12,
              borderRadius: 10,
              border: "1px solid rgba(200,109,63,0.25)",
              background: "#fffaf5",
              color: "#2c1a0d",
              fontFamily: "monospace",
            }}
          />
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button className="btn" type="button" onClick={onSaveRaw}>
              保存 JSON
            </button>
            {rawMsg && <div className="muted small">{rawMsg}</div>}
          </div>
        </div>
      )}
    </section>
  );
}

