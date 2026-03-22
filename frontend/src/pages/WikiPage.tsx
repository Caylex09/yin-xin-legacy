import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { API_BASE } from "../config";
import { usePageTitle } from "../hooks/usePageTitle";

export function WikiPage() {
    const { type, id } = useParams();
    usePageTitle(`百科中心 - ${id}`);
    const [data, setData] = useState<any>(null);
    const [attributesConfig, setAttributesConfig] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!id || !type) return;
        setLoading(true);
        Promise.all([
            fetch(`${API_BASE}/${type === 'poet' ? 'poets' : 'poetry'}/${id}`).then((r) => r.ok ? r.json() : null),
            fetch(`${API_BASE}/wiki/attributes`).then((r) => r.ok ? r.json() : [])
        ])
            .then(([item, attrs]) => {
                setAttributesConfig(attrs || []);
                if (item && item.wiki) return setData({ type, ...item });
                throw new Error("未找到对应的百科信息");
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [id, type]);

    if (loading) return <div className="muted p-4">加载中...</div>;
    if (error) return <div className="muted p-4">加载失败：{error}</div>;
    if (!data) return null;

    const currentAttrs = attributesConfig.filter(a => a.target_type === data.type);
    const wikiData = data.wiki_attributes || {};

    return (
        <>
            <section className="hero">
                <h1>百科 - {data.name || data.title}</h1>
            </section>
            <section className="card">
                <h3>百科属性</h3>
                <ul className="list">
                    {currentAttrs.length > 0 ? (
                        currentAttrs.map(attr => (
                            <li key={attr.key}>
                                {attr.name}: {wikiData[attr.key] || "未设"}
                            </li>
                        ))
                    ) : (
                        <li>暂无属性配置</li>
                    )}
                </ul>
                <div style={{ marginTop: 24 }}>
                    <Link to={`/${data.type}/${id}`} className="btn ghost">返回原页面</Link>
                </div>
            </section>
        </>
    );
}