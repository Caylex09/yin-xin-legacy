// import React from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { API_BASE } from "../../config";
import { usePageTitle } from "../../hooks/usePageTitle";
import { MarkdownRenderer } from "../../components/MarkdownRenderer";
import { formatDate } from "../../utils/format";
import { getToken, fetchProfile, type ProfileWithRole } from "../../auth";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { Toast } from "../../components/Toast";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useCallback, useEffect, useState } from "react";

export function DiscussionDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [discussion, setDiscussion] = useState<any>(null);
    const [replies, setReplies] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [profile, setProfile] = useState<ProfileWithRole | null>(null);
    const [replyContent, setReplyContent] = useState("");
    const [submittingReply, setSubmittingReply] = useState(false);
    const { toast, showToast, hideToast } = useToast();
    const { confirm, showConfirm, hideConfirm } = useConfirm();

    useEffect(() => {
        fetchProfile(API_BASE).then((p) => setProfile(p)).catch(() => setProfile(null));
    }, []);

    const loadDiscussion = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        setError("");
        try {
            const [discResp, repliesResp] = await Promise.all([
                fetch(`${API_BASE}/discussions/${id}`),
                fetch(`${API_BASE}/discussions/${id}/replies`),
            ]);
            const discData = await discResp.json();
            const repliesData = await repliesResp.json();
            if (!discResp.ok) throw new Error(discData.error || `HTTP ${discResp.status}`);
            if (!repliesResp.ok) throw new Error(repliesData.error || `HTTP ${repliesResp.status}`);
            setDiscussion(discData);
            setReplies(repliesData);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadDiscussion();
    }, [loadDiscussion]);

    const submitReply = async () => {
        if (!replyContent.trim()) {
            showToast("回复内容不能为空", "warning");
            return;
        }
        const token = getToken();
        if (!token) {
            showToast("请先登录", "warning");
            return;
        }
        setSubmittingReply(true);
        try {
            const resp = await fetch(`${API_BASE}/discussions/${id}/replies`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ content: replyContent.trim() }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
            setReplyContent("");
            loadDiscussion();
            showToast("回复成功", "success");
        } catch (e) {
            showToast((e as Error).message, "error");
        } finally {
            setSubmittingReply(false);
        }
    };

    const deleteDiscussion = async () => {
        if (!profile) {
            showToast("请先登录", "warning");
            return;
        }
        if (discussion.created_by !== profile.uid && !profile.isSuperAdmin) {
            showToast("只能删除自己的讨论", "error");
            return;
        }
        showConfirm("确定要删除这条讨论吗？", () => {
            const token = getToken();
            if (!token) {
                showToast("请先登录", "warning");
                return;
            }
            fetch(`${API_BASE}/discussions/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            })
                .then(async (resp) => {
                    const data = await resp.json().catch(() => ({}));
                    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
                    showToast("删除成功", "success");
                    navigate("/discussion");
                })
                .catch((e) => {
                    showToast((e as Error).message, "error");
                });
        }, { type: "danger" });
    };

    usePageTitle(discussion ? discussion.title : "讨论详情");

    if (loading) {
        return (
            <>
                <section className="hero">
                    <h1>讨论详情</h1>
                </section>
                <section className="results">
                    <div className="result-list">
                        <div className="muted">加载中...</div>
                    </div>
                </section>
            </>
        );
    }

    if (error || !discussion) {
        return (
            <>
                <section className="hero">
                    <h1>讨论详情</h1>
                </section>
                <section className="results">
                    <div className="result-list">
                        <div className="muted">{error || "讨论不存在"}</div>
                        <div style={{ marginTop: 12 }}>
                            <Link className="btn ghost" to="/discussion">
                                返回讨论列表
                            </Link>
                        </div>
                    </div>
                </section>
            </>
        );
    }

    return (
        <>
            <section className="hero">
                <h1>{discussion.title}</h1>
                <p>
                    {discussion.creator_username && (
                        <span>
                            <img
                                src={discussion.creator_avatar || "https://cn.gravatar.com/avatar/00000000000000000000000000000000?d=identicon&s=32"}
                                alt={discussion.creator_username}
                                style={{ width: 24, height: 24, borderRadius: "50%", verticalAlign: "middle", marginRight: 6 }}
                            />
                            {discussion.creator_username}
                        </span>
                    )}
                    {" · "}
                    {formatDate(discussion.created_at)}
                    {discussion.updated_at !== discussion.created_at && ` · 更新于 ${formatDate(discussion.updated_at)}`}
                </p>
            </section>
            <section className="results">
                <div className="result-list">
                    <article className="hit">
                        <div className="hit-content" style={{ marginTop: 0 }}>
                            <MarkdownRenderer content={discussion.content} />
                        </div>
                        {profile && (discussion.created_by === profile.uid || profile.isSuperAdmin) && (
                            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                                <Link className="btn ghost" to={`/discussion/${id}/edit`}>
                                    编辑
                                </Link>
                                <button className="btn ghost" onClick={deleteDiscussion}>
                                    删除
                                </button>
                            </div>
                        )}
                    </article>

                    <div style={{ marginTop: 32 }}>
                        <h2 style={{ fontSize: "1.5em", marginBottom: 16 }}>回复 ({replies.length})</h2>
                        {replies.length === 0 ? (
                            <div className="muted">暂无回复</div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                {replies.map((reply) => (
                                    <article key={reply.id} className="hit" style={{ padding: 16 }}>
                                        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                                            {reply.creator_username && (
                                                <>
                                                    <img
                                                        src={reply.creator_avatar || "https://cn.gravatar.com/avatar/00000000000000000000000000000000?d=identicon&s=32"}
                                                        alt={reply.creator_username}
                                                        style={{ width: 32, height: 32, borderRadius: "50%", marginRight: 8 }}
                                                    />
                                                    <span style={{ fontWeight: 500 }}>{reply.creator_username}</span>
                                                </>
                                            )}
                                            <span style={{ marginLeft: "auto", color: "#666", fontSize: "0.9em" }}>{formatDate(reply.created_at)}</span>
                                        </div>
                                        <div className="hit-content" style={{ marginTop: 8 }}>
                                            <MarkdownRenderer content={reply.content} />
                                        </div>
                                        {profile && (reply.created_by === profile.uid || profile.isSuperAdmin) && (
                                            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                                                <button
                                                    className="btn ghost"
                                                    style={{ fontSize: "12px" }}
                                                    onClick={async () => {
                                                        const newContent = prompt("编辑回复内容：", reply.content);
                                                        if (newContent === null || newContent.trim() === reply.content) return;
                                                        const token = getToken();
                                                        if (!token) {
                                                            showToast("请先登录", "warning");
                                                            return;
                                                        }
                                                        try {
                                                            const resp = await fetch(`${API_BASE}/discussions/${id}/replies/${reply.id}`, {
                                                                method: "PUT",
                                                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                                                body: JSON.stringify({ content: newContent.trim() }),
                                                            });
                                                            const data = await resp.json();
                                                            if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
                                                            loadDiscussion();
                                                            showToast("编辑成功", "success");
                                                        } catch (e) {
                                                            showToast((e as Error).message, "error");
                                                        }
                                                    }}
                                                >
                                                    编辑
                                                </button>
                                                <button
                                                    className="btn ghost"
                                                    style={{ fontSize: "12px" }}
                                                    onClick={() => {
                                                        showConfirm("确定要删除这条回复吗？", () => {
                                                            const token = getToken();
                                                            if (!token) {
                                                                showToast("请先登录", "warning");
                                                                return;
                                                            }
                                                            fetch(`${API_BASE}/discussions/${id}/replies/${reply.id}`, {
                                                                method: "DELETE",
                                                                headers: { Authorization: `Bearer ${token}` },
                                                            })
                                                                .then(async (resp) => {
                                                                    const data = await resp.json().catch(() => ({}));
                                                                    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
                                                                    loadDiscussion();
                                                                    showToast("删除成功", "success");
                                                                })
                                                                .catch((e) => {
                                                                    showToast((e as Error).message, "error");
                                                                });
                                                        }, { type: "danger" });
                                                    }}
                                                >
                                                    删除
                                                </button>
                                            </div>
                                        )}
                                    </article>
                                ))}
                            </div>
                        )}
                    </div>

                    {profile && (
                        <div style={{ marginTop: 32 }}>
                            <h3 style={{ marginBottom: 12 }}>发表回复</h3>
                            <textarea
                                placeholder="输入回复内容（支持 Markdown 和 LaTeX）"
                                value={replyContent}
                                onChange={(e) => setReplyContent(e.target.value)}
                                style={{
                                    width: "100%",
                                    maxWidth: "100%",
                                    minHeight: 150,
                                    padding: 8,
                                    borderRadius: 8,
                                    border: "1px solid rgba(200,109,63,0.25)",
                                    background: "#fffaf5",
                                    color: "#2c1a0d",
                                    fontFamily: "monospace",
                                    fontSize: "14px",
                                    boxSizing: "border-box",
                                    wordBreak: "break-word",
                                    overflowWrap: "break-word",
                                    whiteSpace: "pre-wrap",
                                }}
                            />
                            <div style={{ marginTop: 12 }}>
                                <button className="btn" onClick={submitReply} disabled={submittingReply || !replyContent.trim()}>
                                    {submittingReply ? "提交中..." : "提交回复"}
                                </button>
                            </div>
                        </div>
                    )}

                    {!profile && (
                        <div style={{ marginTop: 32, padding: 16, background: "#f9f9f9", borderRadius: 8, textAlign: "center" }}>
                            <p>请先登录以发表回复</p>
                            <Link className="btn" to="/login" style={{ marginTop: 8 }}>
                                登录
                            </Link>
                        </div>
                    )}

                    <div style={{ marginTop: 16 }}>
                        <Link className="btn ghost" to="/discussion">
                            ← 返回讨论列表
                        </Link>
                    </div>
                </div>
            </section>
            {toast && <Toast message={toast.message} type={toast.type} duration={toast.duration} onClose={hideToast} />}
            {confirm && (
                <ConfirmDialog
                    message={confirm.message}
                    onConfirm={confirm.onConfirm}
                    onCancel={hideConfirm}
                    confirmText={confirm.confirmText}
                    cancelText={confirm.cancelText}
                    type={confirm.type}
                />
            )}
        </>
    );
}

