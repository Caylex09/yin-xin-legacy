// import React from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../../layout";
import { getToken, fetchProfile, type ProfileWithRole } from "../../auth";
import { usePageTitle } from "../../hooks/usePageTitle";
import { roleText, formatDate } from "../../utils/format";

export function AdminUserPage() {
  usePageTitle("用户管理");
  const [admins, setAdmins] = React.useState<any[]>([]);
  const [error, setError] = React.useState("");
  const [searchUid, setSearchUid] = React.useState("");

  React.useEffect(() => {
    const token = getToken();
    if (!token) {
      setError("请先登录");
      return;
    }
    fetch(`${API_BASE}/admin/users`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data) => {
        const adminsOnly = (data || []).filter(
          (u: any) => Number(u.role) > 0 || u.is_super_admin || u.is_announcement_admin || u.is_wiki_admin
        );
        setAdmins(adminsOnly);
      })
      .catch((err) => setError(err.message));
  }, []);

  const targetLink = searchUid.trim() ? `/admin/user/${searchUid.trim()}` : "#";

  return (
    <section className="results">
      <h2>后台 · 管理员列表</h2>
      {error && <div className="result-list muted">{error}</div>}
      <div className="result-list" style={{ marginBottom: 12 }}>
        <h3>跳转用户编辑</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={searchUid}
            onChange={(e) => setSearchUid(e.target.value)}
            placeholder="输入 UID"
            style={{ maxWidth: 200 }}
          />
          <Link className="btn" to={targetLink}>
            前往
          </Link>
          <span className="muted small">输入 UID 后跳转到用户详情页进行修改</span>
        </div>
      </div>
      <div className="result-list">
        <table className="admin-table">
          <thead>
            <tr>
              <th>UID</th>
              <th>用户名</th>
              <th>邮箱</th>
              <th>角色</th>
              <th>公告</th>
              <th>资料</th>
              <th>超管</th>
              <th>积分</th>
              <th>注册时间</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((u) => (
              <tr key={u.uid ?? u.id}>
                <td>
                  <Link className="link-blue" to={`/profile/${u.uid}`}>
                    {u.uid}
                  </Link>
                </td>
                <td>{u.username}</td>
                <td>{u.email}</td>
                <td>{roleText(u.role)}</td>
                <td>{u.is_announcement_admin ? "是" : "否"}</td>
                <td>{u.is_wiki_admin ? "是" : "否"}</td>
                <td>{u.is_super_admin ? "是" : "否"}</td>
                <td>{u.score ?? 0}</td>
                <td>{formatDate(u.created_at)}</td>
                <td>
                  <Link className="btn ghost" to={`/admin/user/${u.uid}`}>
                    查看/编辑
                  </Link>
                </td>
              </tr>
            ))}
            {admins.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: "center" }}>
                  暂无管理员
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

