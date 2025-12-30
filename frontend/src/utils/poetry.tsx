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
    
    // 转义正则表达式特殊字符，但不转义 HTML（避免双重转义问题）
    const escapedKeyword = escapeRegex(keyword);
    const regex = new RegExp(`(${escapedKeyword})`, "gi");
    
    // 在原始文本上匹配，然后分别转义匹配部分和非匹配部分
    const parts: Array<{ text: string; isMatch: boolean }> = [];
    let lastIndex = 0;
    let match;
    
    // 重置正则的 lastIndex
    regex.lastIndex = 0;
    
    while ((match = regex.exec(text)) !== null) {
      // 添加匹配前的文本
      if (match.index > lastIndex) {
        parts.push({ text: text.substring(lastIndex, match.index), isMatch: false });
      }
      // 添加匹配的文本
      parts.push({ text: match[0], isMatch: true });
      lastIndex = regex.lastIndex;
    }
    
    // 添加剩余的文本
    if (lastIndex < text.length) {
      parts.push({ text: text.substring(lastIndex), isMatch: false });
    }
    
    // 如果没有匹配，返回转义后的原始文本
    if (parts.length === 0) {
      return escapeHtml(text);
    }
    
    // 分别转义各部分并组合
    return parts.map(part => {
      const escaped = escapeHtml(part.text);
      return part.isMatch ? `<span class="search-keyword">${escaped}</span>` : escaped;
    }).join("");
  }

  // 直接在整个文本上进行高亮（这样可以匹配跨句的关键词，包含标点符号的关键词也能正确匹配）
  return highlightKeyword(fullText, query);
};

// 渲染带高亮的搜索结果
export const renderSegmentsWithHighlight = (v: any, query: string): React.ReactElement => {
  const highlighted = highlightContent(v, query);
  if (!highlighted) return <div className="hit-content muted small">暂无内容</div>;
  return <div className="hit-content" dangerouslySetInnerHTML={{ __html: highlighted }} />;
};

