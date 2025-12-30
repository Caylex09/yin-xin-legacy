import React, { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate, useSearchParams, useParams } from "react-router-dom";
import "./style.css";
import { API_BASE } from "./layout";
import { initAuthUI, login, register, sendCode, fetchProfile, getToken, clearToken } from "./auth";
import type { ProfileWithRole } from "./auth";
import { usePageTitle } from "./hooks/usePageTitle";
import { Layout } from "./components/Layout";
import { AnnouncementListPage } from "./pages/AnnouncementListPage";
import { AnnouncementDetailPage } from "./pages/AnnouncementDetailPage";
import { AnnouncementEditPage } from "./pages/AnnouncementEditPage";
import { AnnouncementNewPage } from "./pages/AnnouncementNewPage";
import { DiscussionListPage } from "./pages/DiscussionListPage";
import { DiscussionDetailPage } from "./pages/DiscussionDetailPage";
import { DiscussionNewPage } from "./pages/DiscussionNewPage";
import { DiscussionEditPage } from "./pages/DiscussionEditPage";
import { TicketListPage } from "./pages/TicketListPage";
import { TicketDetailPage } from "./pages/TicketDetailPage";
import { TicketNewPage } from "./pages/TicketNewPage";
import { TicketEditPage } from "./pages/TicketEditPage";
import { Home } from "./pages/Home";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { roleText, formatDate } from "./utils/format";
import { renderSegments, splitSentences, renderSegmentsWithHighlight } from "./utils/poetry.tsx";
import { AdminNoticePage } from "./pages/admin/AdminNoticePage";
import { AdminUserPage } from "./pages/admin/AdminUserPage";
import { AdminUserDetailPage } from "./pages/admin/AdminUserDetailPage";
import { AdminPoetPage } from "./pages/admin/AdminPoetPage";
import { AdminPoetEditPage } from "./pages/admin/AdminPoetEditPage";
import { AdminFixPoetPage } from "./pages/admin/AdminFixPoetPage";
import { AdminFixPoetryPage } from "./pages/admin/AdminFixPoetryPage";
import { AdminPoetryPage } from "./pages/admin/AdminPoetryPage";
import { AdminPoetryEditPage } from "./pages/admin/AdminPoetryEditPage";
import { PoemSnakePage } from "./pages/game/PoemSnakePage";
import { PoemSnakeRoomPage } from "./pages/game/PoemSnakeRoomPage";


