import { useEffect } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../config";
import { initAuthUI } from "../auth";

export function Layout({ children }: React.PropsWithChildren) {
  useEffect(() => {
    initAuthUI(API_BASE);
  }, []);
  return (
    <div className="page">
      <header className="topbar">
        <Link className="logo" to="/" style={{ textDecoration: "none" }}>
          吟心
        </Link>
        <nav className="nav left">
          <Link className="item" to="/announcement">
            <span className="label">公告</span>
          </Link>
          <Link className="item" to="/discussion">
            <span className="label">讨论区</span>
          </Link>
          <Link className="item" to="/ticket">
            <span className="label">工单区</span>
          </Link>
          <Link className="item" to="/games">
            <span className="label">游戏列表</span>
          </Link>
          <Link className="item" to="/rankings">
            <span className="label">排行榜</span>
          </Link>
          <Link className="item" to="/online">
            <span className="label">在线用户</span>
          </Link>
          <Link className="item" to="/about">
            <span className="label">关于我们</span>
          </Link>
          <Link className="item" to="/changelog">
            <span className="label">更新日志</span>
          </Link>
        </nav>
        <div className="auth-actions" id="auth-actions"></div>
      </header>
      <main className="main">{children}</main>
      <footer className="footer">
        © 2026 吟心{" "}
        <a
          href={`https://github.com/Caylex09/yin-xin/commit/${__GIT_COMMIT_HASH__}`}
          target="_blank"
          rel="noreferrer"
          style={{ textDecoration: 'none', color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }}
          title={`Build Commit: ${__GIT_COMMIT_HASH__}`}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0Z"></path>
          </svg>
          {__GIT_COMMIT_HASH__}
        </a>{" "}
        | <a href="http://qm.qq.com/cgi-bin/qm/qr?_wv=1027&k=1LQ1dTeqha0TSoSNiYSs16xhxgEIAJJ4&authKey=VzCbL0E5wtE8rE6%2BKa6GR0gCdxoOO0fxm1P3Sy8BdW5PcEu4LZ%2FLWPUQ0p5hH4Ta&noverify=0&group_code=211902065" target="_blank" rel="noreferrer"> QQ 群 211902065
        </a>
      </footer>
    </div>
  );
}

