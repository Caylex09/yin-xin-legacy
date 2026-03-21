// Poem Snake 游戏专用状态和逻辑
import { VERDICT, VERDICT_TEXT, getPoem, searchPoem, clearMark, PUNCTUATION, judge, OK_ENDING, extractSentence } from "../gameApi";
import axios from "axios";
import { load } from "cheerio";
import { getDb } from "../../db";


const GUSHIWEN_DOMAIN = "https://www.gushiwen.cn";
const GUSHIWEN_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Cookie": "wsEmail=2176807108%40qq.com; Hm_lvt_9007fab6814e892d3020a64454da5a55=1757680581,1757899938,1758275989,1758505066; HMACCOUNT=C5FB65544F556811; gsw2017user=5351271%7c200A93E8DF3D18ABF087F0A4BC20A069%7c2000%2f1%2f1%7c2000%2f1%2f1; login=flase; wxopenid=defoaltid; gswZhanghao=2176807108%40qq.com; gswEmail=2176807108%40qq.com; Hm_lpvt_9007fab6814e892d3020a64454da5a55=1758506414",
};


// 更宽松的匹配
function exjudge(poem: string, inp: string): boolean {
    const poemClean = clearMark(poem).replace(/\s+/g, "");
    const inpClean = clearMark(inp).replace(/\s+/g, "");
    if (!inpClean) return false;
    return poemClean.includes(inpClean);
}

// 在古诗文网搜索诗句
async function searchGushiwen(poem: string): Promise<{ status: number; data: string[] } | null> {
    const empty = ["", "", ""];

    try {
        // 先搜索名句
        const searchUrl = `${GUSHIWEN_DOMAIN}/search.aspx?value=${encodeURIComponent(poem)}&type=mingju&valuej=${encodeURIComponent(poem[0])}`;
        console.log("[gushiwen] Searching mingju:", searchUrl);
        const response = await axios.get(searchUrl, {
            headers: GUSHIWEN_HEADERS,
            timeout: 5000,
            responseType: 'text'
        });

        if (!response.data) {
            console.log("[gushiwen] No response data, trying findPoem");
            return await findPoemInGushiwen(poem);
        }

        const htmlContent = typeof response.data === 'string' ? response.data : String(response.data);
        const $ = load(htmlContent);
        const sonsDiv = $("div.sons").first();

        if (sonsDiv.length === 0) {
            console.log("[gushiwen] No sons div found, trying findPoem");
            return await findPoemInGushiwen(poem);
        }

        const link = sonsDiv.find("a").first();
        if (link.length === 0) {
            console.log("[gushiwen] No link found, trying findPoem");
            return await findPoemInGushiwen(poem);
        }

        const linkText = link.text().trim(); // 这里的 linkText 往往是没有标点的，或者是半句
        console.log("[gushiwen] Link text:", linkText);

        const matched = judge(linkText, poem);

        if (!matched) {
            console.log("[gushiwen] No match found via judge, trying findPoem");
            return await findPoemInGushiwen(poem);
        }

        // =================================================================
        // 【核心修复】增加二次校验
        // 名句搜索的结果（linkText）往往不完整（例如："天子垂衣朝万国" 后面没有标点）。
        // 虽然 judge 允许“字符串末尾”作为合法边界，但在“名句”场景下，这意味着句子被截断了。
        // 所以我们强制要求：匹配到的结果必须以“句末标点”结尾。
        // =================================================================
        const lastChar = matched.slice(-1);
        if (!OK_ENDING.includes(lastChar)) {
            console.log(`[gushiwen] Mingju match '${matched}' has no ending punctuation (likely incomplete fragment). Fallback to full poem search.`);
            return await findPoemInGushiwen(poem);
        }

        const allLinks = sonsDiv.find("a");
        if (allLinks.length < 2) {
            console.log("[gushiwen] Less than 2 links, trying findPoem");
            return await findPoemInGushiwen(poem);
        }

        const authorLinkText = allLinks.eq(1).text();
        const matchResult = authorLinkText.match(/^(.*)《(.*)》$/);
        if (!matchResult) {
            console.log("[gushiwen] Author pattern not matched, trying findPoem");
            return await findPoemInGushiwen(poem);
        }

        const author = matchResult[1];
        const title = matchResult[2];
        console.log("[gushiwen] Found strict match in Mingju:", { title, author, matched });

        return { status: 0, data: [title, author, matched] };

    } catch (error) {
        console.error("[gushiwen] searchGushiwen error:", error);
        if (axios.isAxiosError(error)) {
            if (error.code === "ECONNABORTED") {
                return { status: 7, data: empty };
            }
            return { status: 1, data: empty };
        }
        return { status: 1, data: empty };
    }
}

