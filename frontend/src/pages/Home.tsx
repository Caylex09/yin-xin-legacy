import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { API_BASE } from "../layout";
import { usePageTitle } from "../hooks/usePageTitle";

export function Home() {
  usePageTitle("首页");
  const navigate = useNavigate();
  const [line, setLine] = useState<any>(null);
  const [lineError, setLineError] = useState("");
  const [lineLoading, setLineLoading] = useState(false);
  const [poetInfo, setPoetInfo] = useState<any>(null);
  const [summary, setSummary] = useState<{ poetryCount: number; poetCount: number } | null>(null);

  const onSearch = () => {
    const input = document.querySelector<HTMLInputElement>("#search-input");
    if (!input) return;
    const q = input.value.trim();
    if (!q) return;
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  useEffect(() => {
    const loadLine = async () => {
      setLineLoading(true);
      setLineError("");
      try {
        const resp = await fetch(`${API_BASE}/poetry/random-line`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        setLine(data);
        setLineError("");
        if (data.author) {
          fetch(`${API_BASE}/poets/${data.author}`)
            .then(async (r) => {
              const d = await r.json();
              if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
              setPoetInfo(d);
            })
            .catch(() => setPoetInfo(null));
        } else {
          setPoetInfo(null);
        }
      } catch (e) {
        setLineError((e as Error).message);
      } finally {
        setLineLoading(false);
      }
    };
    loadLine();
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/stats/summary`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setSummary(d);
      })
      .catch(() => setSummary(null));
  }, []);

  return (
    <>
      <section className="hero">
        <h1>吟心</h1>
        <p>搜索标题、作者、朝代或标签，快速找到诗词与赏析</p>
        <p className="muted">
          本站已收录 {summary ? summary.poetryCount : "…"} 篇诗文，{summary ? summary.poetCount : "…"} 位作者
        </p>
        <div className="search">
          <input id="search-input" type="search" placeholder="如：春晓 / 李白 / 五言律诗 / 唐代" onKeyDown={(e) => e.key === "Enter" && onSearch()} />
          <button id="search-btn" onClick={onSearch}>
            搜索
          </button>
        </div>
      </section>

      <section className="results home-results">
        <div className="result-list">
          <h3>随机诗文</h3>
          {lineLoading && <div className="muted">加载中...</div>}
          {lineError && <div className="muted">获取失败：{lineError}</div>}
          {!lineLoading && !lineError && line && (
            <article className="hit">
              <div className="hit-title">
                <Link to={`/poetry/${line.id}`}>{line.title || "无标题"}</Link>
              </div>
              <div className="hit-meta">
                {poetInfo?.dynasty || line.dynasty || ""}
                {line.author ? (
                  <>
                    {" · "}
                    {poetInfo?.name ? <Link className="link-blue" to={`/poet/${line.author}`}>{poetInfo.name}</Link> : line.author}
                  </>
                ) : null}
              </div>
              <div className="hit-content" style={{ fontSize: 18, lineHeight: 1.8 }}>
                {line.sentence || ""}
              </div>
            </article>
          )}
        </div>
      </section>
    </>
  );
}

