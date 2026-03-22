import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { API_BASE } from "../config";
import { usePageTitle } from "../hooks/usePageTitle";

function PoetInlineName({ authorId }: { authorId: string }) {
    const [name, setName] = useState(authorId && authorId.length > 10 ? "..." : authorId);
    useEffect(() => {
        if (!authorId || authorId.length < 5) return;
        fetch(`${API_BASE}/poets/${authorId}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (d && d.name) {
                    setName(`${d.dynasty ? `${d.dynasty} · ` : ""}${d.name}`);
                } else if (authorId && authorId.length > 10) {
                    setName("未知作者");
                }
            })
            .catch(() => {
                if (authorId && authorId.length > 10) setName("未知作者");
            });
    }, [authorId]);
    return <span>{name}</span>;
}

function PoetRowWithAvatar({ poet }: { poet: any }) {
    const [avatar, setAvatar] = useState("");
    const [dynasty, setDynasty] = useState(poet.dynasty || "");

    useEffect(() => {
        if (!poet.id || poet.id.length < 5) return;
        fetch(`${API_BASE}/poets/${poet.id}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (d) {
                    if (d.avatar) setAvatar(d.avatar);
                    if (d.dynasty && !dynasty) setDynasty(d.dynasty);
                }
            })
            .catch(() => { });
    }, [poet.id, dynasty]);

    const title = poet.name || poet.title || "诗人";
    const displayName = dynasty ? `${dynasty} · ${title}` : title;

    return (
        <li style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #eee" }}>
            <img
                src={avatar || "avatar/yinxin.png"}
                alt="avatar"
                style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", background: "#f5f5f5" }}
            />
            <Link to={`/poet/${poet.id}`} className="link-blue" style={{ fontSize: "16px", fontWeight: 500 }}>
                {displayName}
            </Link>
        </li>
    );
}

export function PopularPage() {
    usePageTitle("藏诗阁");
    const [params, setParams] = useSearchParams();
    const tab = params.get("tab") || "poet";
    const pageParam = Math.max(Number(params.get("page") || "1"), 1);
    const pageSize = 20;

    const [data, setData] = useState<{ poets: any[]; poetry: any[] }>({ poets: [], poetry: [] });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        setLoading(true);
        fetch(`${API_BASE}/popular`)
            .then((r) => r.json())
            .then((d) => {
                if (d.error) throw new Error(d.error);
                setData(d);
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    const setTab = (newTab: string) => {
        setParams(new URLSearchParams({ tab: newTab, page: "1" }));
    };

    const setPage = (p: number) => {
        setParams(new URLSearchParams({ tab, page: String(p) }));
    };

    const currentList = tab === "poet" ? data.poets : data.poetry;
    const totalPages = Math.max(1, Math.ceil(currentList.length / pageSize));
    const safePage = Math.min(pageParam, Math.max(1, totalPages));
    const displayList = currentList.slice((safePage - 1) * pageSize, safePage * pageSize);

    return (
        <>
            <section className="hero">
                <h1>藏诗阁</h1>
                <p>这里收录了诗词及诗人属性和百科数据，也是部分游戏的题库</p>
                <div className="tabs" style={{ marginTop: 24, display: "flex", gap: 16, justifyContent: "center" }}>
                    <button
                        className={`btn ${tab === "poet" ? "primary" : "ghost"}`}
                        onClick={() => setTab("poet")}
                    >热门诗人</button>
                    <button
                        className={`btn ${tab === "poetry" ? "primary" : "ghost"}`}
                        onClick={() => setTab("poetry")}
                    >热门诗词</button>
                </div>
            </section>

            <section className="card">
                {loading && <div className="muted">加载中...</div>}
                {error && <div className="muted">加载失败: {error}</div>}
                {!loading && !error && (
                    <div>
                        {currentList.length === 0 ? (
                            <p className="muted small">暂无数据</p>
                        ) : (
                            <>
                                <ul className="list" style={{ listStyle: "none", padding: 0 }}>
                                    {displayList.map((p) => (
                                        tab === "poet" ? (
                                            <PoetRowWithAvatar key={p.id} poet={p} />
                                        ) : (
                                            <li key={p.id} style={{ padding: "12px 0", borderBottom: "1px solid #eee" }}>
                                                <Link to={`/poetry/${p.id}`} className="link-blue" style={{ fontSize: "16px" }}>
                                                    {p.title || "未知内容"}
                                                    {" （"}
                                                    {p.author ? <PoetInlineName authorId={p.author} /> : "未知作者"}
                                                    {"）"}
                                                </Link>
                                            </li>
                                        )
                                    ))}
                                </ul>

                                <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
                                    <button
                                        className="btn ghost"
                                        disabled={safePage <= 1}
                                        onClick={() => setPage(safePage - 1)}
                                    >
                                        上一页
                                    </button>
                                    <span className="muted">
                                        第 {safePage} / {totalPages} 页
                                    </span>
                                    <button
                                        className="btn ghost"
                                        disabled={safePage >= totalPages}
                                        onClick={() => setPage(safePage + 1)}
                                    >
                                        下一页
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </section>
        </>
    );
}