async function findPoemInGushiwen(poem: string): Promise<{ status: number; data: string[] } | null> {
    const empty = ["", "", ""];

    try {
        const url = `${GUSHIWEN_DOMAIN}/search.aspx?value=${encodeURIComponent(poem)}&valuej=${encodeURIComponent(poem[0])}`;
        console.log("[gushiwen] Searching poem:", url);
        const response = await axios.get(url, {
            headers: GUSHIWEN_HEADERS,
            timeout: 5000,
            responseType: 'text'
        });

        if (!response.data) {
            console.log("[gushiwen] No response data in findPoem");
            return { status: 1, data: empty };
        }

        const htmlContent = typeof response.data === 'string' ? response.data : String(response.data);
        const $ = load(htmlContent);
        const sonsDiv = $("div.sons").first();

        if (sonsDiv.length === 0) {
            console.log("[gushiwen] No sons div in findPoem");
            return { status: 1, data: empty };
        }

        const contsonDiv = sonsDiv.find("div.contson");
        if (contsonDiv.length === 0) {
            console.log("[gushiwen] No contson div");
            return { status: 1, data: empty };
        }

        let text = contsonDiv.text();

        // 移除括号内容
        let result = "";
        let inBrackets = false;
        for (const c of text) {
            if (c === "(" || c === "（") {
                inBrackets = true;
            } else if (c === ")" || c === "）") {
                inBrackets = false;
            } else if (!inBrackets) {
                result += c;
            }
        }
        text = result;

        // 调用严格的 judge
        const matched = judge(text, poem);
        console.log("[gushiwen] Judge result:", matched);

        // =========================================================
        // 【核心修改】即使 matched 有值，也要检查是否以句末标点结尾
        // =========================================================
        let isValidMatch = false;
        if (matched) {
            const lastChar = matched.slice(-1);
            if (OK_ENDING.includes(lastChar)) {
                isValidMatch = true;
            } else {
                console.log(`[gushiwen] findPoem matched '${matched}' but it does not end with sentence punctuation. Rejecting.`);
            }
        }

        // 如果 judge 失败，或者 句末校验失败
        if (!isValidMatch || !matched) {
            // 尝试宽松匹配，如果宽松匹配成功，说明是“不完整”或“有错别字”
            // 返回 status: 2 (INCOMPLETE)，checkPoem 会把它当做失败处理 (Not Found)，符合预期
            const exjudgeResult = exjudge(text, poem);
            console.log("[gushiwen] Exjudge result:", exjudgeResult);
            if (!exjudgeResult) {
                return { status: 1, data: empty };
            }
            return { status: 2, data: empty };
        }

        const titleP = sonsDiv.find("p").first();
        const title = titleP.text().replace(/[\n\r ]/g, "");
        const sourceP = sonsDiv.find("p.source");
        const author = sourceP.text().replace(/[\n\r ]/g, "");

        console.log("[gushiwen] Found full poem:", { title, author, matched });

        return { status: 0, data: [title, author, matched] };
    } catch (error) {
        console.error("[gushiwen] findPoemInGushiwen error:", error);
        if (axios.isAxiosError(error)) {
            if (error.code === "ECONNABORTED") {
                return { status: 7, data: empty };
            }
            return { status: 1, data: empty };
        }
        return { status: 1, data: empty };
    }
}

// 创建工单
async function createTicket(title: string, content: string) {
    try {
        const db = getDb();
        const now = new Date().toISOString();
        db.prepare("INSERT INTO tickets (title, content, created_by, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?, 'open')")
            .run(title, content, 1, now, now);
    } catch (error) {
        console.error("[poem-snake] Failed to create ticket:", error);
    }
}

