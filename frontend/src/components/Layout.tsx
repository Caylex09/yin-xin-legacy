import { useEffect } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../layout";
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
        </nav>
        <div className="auth-actions" id="auth-actions"></div>
      </header>
      <main className="main">{children}</main>
      <footer className="footer">
        © 2025 吟心 | <a href="http://qm.qq.com/cgi-bin/qm/qr?_wv=1027&k=1LQ1dTeqha0TSoSNiYSs16xhxgEIAJJ4&authKey=VzCbL0E5wtE8rE6%2BKa6GR0gCdxoOO0fxm1P3Sy8BdW5PcEu4LZ%2FLWPUQ0p5hH4Ta&noverify=0&group_code=211902065" target="_blank" rel="noreferrer"> QQ 群 211902065
        </a>
      </footer>
    </div>
  );
}

