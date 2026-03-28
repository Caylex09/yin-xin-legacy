import React, { useState, useEffect } from "react";
import { usePageTitle } from "../../hooks/usePageTitle";
import { API_BASE } from "../../config";
import { getToken, fetchProfile } from "../../auth";

export function AdminPopularPage() {
    usePageTitle("百科内容分配");
    const [q, setQ] = useState("");
    const [type, setType] = useState<"poet" | "poetry">("poet");
    const [data, setData] = useState<any[]>([]);
    const [allWikiData, setAllWikiData] = useState<any[]>([]);
    const [attributes, setAttributes] = useState<any[]>([]);
    const [authError, setAuthError] = useState("");

    // Authors cache mapping author ID -> { name, dynasty }
    const [authors, setAuthors] = useState<Record<string, { name?: string; dynasty?: string }>>({});

    // Modified items waiting to be saved
    const [modified, setModified] = useState<{ [id: string]: any }>({});

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    const loadWikiItems = async () => {
        try {
            const res = await fetch(`${API_BASE}/popular`);
            const d = await res.json();
            if (type === "poet") {
                setAllWikiData(d.poets || []);
            } else {
                setAllWikiData(d.poetry || []);
            }
            setCurrentPage(1);
        } catch (e) {
            console.error(e);
        }
    };

    const loadAttributes = async () => {
        try {
            const res = await fetch(`${API_BASE}/wiki/attributes`);
            const data = await res.json();
            setAttributes(data || []);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        const checkAuth = async () => {
            const profile = await fetchProfile(API_BASE);
            if (!profile || (!profile.isWikiAdmin && !profile.isSuperAdmin && profile.role !== 1)) {
                setAuthError("没有权限访问此页面");
            }
        };
        checkAuth();
        loadAttributes();
    }, []);

    useEffect(() => {
        loadWikiItems();
        setModified({});
        setData([]);
    }, [type]);

    useEffect(() => {
        if (type !== 'poetry') return;
        const items = [...data, ...allWikiData];
        const ids = Array.from(
            new Set(
                items
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
                    /* ignore */
                });
        });
    }, [data, allWikiData, authors, type]);

    const onSearch = async () => {
        if (!q.trim()) {
            setData([]);
            return;
        }

        let exactMatch = null;
        try {
            const res = await fetch(`${API_BASE}/${type === "poet" ? "poets" : "poetry"}/${q.trim()}`);
            if (res.ok) {
                const item = await res.json();
                if (item && item.id) {
                    exactMatch = item;
                }
            }
        } catch (e) {
            // ignore
        }

        const res = await fetch(`${API_BASE}/search/${type === "poet" ? "poets" : "poetry"}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ q: q.trim(), limit: 50 }),
        });
        const { hits } = await res.json();

        let mergedHits = hits || [];
        if (exactMatch) {
            mergedHits = mergedHits.filter((h: any) => h.id !== exactMatch.id);
            mergedHits.unshift(exactMatch);
        }

        const displayHits = mergedHits.slice(0, 50);
        setData(displayHits);
    };

    // Keep track of unsaved changes in `modified` mapping
    const updateLocal = (id: string, item: any, updates: any) => {
        const orig = modified[id] ? modified[id] : { ...item };
        setModified({
            ...modified,
            [id]: { ...orig, ...updates }
        });
    };

    const updateAttr = (id: string, item: any, attrKey: string, val: string) => {
        const orig = modified[id] ? modified[id] : { ...item };
        const wiki_attributes = { ...(orig.wiki_attributes || {}), [attrKey]: val };
        setModified({
            ...modified,
            [id]: { ...orig, wiki_attributes }
        });
    };

    const onSaveChanges = async () => {
        const ids = Object.keys(modified);
        if (ids.length === 0) {
            alert("没有修改的内容");
            return;
        }

        // Validate if any update lacks ID
        const updates = ids.map(id => ({
            id,
            ...modified[id]
        }));

        const token = getToken();
        const batchEndpoint = type === "poet" ? "/wiki/batch_poets" : "/wiki/batch_poetry";

        try {
            const res = await fetch(`${API_BASE}${batchEndpoint}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(updates),
            });
            const d = await res.json();
            if (d.error) {
                alert(d.error);
            } else {
                alert("批量保存成功！索引会有延迟，请稍后刷新");
                setModified({});
                loadWikiItems();
                if (q) onSearch();
            }
        } catch (e) {
            alert((e as Error).message);
        }
    };

    const currentAttrs = attributes.filter(a => a.target_type === type);

    const renderRow = (item: any) => {
        const currentData = modified[item.id] || item;
        const isWiki = !!currentData.wiki;

        return (
            <tr key={item.id} style={{ background: modified[item.id] ? "#fffbea" : "inherit" }}>
                <td>
                    <a href={`/${type === 'poet' ? 'poet' : 'poetry'}/${item.id}`} target="_blank" rel="noreferrer" className="link-blue">
                        {item.id}
                    </a>
                </td>
                <td>
                    {item.name || item.title}
                    {(() => {
                        if (type !== "poetry") return null;
                        const aid = item.author ? String(item.author) : "";
                        const dynasty = (aid && authors[aid]?.dynasty) || item.dynasty || "";
                        const authorName = (aid && authors[aid]?.name) || item.authorName || item.author || "未知";
                        if (!dynasty && !authorName) return null;
                        return (
                            <span className="muted small" style={{ marginLeft: 8 }}>
                                ({dynasty ? `${dynasty} · ` : ""}{authorName})
                            </span>
                        );
                    })()}
                </td>
                <td>
                    <button
                        className="btn ghost"
                        style={{ color: isWiki ? "green" : "gray" }}
                        onClick={() => updateLocal(item.id, item, { wiki: !isWiki })}
                    >
                        {isWiki ? "已设为百科" : "非百科"}
                    </button>
                </td>
                <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {currentAttrs.map(attr => {
                            const opts = attr.options.split(",").map((s: string) => s.trim());
                            return (
                                <div key={attr.key} style={{ display: "flex", alignItems: "center", border: "1px solid #eee", padding: "2px 6px", borderRadius: 4 }}>
                                    <span className="muted small" style={{ marginRight: 6 }}>{attr.name}</span>
                                    <select
                                        value={(currentData.wiki_attributes || {})[attr.key] || ""}
                                        onChange={(e) => updateAttr(item.id, item, attr.key, e.target.value)}
                                    >
                                        <option value="">(未设)</option>
                                        {opts.map((o: string) => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                </div>
                            );
                        })}
                    </div>
                </td>
            </tr>
        );
    };

    return (
        <>
            <section className="hero">
                <h1>百科内容分配</h1>
                <p>搜索内容或管理已标记为百科的项目，进行批量属性编辑</p>
            </section>

            {authError ? (
                <section className="card">
                    <div style={{ color: "var(--red)", padding: "20px", textAlign: "center" }}>{authError}</div>
                </section>
            ) : (
                <section className="card">
                    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                        <select value={type} onChange={(e) => setType(e.target.value as any)} className="input" style={{ width: 100 }}>
                            <option value="poet">诗人</option>
                            <option value="poetry">诗词</option>
                        </select>
                        <input className="input" style={{ flex: 1 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索 ID 或名称，加载以添加..." />
                        <button className="btn primary" onClick={onSearch}>搜索</button>
                    </div>

                    {Object.keys(modified).length > 0 && (
                        <div style={{ padding: "12px", background: "#fffbea", borderRadius: "8px", marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>待保存修改：{Object.keys(modified).length} 项</span>
                            <button className="btn primary" onClick={onSaveChanges}>确认保存</button>
                        </div>
                    )}

                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>标题/姓名</th>
                                <th>百科状态</th>
                                <th>属性分配</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Show search results first if any */}
                            {data.length > 0 && (
                                <>
                                    <tr><td colSpan={4} style={{ background: "#f5f5f5", fontWeight: "bold" }}>搜索结果</td></tr>
                                    {data.map(renderRow)}
                                </>
                            )}

                            {/* Then show existing wiki items */}
                            <tr><td colSpan={4} style={{ background: "#f5f5f5", fontWeight: "bold" }}>所有百科项目</td></tr>
                            {allWikiData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(renderRow)}
                            {allWikiData.length === 0 && (
                                <tr><td colSpan={4} style={{ textAlign: "center" }}>暂无百科项目</td></tr>
                            )}
                        </tbody>
                    </table>

                    <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
                        <button
                            className="btn ghost"
                            disabled={currentPage <= 1}
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        >
                            上一页
                        </button>
                        <span className="muted">
                            第 {currentPage} / {Math.max(1, Math.ceil(allWikiData.length / itemsPerPage))} 页
                        </span>
                        <button
                            className="btn ghost"
                            disabled={currentPage >= Math.ceil(allWikiData.length / itemsPerPage)}
                            onClick={() => setCurrentPage(p => p + 1)}
                        >
                            下一页
                        </button>
                    </div>
                </section>
            )}
        </>
    );
}
