// import React from "react";
import { useParams } from "react-router-dom";
import { API_BASE } from "../../layout";
import { getToken } from "../../auth";
import { usePageTitle } from "../../hooks/usePageTitle";

export function AdminPoetEditPage() {
  usePageTitle("编辑诗人");
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
      const resp = await fetch(`${API_BASE}/poets/${id}`);
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
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload: any = {
      name: fd.get("name") as string,
      dynasty: fd.get("dynasty") as string,
      description: fd.get("description") as string,
      content: fd.get("content") as string,
    };
    try {
      const resp = await fetch(`${API_BASE}/wiki/poets/${id}`, {
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
      const resp = await fetch(`${API_BASE}/wiki/poets/${id}`, {
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
      <h2>编辑诗人</h2>
      {error && <div className="muted">{error}</div>}
      {!data && !error && <div className="muted">加载中...</div>}
      {data && (
        <form className="form" onSubmit={onSave}>
          <label>
            姓名
            <input name="name" defaultValue={data.name || ""} />
          </label>
          <label>
            朝代
            <input name="dynasty" defaultValue={data.dynasty || ""} />
          </label>
          <label>
            简介
            <textarea
              name="description"
              defaultValue={data.description || ""}
              style={{ minHeight: 220, width: "100%" }}
            />
          </label>
          <label>
            生平
            <textarea
              name="content"
              defaultValue={data.content || ""}
              style={{ minHeight: 320, width: "100%" }}
            />
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

