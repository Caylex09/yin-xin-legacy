// import React from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { API_BASE } from "../layout";
import { usePageTitle } from "../hooks/usePageTitle";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { formatDate } from "../utils/format";
import { getToken, fetchProfile, type ProfileWithRole } from "../auth";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import { Toast } from "../components/Toast";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useCallback, useEffect, useState } from "react";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: "进行中", color: "#4caf50" },
  resolved: { label: "已解决", color: "#2196f3" },
  rejected: { label: "不考虑", color: "#f44336" },
  duplicate: { label: "重复", color: "#ff9800" },
};

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<any>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<ProfileWithRole | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);
  const [closing, setClosing] = useState(false);
  const { toast, showToast, hideToast } = useToast();
  const { confirm, showConfirm, hideConfirm } = useConfirm();

  useEffect(() => {
    fetchProfile(API_BASE).then((p) => setProfile(p)).catch(() => setProfile(null));
  }, []);

  const loadTicket = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [ticketResp, repliesResp] = await Promise.all([
        fetch(`${API_BASE}/tickets/${id}`),
        fetch(`${API_BASE}/tickets/${id}/replies`),
      ]);
      const ticketData = await ticketResp.json();
      const repliesData = await repliesResp.json();
      if (!ticketResp.ok) throw new Error(ticketData.error || `HTTP ${ticketResp.status}`);
      if (!repliesResp.ok) throw new Error(repliesData.error || `HTTP ${repliesResp.status}`);
      setTicket(ticketData);
      setReplies(repliesData);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

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
      const resp = await fetch(`${API_BASE}/tickets/${id}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: replyContent.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setReplyContent("");
      loadTicket();
      showToast("回复成功", "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setSubmittingReply(false);
    }
  };

  const closeTicket = async (status: "resolved" | "rejected" | "duplicate") => {
    if (!profile?.role || profile.role < 1) {
      showToast("只有管理员可以关闭工单", "error");
      return;
    }
    const statusLabels: Record<string, string> = {
      resolved: "已解决",
      rejected: "不考虑",
      duplicate: "重复",
    };
    showConfirm(`确定要将此工单标记为"${statusLabels[status]}"吗？`, () => {
      const token = getToken();
      if (!token) {
        showToast("请先登录", "warning");
        return;
      }
      setClosing(true);
      fetch(`${API_BASE}/tickets/${id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      })
        .then(async (resp) => {
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
          loadTicket();
          showToast("操作成功", "success");
        })
        .catch((e) => {
          showToast((e as Error).message, "error");
        })
        .finally(() => {
          setClosing(false);
        });
    }, { type: "warning" });
  };

  const reopenTicket = async () => {
    if (!profile?.role || profile.role < 1) {
      showToast("只有管理员可以重新打开工单", "error");
      return;
    }
    showConfirm("确定要重新打开此工单吗？", () => {
      const token = getToken();
      if (!token) {
        showToast("请先登录", "warning");
        return;
      }
      setClosing(true);
      fetch(`${API_BASE}/tickets/${id}/reopen`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (resp) => {
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
          loadTicket();
          showToast("操作成功", "success");
        })
        .catch((e) => {
          showToast((e as Error).message, "error");
        })
        .finally(() => {
          setClosing(false);
        });
    }, { type: "info" });
  };

  usePageTitle(ticket ? ticket.title : "工单详情");

  if (loading) {
    return (
      <>
        <section className="hero">
          <h1>工单详情</h1>
        </section>
        <section className="results">
          <div className="result-list">
            <div className="muted">加载中...</div>
          </div>
        </section>
      </>
    );
  }

  if (error || !ticket) {
    return (
      <>
        <section className="hero">
          <h1>工单详情</h1>
        </section>
        <section className="results">
          <div className="result-list">
            <div className="muted">{error || "工单不存在"}</div>
            <div style={{ marginTop: 12 }}>
              <Link className="btn ghost" to="/ticket">
                返回工单列表
              </Link>
            </div>
          </div>
        </section>
      </>
    );
  }

  const isAdmin = profile?.role && profile.role > 0;
  const isOpen = ticket.status === "open";

  return (
    <>
      <section className="hero">
        <h1>{ticket.title}</h1>
        <p>
          {ticket.creator_username && (
            <span>
              <img
                src={ticket.creator_avatar || "https://cn.gravatar.com/avatar/00000000000000000000000000000000?d=identicon&s=32"}
                alt={ticket.creator_username}
                style={{ width: 24, height: 24, borderRadius: "50%", verticalAlign: "middle", marginRight: 6 }}
              />
              {ticket.creator_username}
            </span>
          )}
          {" · "}
          {formatDate(ticket.created_at)}
          {ticket.updated_at !== ticket.created_at && ` · 更新于 ${formatDate(ticket.updated_at)}`}
          {" · "}
          <span
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: "12px",
              fontWeight: 500,
              background: STATUS_LABELS[ticket.status]?.color || "#666",
              color: "#fff",
            }}
          >
            {STATUS_LABELS[ticket.status]?.label || ticket.status}
          </span>
          {ticket.closed_at && ticket.closer_username && (
            <>
              {" · "}
              由 {ticket.closer_username} 关闭于 {formatDate(ticket.closed_at)}
            </>
          )}
        </p>
      </section>
      <section className="results">
        <div className="result-list">
          <article className="hit">
            <div className="hit-content" style={{ marginTop: 0 }}>
              <MarkdownRenderer content={ticket.content} />
            </div>
            {profile && (ticket.created_by === profile.uid || profile.isSuperAdmin) && (
              <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <Link className="btn ghost" to={`/ticket/${id}/edit`}>
                  编辑
                </Link>
              </div>
            )}
          </article>

          {isAdmin && (
            <div style={{ marginTop: 16, padding: 16, background: "#f9f9f9", borderRadius: 8 }}>
              <h3 style={{ marginBottom: 12 }}>管理员操作</h3>
              {isOpen ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn" onClick={() => closeTicket("resolved")} disabled={closing} style={{ background: "#2196f3" }}>
                    标记为已解决
                  </button>
                  <button className="btn" onClick={() => closeTicket("rejected")} disabled={closing} style={{ background: "#f44336" }}>
                    标记为不考虑
                  </button>
                  <button className="btn" onClick={() => closeTicket("duplicate")} disabled={closing} style={{ background: "#ff9800" }}>
                    标记为重复
                  </button>
                </div>
              ) : (
                <div>
                  <button className="btn ghost" onClick={reopenTicket} disabled={closing}>
                    重新打开工单
                  </button>
                </div>
              )}
            </div>
          )}

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
            <Link className="btn ghost" to="/ticket">
              ← 返回工单列表
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

