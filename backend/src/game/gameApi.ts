import axios from "axios";
import { MeiliSearch } from "meilisearch";

const OK_ENDING = ["。", "？", "！", "；"];

// MeiliSearch客户端
const MEILI_HOST = process.env.MEILI_HOST || "http://127.0.0.1:7700";
const MEILI_API_KEY = process.env.MEILI_API_KEY || "";
const meiliClient = new MeiliSearch({
  host: MEILI_HOST,
  apiKey: MEILI_API_KEY,
});

export const VERDICT = {
  CORRECT: 0,
  NOT_FOUND: 1,
  INCOMPLETE: 2,
  NEED_PUNCTUATION: 3,
  LENGTH_INVALID: 4,
  NO_HIGHLIGHTED_CHAR: 5,
  ORIGINAL_POEM: 6,
  TIMEOUT: 7,
  UNKNOWN: 8,
};

export const VERDICT_TEXT = [
  "回答正确！",
  "没有找到这句诗。",
  "诗句不完全。",
  "末尾需要标点符号。",
  "长度不符合要求。",
  "没有包含高亮字。",
  "与原诗一致。",
  "古诗文网请求超时！",
  "未知错误",
];

// 清除标点符号
export function clearMark(str: string): string {
  return str.replace(/[，；。！？、：]/g, "");
}

// 将标点符号转换为可选匹配
function markToAll(str: string): string {
  return str.replace(/[，；。！？、：]/g, "[，；。！？、：]?");
}

// 判断诗句是否匹配
function judge(poem: string, inp: string): string | null {
  let pattern = inp.split("").join(".?");
  pattern = markToAll(pattern);
  // 边界增加逗号，避免"，门泊东吴万里船"这类句子匹配失败
  pattern = `(?<=[，；。！？]|^|\\s)${pattern}(?=[，；。！？]|$|\\s)`;

  const regex = new RegExp(pattern);
  const match = poem.match(regex);

  if (!match || !match[0]) return null;

  let line = match[0];
  if (!line) return null;

  const matchStartIndex = match.index!;
  const matchEndIndex = matchStartIndex + line.length;

  // 如果末尾没有句末标点，尝试查找并添加
  if (!OK_ENDING.includes(line[line.length - 1])) {
    // 先检查紧跟着的字符是否是句末标点
    const nextChar = poem[matchEndIndex];
    if (nextChar && OK_ENDING.includes(nextChar)) {
      line += nextChar;
    } else {
      // 如果下一个字符不是句末标点，继续向后查找直到找到句末标点
      // 跳过逗号、顿号、冒号、分号等中间标点，查找句号、问号、感叹号
      let searchIndex = matchEndIndex;
      while (searchIndex < poem.length) {
        const char = poem[searchIndex];
        if (OK_ENDING.includes(char)) {
          // 找到句末标点，将中间的内容（包括这个标点）都添加到结果中
          line += poem.slice(matchEndIndex, searchIndex + 1);
          break;
        } else if (char === "，" || char === "、" || char === "：" || char === "；") {
          // 跳过中间标点，继续查找
          searchIndex++;
        } else if (/[\u4e00-\u9fa5]/.test(char)) {
          // 遇到中文字符，继续查找（可能是同一句的延续）
          searchIndex++;
        } else {
          // 遇到其他字符（如空格、换行等），停止查找
          break;
        }
      }
    }
  }

  return line;
}

// 更宽松的匹配：去除标点和空白后直接查找，返回原始输入作为匹配结果
function relaxedMatch(poem: string, inp: string): string | null {
  const poemClean = clearMark(poem).replace(/\s+/g, "");
  const inpClean = clearMark(inp).replace(/\s+/g, "");
  if (!inpClean) return null;
  if (poemClean.includes(inpClean)) return inp;
  return null;
}

