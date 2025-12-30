// import React from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../layout";
import { usePageTitle } from "../hooks/usePageTitle";
import { formatDate } from "../utils/format";
import { getToken, fetchProfile, type ProfileWithRole } from "../auth";
import { useCallback, useEffect, useState } from "react";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: "进行中", color: "#4caf50" },
  resolved: { label: "已解决", color: "#2196f3" },
  rejected: { label: "不考虑", color: "#f44336" },
  duplicate: { label: "重复", color: "#ff9800" },
};

export function TicketListPage() {
  usePageTitle("工单区");
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [profile, setProfile] = useState<ProfileWithRole | null>(null);

  useEffect(() => {
    fetchProfile(API_BASE).then((p) => setProfile(p)).catch(() => setProfile(null));
  }, []);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const url = statusFilter ? `${API_BASE}/tickets?status=${statusFilter}` : `${API_BASE}/tickets`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setTickets(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  return (
    <>
      <section className="hero">
        <h1>工单区</h1>
        <p>申请修改、报告问题</p>
      </section>
      <section className="results">
        <div className="result-list">
          <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
            <span>筛选：</span>
            <button
              className={statusFilter === "" ? "btn" : "btn ghost"}
              onClick={() => setStatusFilter("")}
              style={{ fontSize: "14px" }}
            >
              全部
            </button>
            <button
              className={statusFilter === "open" ? "btn" : "btn ghost"}
              onClick={() => setStatusFilter("open")}
              style={{ fontSize: "14px" }}
            >
              进行中
            </button>
            <button
              className={statusFilter === "resolved" ? "btn" : "btn ghost"}
              onClick={() => setStatusFilter("resolved")}
              style={{ fontSize: "14px" }}
            >
              已解决
            </button>
            <button
              className={statusFilter === "rejected" ? "btn" : "btn ghost"}
              onClick={() => setStatusFilter("rejected")}
              style={{ fontSize: "14px" }}
            >
              不考虑
            </button>
            <button
              className={statusFilter === "duplicate" ? "btn" : "btn ghost"}
              onClick={() => setStatusFilter("duplicate")}
              style={{ fontSize: "14px" }}
            >
              重复
            </button>
          </div>
          {loading && <div className="muted">加载中...</div>}
          {error && <div className="muted">{error}</div>}
          {!loading && !error && tickets.length === 0 && <div className="muted">暂无工单</div>}
          {!loading && !error && tickets.length > 0 && (
            <div className="hit-list">
              {tickets.map((t) => (
                <article className="hit" key={t.id}>
                  <div className="hit-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Link to={`/ticket/${t.id}`} style={{ textDecoration: "none", color: "inherit", flex: 1 }}>
                      {t.title}
                    </Link>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 4,
                        fontSize: "12px",
                        fontWeight: 500,
                        background: STATUS_LABELS[t.status]?.color || "#666",
                        color: "#fff",
                      }}
                    >
                      {STATUS_LABELS[t.status]?.label || t.status}
                    </span>
                  </div>
                  <div className="hit-meta">
                    {t.creator_username && (
                      <span>
                        <img
                          src={t.creator_avatar || "https://cn.gravatar.com/avatar/00000000000000000000000000000000?d=identicon&s=32"}
                          alt={t.creator_username}
                          style={{ width: 20, height: 20, borderRadius: "50%", verticalAlign: "middle", marginRight: 6 }}
                        />
                        {t.creator_username}
                      </span>
                    )}
                    {" · "}
                    {formatDate(t.created_at)}
                    {t.reply_count > 0 && ` · ${t.reply_count} 条回复`}
                    {t.closed_at && ` · 关闭于 ${formatDate(t.closed_at)}`}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Link className="btn ghost" to={`/ticket/${t.id}`} style={{ fontSize: "14px" }}>
                      查看详情 →
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <Link className="btn" to="/ticket/new">
              提交新工单
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