function OnlinePage() {
  usePageTitle("在线用户");
  const [online, setOnline] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [avatars, setAvatars] = useState<Record<number, string>>({});

  useEffect(() => {
    let timer: any;
    const token = getToken();
    const ping = async () => {
      if (!token) return;
      try {
        await fetch(`${API_BASE}/online/ping`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      } catch {
        /* ignore */
      }
    };
    const load = async () => {
      try {
        setLoading(true);
        const resp = await fetch(`${API_BASE}/online/list`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        setOnline(data);
        setError("");

        // 批量获取用户头像
        const newAvatars: Record<number, string> = {};
        const fetchPromises = data.map(async (u: any) => {
          try {
            const userResp = await fetch(`${API_BASE}/user/uid/${u.uid}`);
            if (userResp.ok) {
              const userData = await userResp.json();
              if (userData.avatar) {
                newAvatars[u.uid] = userData.avatar;
              }
            }
          } catch {
            // 忽略错误，使用默认头像
          }
        });
        await Promise.all(fetchPromises);
        setAvatars(newAvatars);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };
    ping().then(load);
    timer = setInterval(() => {
      ping();
      load();
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <section className="hero">
        <h1>在线用户</h1>
        <p>最近 5 分钟内在线的用户</p>
      </section>
      <section className="results">
        <div className="result-list">
          {loading && <div className="muted">加载中...</div>}
          {error && <div className="muted">请求失败：{error}</div>}
          {!loading && !error && online.length === 0 && <div className="muted">暂无在线用户</div>}
          {!loading && !error && online.length > 0 && (
            <ul className="list online-list">
              {online.map((u) => (
                <li key={u.uid} className="online-list-item">
                  <img
                    src={avatars[u.uid] || "/avatar/yinxin.png"}
                    alt={u.username || `用户${u.uid}`}
                    className="online-avatar"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/avatar/yinxin.png";
                    }}
                  />
                  <div className="online-user-info">
                    <Link className="link-blue" to={`/profile/${u.uid}`}>
                      {u.username || `用户${u.uid}`}
                    </Link>
                  </div>
                  <span className="online-time">{new Date(u.last).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

function RankingPage() {
  usePageTitle("排行榜");
  const [params, setParams] = useSearchParams();
  const pageParam = Math.max(Number(params.get("page") || "1"), 1);
  const pageSize = 20;
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (page: number) => {
      setLoading(true);
      setError("");
      try {
        const resp = await fetch(`${API_BASE}/rankings?limit=${pageSize}&offset=${(page - 1) * pageSize}`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        setList(data.list || []);
        setTotal(data.total || 0);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [pageSize]
  );

  useEffect(() => {
    load(pageParam);
  }, [load, pageParam]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const offset = (pageParam - 1) * pageSize;
  const goPage = (p: number) => {
    const np = Math.min(Math.max(p, 1), totalPages || 1);
    setParams(new URLSearchParams({ page: String(np) }));
  };

  return (
    <>
      <section className="hero">
        <h1>排行榜</h1>
        <p>按积分从高到低排序</p>
      </section>
      <section className="results">
        <div className="result-list">
          {loading && <div className="muted">加载中...</div>}
          {error && <div className="muted">请求失败：{error}</div>}
          {!loading && !error && list.length === 0 && <div className="muted">暂无数据</div>}
          {!loading && !error && list.length > 0 && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>排名</th>
                  <th>头像</th>
                  <th>用户</th>
                  <th>积分</th>
                  <th>注册时间</th>
                </tr>
              </thead>
              <tbody>
                {list.map((u, idx) => (
                  <tr key={u.uid}>
                    <td>{offset + idx + 1}</td>
                    <td>
                      <img
                        src={u.avatar || ""}
                        alt="avatar"
                        style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", background: "#f3e7dd" }}
                      />
                    </td>
                    <td>
                      <Link className="link-blue" to={`/profile/${u.uid}`}>
                        {u.username}
                      </Link>
                    </td>
                    <td>{u.score ?? 0}</td>
                    <td>{formatDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn ghost" disabled={pageParam <= 1} onClick={() => goPage(pageParam - 1)}>
              上一页
            </button>
            <span className="muted">
              第 {pageParam} / {totalPages} 页
            </span>
            <button className="btn ghost" disabled={pageParam >= totalPages} onClick={() => goPage(pageParam + 1)}>
              下一页
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function Search() {
  usePageTitle("搜索");
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const navigate = useNavigate();
  const [hits, setHits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [authors, setAuthors] = useState<Record<string, { name?: string; dynasty?: string }>>({});
  const [poets, setPoets] = useState<any[]>([]);
  const [loadingPoets, setLoadingPoets] = useState(false);
  const [errorPoets, setErrorPoets] = useState("");
  const [hasMorePoetry, setHasMorePoetry] = useState(true);
  const [hasMorePoets, setHasMorePoets] = useState(true);
  const [isSearching, setIsSearching] = useState(false);

  const doSearch = () => {
    const input = document.querySelector<HTMLInputElement>("#search-input");
    if (!input) return;
    const val = input.value.trim();
    if (!val) return;
    navigate(`/search?q=${encodeURIComponent(val)}`);
  };

  const fetchPoetry = useCallback(
    async (offset: number, append: boolean) => {
      if (!append) setLoading(true);
      try {
        const r = await fetch(`${API_BASE}/search/poetry`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q, limit: 20, offset }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        const list = data.hits || [];

        // 获取作者信息
        const ids = Array.from(
          new Set(
            (list as any[])
              .map((h: any) => h.author)
              .filter((v: any) => typeof v === "string" && v.length === 8)
          )
        );
        const authorPromises = ids.map(async (aid) => {
          try {
            const resp = await fetch(`${API_BASE}/poets/${aid}`);
            if (!resp.ok) return null;
            const poet = await resp.json();
            return { id: aid, name: poet.name || aid, dynasty: poet.dynasty };
          } catch {
            return null;
          }
        });
        const authorResults = await Promise.all(authorPromises);
        const newAuthors: Record<string, { name?: string; dynasty?: string }> = {};
        authorResults.forEach(result => {
          if (result) newAuthors[result.id] = { name: result.name, dynasty: result.dynasty };
        });

        if (!append) {
          setHits(list);
          setHasMorePoetry(list.length === 20);
          setAuthors(prev => ({ ...prev, ...newAuthors }));
        } else {
          setHits(prev => [...prev, ...list]);
          setHasMorePoetry(list.length === 20);
          setAuthors(prev => ({ ...prev, ...newAuthors }));
        }

        return {
          hits: list,
          hasMore: list.length === 20,
          authors: newAuthors,
          error: null
        };
      } catch (e) {
        if (!append) {
          setError((e as Error).message);
        }
        return {
          hits: [],
          hasMore: false,
          authors: {},
          error: (e as Error).message
        };
      } finally {
        if (!append) setLoading(false);
      }
    },
    [q]
  );

  const fetchPoets = useCallback(
    async (offset: number, append: boolean) => {
      if (!append) setLoadingPoets(true);
      try {
        const r = await fetch(`${API_BASE}/search/poets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q, limit: 3, offset }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        const list = data.hits || [];

        if (!append) {
          setPoets(list);
          setHasMorePoets(list.length === 3);
        } else {
          setPoets(prev => [...prev, ...list]);
          setHasMorePoets(list.length === 3);
        }

        return {
          poets: list,
          hasMore: list.length === 3,
          error: null
        };
      } catch (e) {
        if (!append) {
          setErrorPoets((e as Error).message);
        }
        return {
          poets: [],
          hasMore: false,
          error: (e as Error).message
        };
      } finally {
        if (!append) setLoadingPoets(false);
      }
    },
    [q]
  );

  useEffect(() => {
    if (!q) {
      setHits([]);
      setPoets([]);
      setError("");
      setErrorPoets("");
      setAuthors({});
      setHasMorePoetry(true);
      setHasMorePoets(true);
      setIsSearching(false);
      return;
    }

    const performSearch = async () => {
      setIsSearching(true);
      setLoading(true);
      setLoadingPoets(true);

      try {
        // 并行执行两个搜索请求
        const [poetryResult, poetsResult] = await Promise.all([
          fetchPoetry(0, false),
          fetchPoets(0, false)
        ]);

        // 一次性更新所有状态，避免跳动
        setHits(poetryResult.hits);
        setHasMorePoetry(poetryResult.hasMore);
        if (poetryResult.error) {
          setError(poetryResult.error);
        }

        setPoets(poetsResult.poets);
        setHasMorePoets(poetsResult.hasMore);
        if (poetsResult.error) {
          setErrorPoets(poetsResult.error);
        }

        // 合并作者信息
        setAuthors(poetryResult.authors);

      } catch (e) {
        setError("搜索失败");
        setErrorPoets("搜索失败");
      } finally {
        setLoading(false);
        setLoadingPoets(false);
        setIsSearching(false);
      }
    };

    performSearch();
  }, [q]);

  return (
    <>
      <section className="hero">
        <h1>搜索结果</h1>
        <p>当前关键词：{q || "（未输入）"}</p>
        <div className="search">
          <input
            defaultValue={q}
            id="search-input"
            type="search"
            placeholder="如：春晓 / 李白 / 五言律诗 / 唐代"
            onKeyDown={(e) => {
              if (e.key === "Enter") doSearch();
            }}
          />
          <button id="search-btn" onClick={doSearch}>
            搜索
          </button>
        </div>
      </section>
      <section className="results">
        <h2>结果</h2>
        <h3>诗人</h3>
        <div className="result-list">
          {loadingPoets && <div className="muted">搜索中...</div>}
          {errorPoets && <div className="muted">请求失败：{errorPoets}</div>}
          {!loadingPoets && !errorPoets && !q && <div className="muted">请输入关键词</div>}
          {!loadingPoets && !errorPoets && q && poets.length === 0 && <div className="muted">未找到结果</div>}
          {!loadingPoets && !errorPoets && poets.length > 0 && (
            <div className="hit-list">
              {poets.map((p) => (
                <article className="hit" key={p.id}>
                  <div className="hit-title">
                    <Link to={`/poet/${p.id}`}>{p.name || "未知诗人"}</Link>
                  </div>
                  <div className="hit-meta">{p.dynasty || ""}</div>
                  <div className="hit-content">{p.description || p.content || ""}</div>
                </article>
              ))}
              {hasMorePoets && (
                <button className="btn ghost" style={{ marginTop: 8 }} onClick={async () => {
                  const result = await fetchPoets(poets.length, true);
                  if (result) {
                    setPoets(prev => [...prev, ...result.poets]);
                    setHasMorePoets(result.hasMore);
                  }
                }}>
                  加载更多诗人（+3）
                </button>
              )}
            </div>
          )}
        </div>
        <h3 style={{ marginTop: 16 }}>诗词</h3>
        <div id="result-list" className="result-list">
          {loading && <div className="muted">搜索中...</div>}
          {error && <div className="muted">请求失败：{error}</div>}
          {!loading && !error && !q && <div className="muted">请输入关键词</div>}
          {!loading && !error && q && hits.length === 0 && <div className="muted">未找到结果</div>}
          {!loading && !error && hits.length > 0 && (
            <div className="hit-list">
              {hits.map((hit) => (
                <article className="hit" key={hit.id || hit.uid || hit.title}>
                  <div className="hit-title">
                    <Link to={`/poetry/${hit.id || hit.uid}`}>{hit.title || "无标题"}</Link>
                  </div>
                  <div className="hit-meta">
                    {((hit.author && authors[hit.author]?.dynasty) || hit.dynasty || "")}
                    {hit.author && (
                      <>
                        {" · "}
                        {authors[hit.author]?.name ? (
                          <Link className="link-blue" to={`/poet/${hit.author}`}>
                            {authors[hit.author]?.name}
                          </Link>
                        ) : (
                          hit.author
                        )}
                      </>
                    )}
                  </div>
                  {renderSegmentsWithHighlight(hit.content, q)}
                </article>
              ))}
              {hasMorePoetry && (
                <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => fetchPoetry(hits.length, true)}>
                  加载更多诗词（+20）
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function PoetryPage() {
  usePageTitle("诗词详情");
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [authorInfo, setAuthorInfo] = useState<any>(null);
  const [authorError, setAuthorError] = useState("");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError("");
    fetch(`${API_BASE}/poetry/${id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        return d;
      })
      .then(setData)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const aid = data?.author;
    if (!aid) {
      setAuthorInfo(null);
      setAuthorError("");
      return;
    }
    fetch(`${API_BASE}/poets/${aid}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        return d;
      })
      .then((poet) => {
        setAuthorInfo(poet);
        setAuthorError("");
      })
      .catch((e) => {
        setAuthorInfo(null);
        setAuthorError((e as Error).message);
      });
  }, [data?.author]);

  const dynastyText = authorInfo?.dynasty || data?.dynasty || "";
  const authorName = authorInfo?.name || data?.author || "";

  return (
    <>
      <section className="hero">
        <h1>{data?.title || "诗词详情"}</h1>
        <p>
          {dynastyText}
          {authorName ? (
            <>
              {" · "}
              <Link className="link-blue" to={`/poet/${data.author}`}>
                {authorName}
              </Link>
            </>
          ) : null}
        </p>
        {authorError && <div className="muted small">作者信息加载失败：{authorError}</div>}
      </section>
      <section className="card">
        {loading && <div className="muted">加载中...</div>}
        {error && <div className="muted">加载失败：{error}</div>}
        {!loading && !error && data && (
          <>
            <h3>正文</h3>
            <div style={{ marginBottom: 12 }}>{renderSegments(data.content)}</div>
            <h3>译文</h3>
            {data.translation ? (
              <p className="muted">{data.translation}</p>
            ) : (
              <p className="muted small">暂无译文，快去发工单联系管理员添加吧！</p>
            )}

            <h3>赏析</h3>
            {data.appreciation ? (
              <p className="muted">{data.appreciation}</p>
            ) : (
              <p className="muted small">暂无赏析，快去发工单联系管理员添加吧！</p>
            )}

            <h3>标签</h3>
            {data.tags && Array.isArray(data.tags) && data.tags.length > 0 ? (
              <div className="tags">
                {data.tags.map((t: string) => (
                  <span className="tag" key={t}>
                    {t}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted small">暂无标签，快去发工单联系管理员添加吧！</p>
            )}
          </>
        )}
      </section>
    </>
  );
}

function PoetPage() {
  usePageTitle("诗人详情");
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [poetryList, setPoetryList] = useState<any[]>([]);
  const [poetryLoading, setPoetryLoading] = useState(false);
  const [poetryOffset, setPoetryOffset] = useState(0);
  const [hasMorePoetry, setHasMorePoetry] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const poetName = data?.name || data?.title || data?.author || data?.id || "诗人详情";
  const poetDynasty = data?.dynasty || data?.era || data?.dynastyName || "";

  // 加载作者信息
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError("");
    fetch(`${API_BASE}/poets/${id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        return d;
      })
      .then(setData)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  // 加载作者的诗文
  const loadPoetry = useCallback(async (reset: boolean = false) => {
    if (!id) return;
    const limit = 20;
    const offset = reset ? 0 : poetryOffset;

    setPoetryLoading(reset);
    if (!reset) setLoadingMore(true);

    try {
      const resp = await fetch(`${API_BASE}/search/poetry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: "",
          limit,
          offset,
          authorId: id,
        }),
      });
      const result = await resp.json();
      if (resp.ok && result.hits) {
        if (reset) {
          setPoetryList(result.hits);
          setPoetryOffset(result.hits.length);
        } else {
          setPoetryList((prev) => [...prev, ...result.hits]);
          setPoetryOffset((prev) => prev + result.hits.length);
        }
        // 如果返回的数据少于 limit，说明没有更多了
        setHasMorePoetry(result.hits.length === limit);
      }
    } catch (e) {
      console.error("加载诗文失败:", e);
    } finally {
      setPoetryLoading(false);
      setLoadingMore(false);
    }
  }, [id, poetryOffset]);

  // 初始加载诗文（仅在 id 变化时重置）
  useEffect(() => {
    if (id) {
      setPoetryList([]);
      setPoetryOffset(0);
      setHasMorePoetry(true);
      // 直接在这里加载，避免依赖 loadPoetry
      const loadInitialPoetry = async () => {
        setPoetryLoading(true);
        try {
          const resp = await fetch(`${API_BASE}/search/poetry`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              q: "",
              limit: 20,
              offset: 0,
              authorId: id,
            }),
          });
          const result = await resp.json();
          if (resp.ok && result.hits) {
            setPoetryList(result.hits);
            setPoetryOffset(result.hits.length);
            setHasMorePoetry(result.hits.length === 20);
          }
        } catch (e) {
          console.error("加载诗文失败:", e);
        } finally {
          setPoetryLoading(false);
        }
      };
      loadInitialPoetry();
    }
  }, [id]);

  // 加载更多诗文
  const loadMorePoetry = () => {
    if (loadingMore || !hasMorePoetry) return;
    loadPoetry(false);
  };

  return (
    <>
      <section className="hero">
        <h1>{poetName}</h1>
        <p>{poetDynasty}</p>
        {data?.avatar && (
          <div style={{ marginTop: 12 }}>
            <img
              src={data.avatar.startsWith("http") ? data.avatar : `/${data.avatar}`}
              alt={data.name || "诗人头像"}
              style={{ width: 140, height: 140, borderRadius: "50%", objectFit: "cover", boxShadow: "0 6px 18px rgba(0,0,0,0.12)" }}
            />
          </div>
        )}
      </section>
      <section className="card">
        {loading && <div className="muted">加载中...</div>}
        {error && <div className="muted">加载失败：{error}</div>}
        {!loading && !error && data && (
          <>
            {data.description && (
              <>
                <h3>简介</h3>
                <p className="muted pre-line">{data.description}</p>
              </>
            )}
            {data.content && (
              <>
                <h3>生平</h3>
                <p className="muted pre-line">{data.content}</p>
              </>
            )}
          </>
        )}
      </section>
      <section className="card">
        <h3>诗文作品</h3>
        {poetryLoading && <div className="muted">加载中...</div>}
        {!poetryLoading && poetryList.length === 0 && (
          <div className="muted">暂无诗文作品</div>
        )}
        {!poetryLoading && poetryList.length > 0 && (
          <>
            <div className="hit-list">
              {poetryList.map((poem) => (
                <article className="hit" key={poem.id}>
                  <div className="hit-title">
                    <Link to={`/poetry/${poem.id}`}>{poem.title || "无标题"}</Link>
                  </div>
                  {poem.content && (
                    <div className="hit-content">
                      {renderSegments(poem.content)}
                    </div>
                  )}
                </article>
              ))}
            </div>
            {hasMorePoetry && (
              <div style={{ marginTop: 16, textAlign: "center" }}>
                <button
                  className="btn ghost"
                  onClick={loadMorePoetry}
                  disabled={loadingMore}
                >
                  {loadingMore ? "加载中..." : "加载更多"}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}



function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/announcement" element={<AnnouncementListPage />} />
          <Route path="/announcement/new" element={<AnnouncementNewPage />} />
          <Route path="/announcement/:id" element={<AnnouncementDetailPage />} />
          <Route path="/announcement/:id/edit" element={<AnnouncementEditPage />} />
          <Route path="/discussion" element={<DiscussionListPage />} />
          <Route path="/discussion/new" element={<DiscussionNewPage />} />
          <Route path="/discussion/:id" element={<DiscussionDetailPage />} />
          <Route path="/discussion/:id/edit" element={<DiscussionEditPage />} />
          <Route path="/ticket" element={<TicketListPage />} />
          <Route path="/ticket/new" element={<TicketNewPage />} />
          <Route path="/ticket/:id" element={<TicketDetailPage />} />
          <Route path="/ticket/:id/edit" element={<TicketEditPage />} />
          <Route path="/online" element={<OnlinePage />} />
          <Route path="/rankings" element={<RankingPage />} />
          <Route path="/rank" element={<Navigate to="/rankings" replace />} />
          <Route path="/search" element={<Search />} />
          <Route path="/poetry/:id" element={<PoetryPage />} />
          <Route path="/poet/:id" element={<PoetPage />} />
          <Route path="/admin" element={<AdminNoticePage />} />
          <Route path="/admin/user" element={<AdminUserPage />} />
          <Route path="/admin/user/:uid" element={<AdminUserDetailPage />} />
          <Route path="/admin/poet" element={<AdminPoetPage />} />
          <Route path="/admin/poet/:id" element={<AdminPoetEditPage />} />
          <Route path="/admin/poetry" element={<AdminPoetryPage />} />
          <Route path="/admin/poetry/:id" element={<AdminPoetryEditPage />} />
          <Route path="/admin/fix/poet" element={<AdminFixPoetPage />} />
          <Route path="/admin/fix/poetry" element={<AdminFixPoetryPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/game/poem-snake" element={<PoemSnakePage />} />
          <Route path="/game/poem-snake/room/:roomCode" element={<PoemSnakeRoomPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/profile/:uid" element={<ProfilePage />} />
          <Route path="/profile/:uid/edit" element={<ProfileEditPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

function ProfilePage() {
  usePageTitle("个人主页");
  const { uid } = useParams();
  const [profile, setProfile] = useState<any>(null);
  const [self, setSelf] = useState<ProfileWithRole | null>(null);
  const [error, setError] = useState("");
  const [rankInfo, setRankInfo] = useState<{ rank: number; score: number; total: number } | null>(null);
  const [rankError, setRankError] = useState("");

  useEffect(() => {
    fetchProfile(API_BASE)
      .then((p) => setSelf(p))
      .catch(() => setSelf(null));
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        if (uid) {
          const resp = await fetch(`${API_BASE}/user/uid/${uid}`);
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
          setProfile(data);
        } else {
          const token = localStorage.getItem("yinxin_token");
          if (!token) {
            setError("请先登录");
            return;
          }
          const resp = await fetch(`${API_BASE}/auth/profile`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
          setProfile(data);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    };
    load();
  }, [uid]);

  useEffect(() => {
    const loadRank = async () => {
      if (!profile?.uid) return;
      try {
        setRankError("");
        const resp = await fetch(`${API_BASE}/rankings/${profile.uid}`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        setRankInfo({ rank: data.rank, score: data.score, total: data.total });
      } catch (e) {
        setRankError((e as Error).message);
        setRankInfo(null);
      }
    };
    loadRank();
  }, [profile?.uid]);

  return (
    <section className="results">
      <h2>个人主页</h2>
      {error && <div className="result-list muted">{error}</div>}
      {profile && (
        <div className="result-list">
          <div style={{ marginBottom: 12 }}>
            <img
              src={profile.avatar || ""}
              alt="avatar"
              style={{ width: 100, height: 100, borderRadius: "50%", objectFit: "cover", background: "#f3e7dd" }}
            />
          </div>
          <p>编号：{profile.uid ?? "-"}</p>
          <p>用户名：{profile.username}</p>
          <p>角色：{roleText(profile.role)}</p>
          <p>积分：{profile.score ?? 0}</p>
          <p>
            排名：
            {rankInfo ? `第 ${rankInfo.rank} / ${rankInfo.total} 名` : rankError ? `获取失败：${rankError}` : "加载中..."}
          </p>
          <p>注册时间：{formatDate(profile.createdAt)}</p>
          {self && String(self.uid) === String(profile.uid) && (
            <div style={{ marginTop: 8 }}>
              <Link className="btn ghost" to={`/profile/${profile.uid}/edit`}>
                编辑个人资料
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ProfileEditPage() {
  usePageTitle("编辑个人资料");
  const { uid } = useParams();
  const navigate = useNavigate();
  const [self, setSelf] = useState<ProfileWithRole | null>(null);
  const [error, setError] = useState("");
  const [nameMsg, setNameMsg] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [oldEmailCode, setOldEmailCode] = useState("");
  const [sending, setSending] = useState(false);
  const [sendingOldCode, setSendingOldCode] = useState(false);
  const [oldEmailVerified, setOldEmailVerified] = useState(false);

  useEffect(() => {
    fetchProfile(API_BASE)
      .then((p) => setSelf(p))
      .catch(() => setSelf(null));
  }, []);

  const isSelf = React.useMemo(() => {
    if (!uid || !self) return false;
    return String(self.uid) === uid;
  }, [uid, self]);

  const invalidateAndRelogin = (msg: string) => {
    clearToken();
    setTimeout(() => navigate("/login"), 500);
    return msg;
  };

  const submitName = async () => {
    setNameMsg("");
    if (!nameInput.trim()) {
      setNameMsg("请输入新昵称");
      return;
    }
    try {
      const token = getToken();
      if (!token) throw new Error("请先登录");
      const resp = await fetch(`${API_BASE}/profile/update-name`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: nameInput.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setNameMsg(invalidateAndRelogin("修改成功，请重新登录生效"));
    } catch (e) {
      setNameMsg((e as Error).message);
    }
  };

  const submitPwd = async () => {
    setPwdMsg("");
    if (!oldPwd || !newPwd) {
      setPwdMsg("请填写原密码和新密码");
      return;
    }
    try {
      const token = getToken();
      if (!token) throw new Error("请先登录");
      const resp = await fetch(`${API_BASE}/profile/update-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setPwdMsg(invalidateAndRelogin("密码已修改，请重新登录"));
    } catch (e) {
      setPwdMsg((e as Error).message);
    }
  };

  const sendOldEmailCode = async () => {
    setEmailMsg("");
    if (!self?.email) {
      setEmailMsg("未找到当前邮箱");
      return;
    }
    setSendingOldCode(true);
    try {
      await sendCode(API_BASE, self.email);
      setEmailMsg("验证码已发送到原邮箱，请查收");
    } catch (e) {
      setEmailMsg((e as Error).message);
    } finally {
      setSendingOldCode(false);
    }
  };

  const verifyOldEmail = () => {
    setEmailMsg("");
    if (!oldEmailCode.trim()) {
      setEmailMsg("请输入原邮箱验证码");
      return;
    }
    // 前端验证通过，实际验证在后端
    setOldEmailVerified(true);
    setEmailMsg("原邮箱验证通过，请继续填写新邮箱信息");
  };

  const sendEmailCode = async () => {
    setEmailMsg("");
    if (!oldEmailVerified) {
      setEmailMsg("请先验证原邮箱");
      return;
    }
    if (!newEmail.trim()) {
      setEmailMsg("请输入新邮箱");
      return;
    }
    setSending(true);
    try {
      await sendCode(API_BASE, newEmail.trim());
      setEmailMsg("验证码已发送到新邮箱");
    } catch (e) {
      setEmailMsg((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const submitEmail = async () => {
    setEmailMsg("");
    if (!oldEmailVerified || !oldEmailCode.trim()) {
      setEmailMsg("请先验证原邮箱");
      return;
    }
    if (!newEmail.trim() || !code.trim()) {
      setEmailMsg("请输入新邮箱和新邮箱验证码");
      return;
    }
    try {
      const token = getToken();
      if (!token) throw new Error("请先登录");
      const resp = await fetch(`${API_BASE}/profile/update-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: newEmail.trim(),
          code: code.trim(),
          oldEmailCode: oldEmailCode.trim()
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setEmailMsg(invalidateAndRelogin("邮箱已更新，请重新登录"));
    } catch (e) {
      setEmailMsg((e as Error).message);
      // 如果验证失败，重置状态
      if ((e as Error).message.includes("原邮箱验证码")) {
        setOldEmailVerified(false);
        setOldEmailCode("");
      }
    }
  };

  if (!self) {
    return (
      <section className="results">
        <h2>编辑个人资料</h2>
        <div className="result-list muted">请先登录</div>
      </section>
    );
  }

  if (!isSelf) {
    return (
      <section className="results">
        <h2>编辑个人资料</h2>
        <div className="result-list muted">只能编辑自己的资料</div>
      </section>
    );
  }

  const lastChange = self.usernameChangedAt ? new Date(self.usernameChangedAt) : null;
  const nextAllowed =
    lastChange && !Number.isNaN(lastChange.getTime())
      ? new Date(lastChange.getTime() + 7 * 24 * 3600 * 1000).toLocaleString("zh-CN")
      : "随时可改";

  return (
    <section className="results">
      <h2>编辑个人资料</h2>
      {error && <div className="result-list muted">{error}</div>}
      <div className="result-list">
        <h3>修改昵称（每周一次）</h3>
        <p className="muted small">上次修改：{lastChange ? lastChange.toLocaleString("zh-CN") : "未修改过"}，下次可改：{nextAllowed}</p>
        <div className="nickname-input-wrapper">
          <div className="nickname-input-container">
            <svg className="nickname-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <input
              className="nickname-input"
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="请输入新昵称"
              maxLength={50}
            />
          </div>
          <button className="nickname-btn" type="button" onClick={submitName}>
            保存昵称
          </button>
        </div>
        {nameMsg && <div className="muted small" style={{ marginTop: "8px", padding: "8px 12px", borderRadius: "8px", background: nameMsg.includes("成功") ? "rgba(76, 175, 80, 0.1)" : "rgba(244, 67, 54, 0.1)", color: nameMsg.includes("成功") ? "#4caf50" : "#f44336" }}>{nameMsg}</div>}
      </div>
      <div className="result-list">
        <h3>修改密码</h3>
        <div className="form">
          <label>
            原密码
            <input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} />
          </label>
          <label>
            新密码（至少 6 位）
            <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
          </label>
          <button className="btn" type="button" onClick={submitPwd}>
            保存密码
          </button>
          {pwdMsg && <div className="muted small">{pwdMsg}</div>}
        </div>
      </div>
      <div className="result-list">
        <h3>切换绑定邮箱（双重验证）</h3>
        <p className="muted small" style={{ marginBottom: "16px" }}>
          为了账号安全，需要先验证原邮箱，再验证新邮箱
        </p>
        <div className="form">
          {!oldEmailVerified ? (
            <>
              <label>
                第一步：验证原邮箱 {self.email ? `(${self.email})` : ""}
                <div className="input-with-btn">
                  <input
                    type="text"
                    value={oldEmailCode}
                    onChange={(e) => setOldEmailCode(e.target.value)}
                    placeholder="原邮箱验证码"
                  />
                  <button className="btn ghost" type="button" disabled={sendingOldCode} onClick={sendOldEmailCode}>
                    {sendingOldCode ? "发送中..." : "发送验证码"}
                  </button>
                </div>
              </label>
              <button className="btn" type="button" onClick={verifyOldEmail} disabled={!oldEmailCode.trim()}>
                验证原邮箱
              </button>
            </>
          ) : (
            <>
              <div style={{ padding: "12px", background: "rgba(76, 175, 80, 0.1)", borderRadius: "8px", marginBottom: "12px", color: "#4caf50", fontSize: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                原邮箱验证通过
              </div>
              <label>
                第二步：输入新邮箱
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="请输入新邮箱地址"
                />
              </label>
              <label>
                新邮箱验证码
                <div className="input-with-btn">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="新邮箱验证码"
                  />
                  <button className="btn ghost" type="button" disabled={sending} onClick={sendEmailCode}>
                    {sending ? "发送中..." : "发送验证码"}
                  </button>
                </div>
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <button className="btn" type="button" onClick={submitEmail}>
                  保存邮箱
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => {
                    setOldEmailVerified(false);
                    setOldEmailCode("");
                    setNewEmail("");
                    setCode("");
                    setEmailMsg("");
                  }}
                >
                  重新开始
                </button>
              </div>
            </>
          )}
          {emailMsg && (
            <div
              className="muted small"
              style={{
                marginTop: "8px",
                padding: "8px 12px",
                borderRadius: "8px",
                background: emailMsg.includes("成功") || emailMsg.includes("通过") || emailMsg.includes("已发送")
                  ? "rgba(76, 175, 80, 0.1)"
                  : emailMsg.includes("错误") || emailMsg.includes("失败")
                    ? "rgba(244, 67, 54, 0.1)"
                    : "rgba(255, 193, 7, 0.1)",
                color: emailMsg.includes("成功") || emailMsg.includes("通过") || emailMsg.includes("已发送")
                  ? "#4caf50"
                  : emailMsg.includes("错误") || emailMsg.includes("失败")
                    ? "#f44336"
                    : "#ff9800"
              }}
            >
              {emailMsg}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function AboutPage() {
  usePageTitle("关于我们");
  const [admins, setAdmins] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const resp = await fetch(`${API_BASE}/about/admins`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        setAdmins(data || []);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const renderRoles = (u: any) => {
    const tags: string[] = [];
    if (u.is_super_admin) tags.push("超级管理员");
    if (u.role > 0) tags.push("管理员");
    if (u.is_announcement_admin) tags.push("公告管理员");
    if (u.is_wiki_admin) tags.push("资料管理员");
    if (tags.length === 0) tags.push("用户");
    return tags.join(" / ");
  };

  return (
    <>
      <section className="hero">
        <h1>关于我们</h1>
        <p>核心成员与职责</p>
      </section>
      <section className="results">
        <div className="result-list">
          {loading && <div className="muted">加载中...</div>}
          {error && <div className="muted">加载失败：{error}</div>}
          {!loading && !error && admins.length === 0 && <div className="muted">暂无管理员信息</div>}
          {!loading && !error && admins.length > 0 && (
            <div className="hit-list">
              {admins.map((u) => (
                <article className="hit" key={u.uid}>
                  <div className="hit-title">
                    <Link to={`/profile/${u.uid}`}>{u.username}</Link>
                  </div>
                  <div className="hit-meta">{renderRoles(u)}</div>
                  <div className="muted small">UID: {u.uid} · 积分: {u.score ?? 0}</div>
                  <div className="muted small">加入时间：{formatDate(u.created_at)}</div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function GamesPage() {
  usePageTitle("游戏列表");
  const games = [
    {
      title: "古诗（）谜",
      link: "/game/poem-snake",
      desc: "公屏随机古诗文，你需输入含高亮字的一句古诗词，在线人数为 x 获得 x 分；1 分可跳过一个字；支持 Ctrl+Enter 提交。支持 1v1 随机匹配对手和自建房与好友娱乐。1v1 匹配得分更高！",
      note: "灵感来源于 https://github.com/poem-snake/poem-snake",
    },
  ];

  return (
    <>
      <section className="hero">
        <h1>游戏列表</h1>
        <p>趣味诗词互动，随时开玩</p>
      </section>
      <section className="results">
        <div className="result-list">
          {games.map((g) => (
            <article className="hit" key={g.title}>
              <div className="hit-title" style={{ fontSize: 22 }}>
                <Link to={g.link}>
                  {g.title}
                </Link>
              </div>
              <div className="hit-content">{g.desc}</div>
              <div className="muted small">
                {g.note ? `${g.note}` : ""}
              </div>
            </article>
          ))}
          <div className="muted small" style={{ marginTop: 8 }}>
            更多游戏建设中，敬请期待。
          </div>
        </div>
      </section>
    </>
  );
}

const rootEl = document.querySelector<HTMLDivElement>("#app");
if (!rootEl) throw new Error("App container missing");
ReactDOM.createRoot(rootEl).render(<App />);