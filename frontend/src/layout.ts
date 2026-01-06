export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ||
  "http://127.0.0.1:3000/api";

export function renderLayout(mainContent: string) {
  return `
  <div class="page">
    <header class="topbar">
      <a class="logo" href="/" style="text-decoration: none;">吟心</a>
      <nav class="nav left">
        <a class="item" href="/notice">
          <span class="label">公告</span>
        </a>
        <a class="item" href="/games">
          <span class="label">游戏列表</span>
        </a>
        <a class="item" href="/rank">
          <span class="label">排行榜</span>
        </a>
        <a class="item" href="/online">
          <span class="label">在线用户</span>
        </a>
        <a class="item" href="/about">
          <span class="label">关于我们</span>
        </a>
      </nav>
      <div class="auth-actions" id="auth-actions"></div>
    </header>
    <main class="main">
      ${mainContent}
    </main>
    <footer class="footer">
      © 2026 吟心 |
      <a href="http://qm.qq.com/cgi-bin/qm/qr?_wv=1027&k=1LQ1dTeqha0TSoSNiYSs16xhxgEIAJJ4&authKey=VzCbL0E5wtE8rE6%2BKa6GR0gCdxoOO0fxm1P3Sy8BdW5PcEu4LZ%2FLWPUQ0p5hH4Ta&noverify=0&group_code=211902065" target="_blank" rel="noreferrer">
        QQ 群 211902065
      </a>
      <a href="https://afdian.com/a/cyx2009" target="_blank" rel="noreferrer">
        爱发电赞助通道
      </a>
    </footer>
  </div>
  `;
}

