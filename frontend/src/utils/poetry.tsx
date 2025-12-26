// import React from "react";

// 诗歌内容处理工具函数

export const splitSentences = (text: string) =>
  text
    .split(/(?<=[。！？!?；;])/)
    .map((s) => s.trim())
    .filter(Boolean);

export const normalizeContent = (v: any): string[][] => {
  if (Array.isArray(v)) {
    if (v.every((seg) => Array.isArray(seg))) {
      return (v as any[]).map((seg) =>
        (seg as any[]).map((s) => (s === undefined || s === null ? "" : String(s))).filter(Boolean)
      );
    }
    return (v as any[]).map((s) => splitSentences(String(s ?? "")).filter(Boolean)).filter((seg) => seg.length > 0);
  }
  if (v === undefined || v === null || v === "") return [];
  return [splitSentences(String(v)).filter(Boolean)];
};

export const renderSegments = (v: any): React.ReactElement => {
  const segs = normalizeContent(v);
  if (!segs.length) return <div className="hit-content muted small">暂无内容</div>;
  return (
    <div className="hit-content">
      {segs.map((seg, i) => (
        <div key={i}>{seg.join("")}</div>
      ))}
    </div>
  );
};

// 高亮关键词和匹配的句子
export const highlightContent = (content: any, query: string): string => {
  // 将内容转换为字符串
  let fullText = "";
  if (Array.isArray(content)) {
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
  // 通过 CSS 控制视觉间距
  return highlightedSentences.filter(s => s).join("");
};

// 渲染带高亮的搜索结果
export const renderSegmentsWithHighlight = (v: any, query: string): React.ReactElement => {
  const highlighted = highlightContent(v, query);
  if (!highlighted) return <div className="hit-content muted small">暂无内容</div>;
  return <div className="hit-content" dangerouslySetInnerHTML={{ __html: highlighted }} />;
};

