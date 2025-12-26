// import React from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../../layout";
import { getToken } from "../../auth";
import { usePageTitle } from "../../hooks/usePageTitle";
import { renderSegments } from "../../utils/poetry.tsx";

export function AdminFixPoetryPage() {
  usePageTitle("修复诗词数据");
  const [list, setList] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [nextOffset, setNextOffset] = React.useState<number | null>(0);
  const [authors, setAuthors] = React.useState<Record<string, { name?: string; dynasty?: string }>>({});

  const fetchBatch = async (offset: number) => {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`${API_BASE}/admin/fix/poetry?limit=1000&offset=${offset}`, {
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

  React.useEffect(() => {
    fetchBatch(0);
  }, []);

  React.useEffect(() => {
    const ids = Array.from(
      new Set(
        (list || [])
          .map((p) => (p.author ? String(p.author) : ""))
          .filter((id) => id && !authors[id])
      )
    );
    if (!ids.length) return;
    ids.forEach((id) => {
      fetch(`${API_BASE}/poets/${id}`)
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
          setAuthors((prev) => ({ ...prev, [String(id)]: { name: d.name, dynasty: d.dynasty } }));
        })
        .catch(() => {
          /* ignore missing */
        });
    });
  }, [list, authors]);

  return (
    <section className="results">
      <h2>修复 · 诗词</h2>
      <p className="muted small">仅 wiki_admin 可访问 · 条件：标题/作者/朝代/内容含全角括号或者 □</p>
      <div className="result-list">
        {loading && <div className="muted">加载中...</div>}
        {error && <div className="muted">加载失败：{error}</div>}
        {!loading && !error && list.length === 0 && <div className="muted">暂无需要修复的诗词</div>}
        {!loading && !error && list.length > 0 && (
          <div className="hit-list">
            {list.map((p) => (
              <article className="hit" key={p.id}>
                <div className="hit-title">
                  <Link className="link-blue" to={`/admin/poetry/${p.id}`}>
                    {p.title || p.id}
                  </Link>
                </div>
                {(() => {
                  const aid = p.author ? String(p.author) : "";
                  return (
                    <div className="hit-meta">
                      {(aid && authors[aid]?.dynasty) || p.dynasty || ""}
                      {aid ? (
                        <>
                          {" · "}
                          <Link className="link-blue" to={`/poet/${aid}`}>
                            {authors[aid]?.name || aid}
                          </Link>
                        </>
                      ) : null}
                    </div>
                  );
                })()}
                {renderSegments(p.content)}
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

