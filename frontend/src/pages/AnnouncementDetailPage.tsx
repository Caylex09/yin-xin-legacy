// import React from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { API_BASE } from "../layout";
import { usePageTitle } from "../hooks/usePageTitle";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { formatDate } from "../utils/format";
import { fetchProfile, getToken, type ProfileWithRole } from "../auth";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import { Toast } from "../components/Toast";
import { ConfirmDialog } from "../components/ConfirmDialog";

export function AnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [announcement, setAnnouncement] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [profile, setProfile] = React.useState<ProfileWithRole | null>(null);
  const { toast, showToast, hideToast } = useToast();
  const { confirm, showConfirm, hideConfirm } = useConfirm();

  React.useEffect(() => {
    fetchProfile(API_BASE).then((p) => setProfile(p)).catch(() => setProfile(null));
  }, []);

  React.useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError("");
    fetch(`${API_BASE}/announcements/${id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        return d;
      })
      .then(setAnnouncement)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  const deleteAnnouncement = async () => {
    if (!profile?.role || profile.role < 1 || !profile.isAnnouncementAdmin) return;
    const token = getToken();
    if (!token) return;
    showConfirm("确定要删除这条公告吗？", () => {
      fetch(`${API_BASE}/announcements/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (resp) => {
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
          showToast("删除成功", "success");
          navigate("/announcement");
        })
        .catch((e) => {
          showToast((e as Error).message, "error");
        });
    }, { type: "danger" });
  };

  const restoreAnnouncement = async () => {
    if (!profile?.role || profile.role < 1 || !profile.isAnnouncementAdmin) return;
    const token = getToken();
    if (!token) return;
    try {
      const resp = await fetch(`${API_BASE}/announcements/${id}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      // 重新加载公告
      const resp2 = await fetch(`${API_BASE}/announcements/${id}`);
      const data2 = await resp2.json();
      if (resp2.ok) setAnnouncement(data2);
      showToast("恢复成功", "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  usePageTitle(announcement ? announcement.title : "公告详情");

  if (loading) {
    return (
      <>
        <section className="hero">
          <h1>公告详情</h1>
        </section>
        <section className="results">
          <div className="result-list">
            <div className="muted">加载中...</div>
          </div>
        </section>
      </>
    );
  }

  if (error || !announcement) {
    return (
      <>
        <section className="hero">
          <h1>公告详情</h1>
        </section>
        <section className="results">
          <div className="result-list">
            <div className="muted">{error || "公告不存在"}</div>
            <div style={{ marginTop: 12 }}>
              <Link className="btn ghost" to="/announcement">
                返回公告列表
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
        <h1>{announcement.title}</h1>
        <p>
          {formatDate(announcement.created_at)}
          {announcement.updated_at !== announcement.created_at && ` · 更新于 ${formatDate(announcement.updated_at)}`}
          {announcement.deleted ? " · 已删除" : ""}
        </p>
      </section>
      <section className="results">
        <div className="result-list">
          <article className="hit">
            <div className="hit-content" style={{ marginTop: 0 }}>
              <MarkdownRenderer content={announcement.content} />
            </div>
            {profile?.role && profile.role > 0 && profile.isAnnouncementAdmin ? (
              <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <Link className="btn ghost" to={`/announcement/${id}/edit`}>
                  编辑
                </Link>
                {!announcement.deleted ? (
                  <button className="btn ghost" onClick={deleteAnnouncement}>
                    删除（软）
                  </button>
                ) : (
                  <button className="btn ghost" onClick={restoreAnnouncement}>
                    恢复
                  </button>
                )}
              </div>
            ) : null}
          </article>
          <div style={{ marginTop: 16 }}>
            <Link className="btn ghost" to="/announcement">
              ← 返回公告列表
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

