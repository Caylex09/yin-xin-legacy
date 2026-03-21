// import React from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../../config";
import { getToken } from "../../auth";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useEffect, useState } from "react";

export function AdminFixPoetPage() {
  usePageTitle("修复诗人数据");
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nextOffset, setNextOffset] = useState<number | null>(0);

  const fetchBatch = async (offset: number) => {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`${API_BASE}/admin/fix/poets?limit=1000&offset=${offset}`, {
        headers: { Authorization: `Bearer ${getToken() || ""}` },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setList((prev) => [...prev, ...(data.items || [])]);
      setNextOffset(data.nextOffset);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatch(0);
  }, []);

  return (
    <section className="results">
      <h2>修复 · 诗人</h2>
      <p className="muted small">仅 wiki_admin 可访问 · 条件：头像缺失/含 yinxin，或字段含 "□"</p>
      <div className="result-list">
        {loading && <div className="muted">加载中...</div>}
        {error && <div className="muted">加载失败：{error}</div>}
        {!loading && !error && list.length === 0 && <div className="muted">暂无需要修复的诗人</div>}
        {!loading && !error && list.length > 0 && (
          <div className="hit-list">
            {list.map((p) => (
              <article className="hit" key={p.id}>
                <div className="hit-title">
                  <Link className="link-blue" to={`/admin/poet/${p.id}`}>
                    {p.name || p.id}
                  </Link>
                </div>
                <div className="hit-meta">{p.dynasty || ""}</div>
                <div className="muted small">
                  头像：{p.avatar || "无"}
                  {p.avatar && String(p.avatar).includes("yinxin") ? "（默认头像待换）" : ""}
                </div>
                <div className="hit-content muted small">{p.description || p.content || ""}</div>
              </article>
            ))}
          </div>
        )}
        {nextOffset !== null && (
          <button className="btn ghost" style={{ marginTop: 8 }} disabled={loading} onClick={() => fetchBatch(nextOffset ?? 0)}>
            继续加载
          </button>
        )}
      </div>
    </section>
  );
}

