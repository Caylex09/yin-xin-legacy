// import React from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../layout";
import { usePageTitle } from "../hooks/usePageTitle";
import { formatDate } from "../utils/format";
import { getToken } from "../auth";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import { Toast } from "../components/Toast";
import { ConfirmDialog } from "../components/ConfirmDialog";

export function DiscussionListPage() {
  usePageTitle("讨论区");
  const [discussions, setDiscussions] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const { toast, showToast, hideToast } = useToast();
  const { confirm, showConfirm, hideConfirm } = useConfirm();

  const loadDiscussions = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`${API_BASE}/discussions`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setDiscussions(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadDiscussions();
  }, [loadDiscussions]);

  const deleteDiscussion = async (id: number) => {
    const token = getToken();
    if (!token) {
      showToast("请先登录", "warning");
      return;
    }
    showConfirm("确定要删除这条讨论吗？", () => {
      fetch(`${API_BASE}/discussions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (resp) => {
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
          loadDiscussions();
          showToast("删除成功", "success");
        })
        .catch((e) => {
          showToast((e as Error).message, "error");
        });
    }, { type: "danger" });
  };

  return (
    <>
      <section className="hero">
        <h1>讨论区</h1>
        <p>分享想法，交流讨论</p>
      </section>
      <section className="results">
        <div className="result-list">
          {loading && <div className="muted">加载中...</div>}
          {error && <div className="muted">{error}</div>}
          {!loading && !error && discussions.length === 0 && <div className="muted">暂无讨论</div>}
          {!loading && !error && discussions.length > 0 && (
            <div className="hit-list">
              {discussions.map((d) => (
                <article className="hit" key={d.id}>
                  <div className="hit-title">
                    <Link to={`/discussion/${d.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                      {d.title}
                    </Link>
                  </div>
                  <div className="hit-meta">
                    {d.creator_username && (
                      <span>
                        <img
                          src={d.creator_avatar || "https://cn.gravatar.com/avatar/00000000000000000000000000000000?d=identicon&s=32"}
                          alt={d.creator_username}
                          style={{ width: 20, height: 20, borderRadius: "50%", verticalAlign: "middle", marginRight: 6 }}
                        />
                        {d.creator_username}
                      </span>
                    )}
                    {" · "}
                    {formatDate(d.created_at)}
                    {d.reply_count > 0 && ` · ${d.reply_count} 条回复`}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Link className="btn ghost" to={`/discussion/${d.id}`} style={{ fontSize: "14px" }}>
                      查看详情 →
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <Link className="btn" to="/discussion/new">
              发布新讨论
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

