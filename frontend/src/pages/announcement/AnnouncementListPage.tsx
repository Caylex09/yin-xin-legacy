// import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { API_BASE } from "../../config";
import { usePageTitle } from "../../hooks/usePageTitle";
import { formatDate } from "../../utils/format";
import { fetchProfile, getToken, type ProfileWithRole } from "../../auth";
import { MarkdownRenderer } from "../../components/MarkdownRenderer";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { Toast } from "../../components/Toast";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useCallback, useEffect, useState } from "react";

export function AnnouncementListPage() {
  usePageTitle("公告");
  const [params, setParams] = useSearchParams();
  const pageParam = Math.max(Number(params.get("page") || "1"), 1);

  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<ProfileWithRole | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const { toast, showToast, hideToast } = useToast();
  const { confirm, showConfirm, hideConfirm } = useConfirm();

  const loadAnnouncements = useCallback(async (includeDeleted = false, currentPage = 1) => {
    setLoading(true);
    setError("");
    try {
      const url = `${API_BASE}/announcements?page=${currentPage}&limit=20${includeDeleted ? "&includeDeleted=1" : ""}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      if (data.items) {
        setAnnouncements(data.items);
        setTotalPages(data.totalPages || 1);
      } else {
        setAnnouncements(data);
        setTotalPages(1);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile(API_BASE).then((p) => {
      setProfile(p);
      const includeDeleted = p?.role && p.role > 0 && p.isAnnouncementAdmin ? true : false;
      loadAnnouncements(includeDeleted, pageParam);
    });
  }, [loadAnnouncements, pageParam]);

  const goPage = (p: number) => {
    const np = Math.min(Math.max(p, 1), totalPages || 1);
    setParams(new URLSearchParams({ page: String(np) }));
  };

  const deleteAnnouncement = async (id: number) => {
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
          const includeDeleted = profile?.role && profile.role > 0 && profile.isAnnouncementAdmin ? true : false;
          loadAnnouncements(includeDeleted, pageParam);
          showToast("删除成功", "success");
        })
        .catch((e) => {
          showToast((e as Error).message, "error");
        });
    }, { type: "danger" });
  };

  const restoreAnnouncement = async (id: number) => {
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
      const includeDeleted = profile?.role && profile.role > 0 && profile.isAnnouncementAdmin ? true : false;
      loadAnnouncements(includeDeleted, pageParam);
      showToast("恢复成功", "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  return (
    <>
      <section className="hero">
        <h1>公告</h1>
        <p>查看所有公告</p>
      </section>
      <section className="results">
        <div className="result-list">
          {loading && <div className="muted">加载中...</div>}
          {error && <div className="muted">{error}</div>}
          {!loading && !error && announcements.length === 0 && <div className="muted">暂无公告</div>}
          {!loading && !error && announcements.length > 0 && (
            <div className="hit-list">
              {announcements.map((a) => (
                <article className="hit" key={a.id}>
                  <div className="hit-title">
                    <Link to={`/announcement/${a.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                      {a.title}
                    </Link>
                  </div>
                  <div className="hit-meta">
                    {formatDate(a.created_at)}
                    {a.deleted ? " · 已删除" : ""}
                  </div>
                  <div className="hit-content" style={{ maxHeight: 150, overflow: "hidden", color: "#666" }}>
                    {a.summary ? (
                      <div style={{ whiteSpace: "pre-wrap" }}>{a.summary}</div>
                    ) : (
                      <MarkdownRenderer content={a.content} />
                    )}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Link className="btn ghost" to={`/announcement/${a.id}`} style={{ fontSize: "14px" }}>
                      查看全文 →
                    </Link>
                    {profile?.role && profile.role > 0 && profile.isAnnouncementAdmin && (
                      <>
                        <Link className="btn ghost" to={`/announcement/${a.id}/edit`} style={{ fontSize: "14px", marginLeft: 8 }}>
                          编辑
                        </Link>
                        {!a.deleted ? (
                          <button className="btn ghost" onClick={() => deleteAnnouncement(a.id)} style={{ fontSize: "14px", marginLeft: 8 }}>
                            删除
                          </button>
                        ) : (
                          <button className="btn ghost" onClick={() => restoreAnnouncement(a.id)} style={{ fontSize: "14px", marginLeft: 8 }}>
                            恢复
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
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

          {profile?.role && profile.role > 0 && profile.isAnnouncementAdmin && (
            <div style={{ marginTop: 16 }}>
              <Link className="btn" to="/announcement/new">
                发布新公告
              </Link>
            </div>
          )}
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

