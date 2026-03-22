import React, { useState, useEffect } from "react";
import { usePageTitle } from "../../hooks/usePageTitle";
import { API_BASE } from "../../config";
import { getToken, fetchProfile } from "../../auth";

export function AdminWikiPage() {
    usePageTitle("百科属性配置");
    const [authError, setAuthError] = useState<string | null>(null);
    const [attributes, setAttributes] = useState<any[]>([]);
    const [targetType, setTargetType] = useState<"poet" | "poetry">("poet");
    const [key, setKey] = useState("");
    const [name, setName] = useState("");
    const [options, setOptions] = useState("");

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    const loadAttributes = async () => {
        try {
            const res = await fetch(`${API_BASE}/wiki/attributes`);
            const data = await res.json();
            setAttributes(data || []);
            setCurrentPage(1);
        } catch (e) {
            alert((e as Error).message);
        }
    };

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const profile = await fetchProfile(API_BASE);
                if (!profile || (!profile.isWikiAdmin && !profile.isSuperAdmin)) {
                    setAuthError("没有权限访问此页面，需要 Wiki 管理员或超级管理员权限。");
                    return false;
                }
                return true;
            } catch (err) {
                setAuthError("尚未登录或获取权限失败");
                return false;
            }
        };

        checkAuth().then((ok) => {
            if (ok) {
                loadAttributes();
            }
        });
    }, []);

    const onAdd = async () => {
        if (!key || !name || !options) {
            alert("请填写完整参数");
            return;
        }
        const token = getToken();
        const res = await fetch(`${API_BASE}/wiki/attributes`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ target_type: targetType, key, name, options }),
        });
        const d = await res.json();
        if (d.error) {
            alert(d.error);
        } else {
            setKey("");
            setName("");
            setOptions("");
            loadAttributes();
        }
    };

    const onDelete = async (id: number) => {
        if (!confirm("确定删除属性配置？")) return;
        const token = getToken();
        const res = await fetch(`${API_BASE}/wiki/attributes/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
        });
        const d = await res.json();
        if (d.error) {
            alert(d.error);
        } else {
            loadAttributes();
        }
    };

    return (
        <>
            <section className="hero">
                <h1>百科属性配置</h1>
                <p>动态管理百科系统中的属性键值及选项</p>
            </section>

            {authError ? (
                <section className="card">
                    <div style={{ color: "var(--red)", padding: "20px", textAlign: "center" }}>{authError}</div>
                </section>
            ) : (
                <section className="card">
                    <h3>添加新属性</h3>
                    <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                        <select value={targetType} onChange={(e) => setTargetType(e.target.value as any)} className="input" style={{ width: 100 }}>
                            <option value="poet">诗人</option>
                            <option value="poetry">诗词</option>
                        </select>
                        <input className="input" style={{ width: 120 }} value={key} onChange={(e) => setKey(e.target.value)} placeholder="键名(e.g. gender)" />
                        <input className="input" style={{ width: 120 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="显示名(e.g. 性别)" />
                        <input className="input" style={{ flex: 1, minWidth: 200 }} value={options} onChange={(e) => setOptions(e.target.value)} placeholder="选项(逗号分隔 e.g. 男,女)" />
                        <button className="btn primary" onClick={onAdd}>添加</button>
                    </div>

                    <h3>现有属性</h3>
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>作用对象</th>
                                <th>键名 (Key)</th>
                                <th>显示名 (Name)</th>
                                <th>选项 (Options)</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {attributes.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(attr => (
                                <tr key={attr.id}>
                                    <td>{attr.id}</td>
                                    <td>{attr.target_type === "poet" ? "诗人" : "诗词"}</td>
                                    <td>{attr.key}</td>
                                    <td>{attr.name}</td>
                                    <td>{attr.options}</td>
                                    <td>
                                        <button className="btn ghost" onClick={() => onDelete(attr.id)}>删除</button>
                                    </td>
                                </tr>
                            ))}
                            {attributes.length === 0 && (
                                <tr><td colSpan={6} style={{ textAlign: "center" }}>暂无属性</td></tr>
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
                            第 {currentPage} / {Math.max(1, Math.ceil(attributes.length / itemsPerPage))} 页
                        </span>
                        <button
                            className="btn ghost"
                            disabled={currentPage >= Math.ceil(attributes.length / itemsPerPage)}
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
