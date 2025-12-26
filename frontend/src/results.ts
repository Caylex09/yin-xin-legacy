import "./style.css";
import { API_BASE, renderLayout } from "./layout";
import { initAuthUI } from "./auth";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("App container missing");
}

const params = new URLSearchParams(window.location.search);
const initialQ = params.get("q") || "";

const content = `
  <section class="hero">
    <h1>搜索结果</h1>
    <p>输入关键词，回车搜索</p>
    <div class="search">
      <input id="search-input" type="search" value="${initialQ}" placeholder="如：春晓 / 李白 / 五言律诗 / 唐代" />
      <button id="search-btn">搜索</button>
    </div>
  </section>
  <section class="results" id="results">
    <h2>结果</h2>
    <div id="result-list" class="result-list muted">等待搜索...</div>
  </section>
`;

app.innerHTML = renderLayout(content);
initAuthUI(API_BASE);

const input = document.querySelector<HTMLInputElement>("#search-input");
const button = document.querySelector<HTMLButtonElement>("#search-btn");
const resultList = document.querySelector<HTMLDivElement>("#result-list");

// 高亮关键词和匹配的句子
function highlightContent(content: string | string[] | any, query: string): string {
  // 转义 HTML 特殊字符
  function escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  // 转义正则表达式特殊字符
  function escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // 将内容转换为字符串
  let fullText = "";
  if (Array.isArray(content)) {
    // 如果 content 是数组，可能包含嵌套数组
    fullText = content.flatMap((item: any) => {
      if (Array.isArray(item)) {
        return item.join("");
      } else if (typeof item === "string") {
        return item;
      }
      return "";
    }).join("");
  } else if (typeof content === "string") {
    fullText = content;
  } else {
    return "";
  }

  if (!fullText || !query) {
    return escapeHtml(fullText);
  }

  // 高亮关键词
  function highlightKeyword(text: string, keyword: string): string {
    if (!keyword) return escapeHtml(text);
    const escapedKeyword = escapeRegex(keyword);
    const regex = new RegExp(`(${escapedKeyword})`, "gi");
    return escapeHtml(text).replace(regex, '<span class="search-keyword">$1</span>');
  }

  // 检查是否包含关键词（不区分大小写）
  function containsKeyword(text: string, keyword: string): boolean {
    return text.toLowerCase().includes(keyword.toLowerCase());
  }

  // 按标点符号分割句子
  // 使用正则表达式匹配句子（内容+标点）
  const sentenceRegex = /[^，。！？；：,\.!?;:\n]+[，。！？；：,\.!?;:\n]?/g;
  let sentenceParts: string[] = [];
  let match;

  while ((match = sentenceRegex.exec(fullText)) !== null) {
    const sentence = match[0].trim();
    if (sentence) {
      sentenceParts.push(sentence);
    }
  }

  // 如果没有找到句子分隔符，将整个文本作为一句话
  if (sentenceParts.length === 0) {
    sentenceParts = [fullText];
  }

  // 处理每个句子：如果包含关键词，给整句加背景色
  const highlightedSentences = sentenceParts.map((sentence) => {
    const trimmed = sentence.trim();
    if (!trimmed) return "";

    // 检查原始文本（未转义）是否包含关键词
    if (containsKeyword(trimmed, query)) {
      // 高亮这个句子中的关键词
      const highlighted = highlightKeyword(trimmed, query);
      // 给整句加背景色
      return `<span class="search-matched-sentence">${highlighted}</span>`;
    } else {
      // 普通句子也高亮关键词（以防万一有跨句匹配）
      return highlightKeyword(trimmed, query);
    }
  });

  // 使用空字符串连接，避免复制时出现多余空格
  return highlightedSentences.filter(s => s).join("");
}

async function search(q: string) {
  if (!resultList) return;
  if (!q.trim()) {
    resultList.textContent = "请输入关键词";
    return;
  }
  resultList.textContent = "搜索中...";
  try {
    const resp = await fetch(`${API_BASE}/search/poetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q, limit: 20 }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const hits = data?.hits || [];
    if (!hits.length) {
      resultList.textContent = "未找到结果";
      return;
    }

    resultList.innerHTML = hits
      .map(
        (hit: any) => {
          const highlighted = highlightContent(hit.content, q);
          return `
        <article class="hit">
          <div class="hit-title">${hit.title || "无标题"}</div>
          <div class="hit-meta">${hit.dynasty || ""} · ${hit.author || ""}</div>
          <div class="hit-content">${highlighted}</div>
        </article>
      `;
        }
      )
      .join("");
  } catch (err) {
    resultList.textContent = `请求失败：${(err as Error).message}`;
  }
}

function triggerSearch() {
  if (!input) return;
  search(input.value.trim());
}

if (button) button.addEventListener("click", triggerSearch);
if (input) {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") triggerSearch();
  });
  if (initialQ) {
    search(initialQ);
  }
}

