import React, { useEffect, useRef } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";
import markedKatex from "marked-katex-extension";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// 配置 marked 选项和扩展（只配置一次）
marked.setOptions({
  breaks: true, // 支持换行
  gfm: true, // GitHub Flavored Markdown
});

// 配置 marked 使用 KaTeX 扩展
marked.use(
  markedKatex({
    throwOnError: false, // 不抛出错误，显示原始公式
    // displayMode 会根据 $$ 或 $ 自动判断
  })
);

/**
 * 安全的 Markdown 渲染组件，支持 LaTeX 数学公式
 * 
 * 安全措施：
 * 1. 使用 DOMPurify 清理所有 HTML，防止 XSS 攻击
 * 2. 只允许安全的 HTML 标签和属性
 * 3. LaTeX 公式通过 marked-katex-extension 安全渲染
 */
export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 将 Markdown 转换为 HTML（包含 LaTeX 公式）
    const rawHtml = marked(content);

    // 使用 DOMPurify 清理 HTML，防止 XSS 攻击
    // 配置允许的标签和属性，包括 KaTeX 生成的元素
    const cleanHtml = DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        "p",
        "br",
        "strong",
        "em",
        "u",
        "s",
        "code",
        "pre",
        "blockquote",
        "ul",
        "ol",
        "li",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "a",
        "img",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
        "hr",
        "span",
        "div",
      ],
      ALLOWED_ATTR: [
        "href",
        "title",
        "alt",
        "src",
        "class",
        "id",
        "target",
        "rel",
        "style",
        "data-*",
        "aria-*",
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      // 确保链接安全
      ADD_ATTR: ["target", "rel"],
      // 允许 KaTeX 相关的类和样式
      KEEP_CONTENT: true,
    });

    // 为外部链接添加 rel="noopener noreferrer"
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = cleanHtml;
    const links = tempDiv.querySelectorAll("a[href]");
    links.forEach((link) => {
      const href = link.getAttribute("href");
      if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener noreferrer");
      }
    });

    containerRef.current.innerHTML = tempDiv.innerHTML;
  }, [content]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        lineHeight: 1.6,
      }}
    />
  );
}