// 搜索诗句：根据用户输入在 MeiliSearch 中查找对应的诗句，并返回标题 + 【朝代·作者】 + 匹配句
export async function searchPoem(
  poem: string
): Promise<{ title: string; authorDisplay: string; matchedLine: string } | null> {
  try {
    const cleanPoem = clearMark(poem);
    if (!cleanPoem || cleanPoem.length < 3) return null;

    // 使用MeiliSearch搜索
    const results = await meiliClient.index("poetry").search(cleanPoem, {
      limit: 10,
      attributesToRetrieve: ["id", "title", "author", "dynasty", "content"],
    });

    if (!results.hits || results.hits.length === 0) {
      return null;
    }

    // 遍历搜索结果，找到包含该句的诗
    for (const hit of results.hits) {
      const content = hit.content as any;
      let fullText = "";

      // 将content转换为完整文本
      if (Array.isArray(content)) {
        for (const seg of content) {
          if (Array.isArray(seg)) {
            fullText += seg.join("");
          } else if (typeof seg === "string") {
            fullText += seg;
          }
        }
      } else if (typeof content === "string") {
        fullText = content;
      }

      // 尝试严格匹配
      const matched = judge(fullText, poem);
      if (matched) {
        // 命中后根据作者 ID 补全【朝代·姓名】
        let authorDisplay = String((hit as any).author || "");
        try {
          if (authorDisplay && authorDisplay.length === 8) {
            const poet = await meiliClient.index("poets").getDocument<any>(authorDisplay);
            const name = poet?.name || authorDisplay;
            const dynasty = poet?.dynasty || "";
            authorDisplay = dynasty ? `${dynasty}·${name}` : name;
          }
        } catch {
          // 查询失败时退回原始 author 字段
        }

        return {
          title: String((hit as any).title || ""),
          authorDisplay,
          matchedLine: matched,
        };
      }

      // 尝试放宽匹配
      const relaxed = relaxedMatch(fullText, poem);
      if (relaxed) {
        let authorDisplay = String((hit as any).author || "");
        try {
          if (authorDisplay && authorDisplay.length === 8) {
            const poet = await meiliClient.index("poets").getDocument<any>(authorDisplay);
            const name = poet?.name || authorDisplay;
            const dynasty = poet?.dynasty || "";
            authorDisplay = dynasty ? `${dynasty}·${name}` : name;
          }
        } catch {
          // ignore
        }

        return {
          title: String((hit as any).title || ""),
          authorDisplay,
          matchedLine: poem,
        };
      }
    }

    return null;
  } catch (error) {
    console.error("[poem-snake] searchPoem error:", error);
    return null;
  }
}

// 判断诗句是否全为中文和常见全角标点（过滤掉乱码、小方框等）
function isCleanChinesePoem(text: string): boolean {
  if (!text) return false;
  // 去掉空白字符
  const normalized = text.replace(/\s+/g, "");
  if (!normalized) return false;

  // 不允许出现 或其他明显异常字符
  if (normalized.includes("�") || normalized.includes("□")) return false;
  // 允许的字符：中日韩统一表意文字 + 常见中文标点
  const allowedRegex = /^[\u4E00-\u9FFF，。！？、；：" "' '（）《》〈〉……—…·]+$/;
  // console.log(allowedRegex.test(normalized));
  return allowedRegex.test(normalized);
}

// 从自己的数据库随机获取一首干净的"单句"古诗
export async function getPoem(): Promise<{ content: string; origin: string; author: string }> {
  const PORT = Number(process.env.PORT || 3000);
  const baseUrl = `http://localhost:${PORT}`;

  // 最多尝试 2000 次，找到一首"干净"的句子
  for (let i = 0; i < 2000; i++) {
    try {
      // 直接调用已有的 /api/poetry/random-line 接口
      const response = await axios.get(`${baseUrl}/api/poetry/random-line`, { timeout: 5000 });
      const doc = response.data as any;

      const line = String(doc.sentence || "");
      // console.log("line", line);
      if (!line || !isCleanChinesePoem(line)) {
        // console.log(isCleanChinesePoem(line));
        // 这一句有乱码或非中文字符，继续随机下一句
        continue;
      }

      // 解析作者：doc.author 通常是作者 ID，需要从 poets 索引里查出朝代和姓名
      let authorDisplay = "";
      const authorIdOrName = doc.author as string | undefined;
      const dynasty = (doc.dynasty as string | undefined) || "";

      if (authorIdOrName && authorIdOrName.length === 8) {
        // 看起来是作者 ID
        try {
          const poet = await meiliClient.index("poets").getDocument<any>(authorIdOrName);
          const name = poet?.name || authorIdOrName;
          const poetDynasty = poet?.dynasty || dynasty;
          authorDisplay = poetDynasty ? `${poetDynasty}·${name}` : name;
        } catch {
          authorDisplay = dynasty ? `${dynasty}·${authorIdOrName}` : authorIdOrName;
        }
      } else if (authorIdOrName) {
        authorDisplay = dynasty ? `${dynasty}·${authorIdOrName}` : authorIdOrName;
      } else {
        authorDisplay = dynasty ? `${dynasty}·佚名` : "佚名";
      }

      const title = (doc.title as string | undefined) || "无标题";

      return {
        content: line,
        origin: title,
        author: authorDisplay,
      };
    } catch (error) {
      // 如果请求失败，继续尝试下一首
      continue;
    }
  }

  // 如果多次尝试都失败，回退到默认诗句
  console.warn("[poem-snake] getPoem: failed to find clean poem, using fallback");
  return {
    content: "春眠不觉晓，处处闻啼鸟。",
    origin: "春晓",
    author: "唐·孟浩然",
  };
}