// 检查诗句
export async function checkPoem(poem: string, targetContent: string, targetPos: number): Promise<{ verdict: number; data: string[] }> {
    const empty = ["", "", ""];

    const debugBase: Record<string, any> = {
        input: poem,
        content: targetContent,
        pos: targetPos,
    };

    // 检查长度
    const cleanPoem = clearMark(poem);
    if (cleanPoem.length < 5 || cleanPoem.length >= 50) {
        console.log("[poem-snake] LENGTH_INVALID", {
            ...debugBase,
            reason: "length_invalid",
            cleanPoemLen: cleanPoem.length,
        });
        return { verdict: VERDICT.LENGTH_INVALID, data: empty };
    }

    // 检查是否包含高亮字符
    if (targetPos >= targetContent.length) {
        console.log("[poem-snake] POS_OUT_OF_RANGE", {
            ...debugBase,
            reason: "pos_out_of_range",
        });
        return { verdict: VERDICT.UNKNOWN, data: empty };
        // return { verdict: VERDICT.NOT_FOUND, data: empty };
    }

    const highlightedChar = targetContent[targetPos];
    debugBase.highlightedChar = highlightedChar;
    if (!poem.includes(highlightedChar)) {
        console.log("[poem-snake] NO_HIGHLIGHT_CHAR", {
            ...debugBase,
            reason: "no_highlight_char",
        });
        return { verdict: VERDICT.NO_HIGHLIGHTED_CHAR, data: empty };
    }

    // 检查是否是原诗
    const contentClean = clearMark(targetContent);
    const poemClean = clearMark(poem);
    if (contentClean.includes(poemClean) || poemClean.includes(contentClean)) {
        console.log("[poem-snake] ORIGINAL_POEM", {
            ...debugBase,
            reason: "original_poem",
        });
        return { verdict: VERDICT.ORIGINAL_POEM, data: empty };
    }

    // 搜索诗句
    console.log("[poem-snake] SEARCHING", {
        ...debugBase,
        searchQuery: cleanPoem,
    });

    const searchResult = await searchPoem(poem);

    if (!searchResult) {
        console.log("[poem-snake] NOT_FOUND, trying gushiwen.cn", {
            ...debugBase,
            reason: "search_no_results",
        });

        // 尝试在古诗文网搜索
        const gushiwenResult = await searchGushiwen(poem);
        console.log("[poem-snake] GUSHIWEN_RESULT", {
            ...debugBase,
            gushiwenResult: gushiwenResult,
        });
        console.log(gushiwenResult)
        if (gushiwenResult && gushiwenResult.status === 0) {
            // 古诗文网搜索成功，创建工单并返回正确结果
            const ticketContent = `checkPoem 调用了 "${poem}"，在古诗文网搜到了。\n\n结果：\n标题：${gushiwenResult.data[0]}\n作者：${gushiwenResult.data[1]}\n匹配句：${gushiwenResult.data[2]}`;
            await createTicket("修复诗文", ticketContent);

            const extractedGushiwen = extractSentence(gushiwenResult.data[2], highlightedChar);

            console.log("[poem-snake] GUSHIWEN_FOUND", {
                ...debugBase,
                gushiwenResult: gushiwenResult.data,
            });

            return {
                verdict: VERDICT.CORRECT,
                data: [gushiwenResult.data[0], gushiwenResult.data[1], extractedGushiwen],
            };
        } else {
            // 古诗文网也搜不到或超时，返回 NOT_FOUND
            return { verdict: VERDICT.NOT_FOUND, data: empty };
        }
    }

    // 检查是否是完整句子：如果用户输入的诗句是匹配到的完整句子的前缀（后面还有内容），则判定为半句
    const matchedLineClean = clearMark(searchResult.matchedLine);
    const matchedLineOriginal = searchResult.matchedLine;

    // 如果匹配到的完整句子比用户输入长，且用户输入是完整句子的前缀，则判定为半句
    if (matchedLineClean.length > cleanPoem.length && matchedLineClean.startsWith(cleanPoem)) {
        // 检查匹配到的完整句子在用户输入之后是否还有非标点符号的内容
        const remaining = matchedLineClean.slice(cleanPoem.length);
        const remainingWithoutPunct = remaining.replace(/[，。！？、；：""''（）《》〈〉……—…·\s]/g, "");
        if (remainingWithoutPunct.length > 0) {
            // 用户输入的是半句，判定为不正确
            console.log("[poem-snake] INCOMPLETE", {
                ...debugBase,
                reason: "incomplete_sentence",
                matchedLine: searchResult.matchedLine,
            });
            return { verdict: VERDICT.INCOMPLETE, data: empty };
        }
    }

    console.log("[poem-snake] SEARCH_SUCCESS", {
        ...debugBase,
        searchResult: {
            title: searchResult.title,
            authorDisplay: searchResult.authorDisplay,
            matchedLine: searchResult.matchedLine,
        },
    });

    // 成功找到匹配的诗句
    const extractedSentence = extractSentence(searchResult.matchedLine, highlightedChar);

    return {
        verdict: VERDICT.CORRECT,
        // data[0] = 标题，data[1] = 【朝代·姓名】，data[2] = 提取的句子
        data: [searchResult.title, searchResult.authorDisplay, extractedSentence],
    };
}

// 导出 VERDICT 和 VERDICT_TEXT 以供外部使用
export { VERDICT, VERDICT_TEXT };

