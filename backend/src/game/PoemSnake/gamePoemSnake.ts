// Poem Snake 游戏专用状态和逻辑
import { VERDICT, VERDICT_TEXT, getPoem, searchPoem, clearMark } from "../gameApi";
import axios from "axios";
import { load } from "cheerio";
import { getDb } from "../../db";

const PUNCTUATION = ["，", "？", "。", "！", "：", "、", "；"];

const GUSHIWEN_DOMAIN = "https://www.gushiwen.cn";
const GUSHIWEN_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Cookie": "wsEmail=2176807108%40qq.com; Hm_lvt_9007fab6814e892d3020a64454da5a55=1757680581,1757899938,1758275989,1758505066; HMACCOUNT=C5FB65544F556811; gsw2017user=5351271%7c200A93E8DF3D18ABF087F0A4BC20A069%7c2000%2f1%2f1%7c2000%2f1%2f1; login=flase; wxopenid=defoaltid; gswZhanghao=2176807108%40qq.com; gswEmail=2176807108%40qq.com; Hm_lpvt_9007fab6814e892d3020a64454da5a55=1758506414",
};

// 判断诗句是否匹配（从 gameApi.ts 复制）
function judge(poem: string, inp: string): string | null {
    const OK_ENDING = ["。", "？", "！", "；"];
    function markToAll(str: string): string {
        return str.replace(/[，；。！？、：]/g, "[，；。！？、：]?");
    }

    let pattern = inp.split("").join(".?");
    pattern = markToAll(pattern);
    pattern = `(?<=[，；。！？]|^|\\s)${pattern}(?=[，；。！？]|$|\\s)`;

    const regex = new RegExp(pattern);
    const match = poem.match(regex);

    if (!match || !match[0]) return null;

    let line = match[0];
    if (!line) return null;

    const matchStartIndex = match.index!;
    const matchEndIndex = matchStartIndex + line.length;

    if (!OK_ENDING.includes(line[line.length - 1])) {
        const nextChar = poem[matchEndIndex];
        if (nextChar && OK_ENDING.includes(nextChar)) {
            line += nextChar;
        } else {
            let searchIndex = matchEndIndex;
            while (searchIndex < poem.length) {
                const char = poem[searchIndex];
                if (OK_ENDING.includes(char)) {
                    line += poem.slice(matchEndIndex, searchIndex + 1);
                    break;
                } else if (char === "，" || char === "、" || char === "：" || char === "；") {
                    searchIndex++;
                } else if (/[\u4e00-\u9fa5]/.test(char)) {
                    searchIndex++;
                } else {
                    break;
                }
            }
        }
    }

    return line;
}

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
        console.log("[gushiwen] Response data length:", htmlContent.length);
        const $ = load(htmlContent);
        const sonsDiv = $("div.sons").first();

        console.log("[gushiwen] sonsDiv length:", sonsDiv.length);

        if (sonsDiv.length === 0) {
            // 如果名句搜索没有结果，尝试搜索整首诗
            console.log("[gushiwen] No sons div found, trying findPoem");
            return await findPoemInGushiwen(poem);
        }

        const link = sonsDiv.find("a").first();
        if (link.length === 0) {
            console.log("[gushiwen] No link found, trying findPoem");
            return await findPoemInGushiwen(poem);
        }

        const linkText = link.text();
        console.log("[gushiwen] Link text:", linkText);
        const matched = judge(linkText, poem);
        if (!matched) {
            console.log("[gushiwen] No match found, trying findPoem");
            return await findPoemInGushiwen(poem);
        }

        const allLinks = sonsDiv.find("a");
        if (allLinks.length < 2) {
            console.log("[gushiwen] Less than 2 links, trying findPoem");
            return await findPoemInGushiwen(poem);
        }

        const authorLinkText = allLinks.eq(1).text();
        console.log("[gushiwen] Author link text:", authorLinkText);
        const matchResult = authorLinkText.match(/^(.*)《(.*)》$/);
        if (!matchResult) {
            console.log("[gushiwen] Author pattern not matched, trying findPoem");
            return await findPoemInGushiwen(poem);
        }

        const author = matchResult[1];
        const title = matchResult[2];
        console.log("[gushiwen] Found:", { title, author, matched });

        return { status: 0, data: [title, author, matched] };
    } catch (error) {
        console.error("[gushiwen] searchGushiwen error:", error);
        if (axios.isAxiosError(error)) {
            if (error.code === "ECONNABORTED") {
                console.log("[gushiwen] Timeout");
                return { status: 7, data: empty };
            }
            console.error("[gushiwen] Axios error:", error.message, error.code, error.response?.status);
            // 网络错误或其他错误，返回搜索失败而不是 null
            return { status: 1, data: empty };
        }
        console.error("[gushiwen] Unknown error:", error);
        return { status: 1, data: empty };
    }
}

// 在古诗文网搜索整首诗
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
        console.log("[gushiwen] Response data length in findPoem:", htmlContent.length);
        const $ = load(htmlContent);
        const sonsDiv = $("div.sons").first();

        console.log("[gushiwen] findPoem sonsDiv length:", sonsDiv.length);

        if (sonsDiv.length === 0) {
            console.log("[gushiwen] No sons div in findPoem");
            return { status: 1, data: empty };
        }

        const contsonDiv = sonsDiv.find("div.contson");
        console.log("[gushiwen] contsonDiv length:", contsonDiv.length);
        if (contsonDiv.length === 0) {
            console.log("[gushiwen] No contson div");
            return { status: 1, data: empty };
        }

        let text = contsonDiv.text();
        console.log("[gushiwen] Original text:", text.substring(0, 100));

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
        console.log("[gushiwen] Text after removing brackets:", text.substring(0, 100));

        const matched = judge(text, poem);
        console.log("[gushiwen] Judge result:", matched);
        if (!matched) {
            const exjudgeResult = exjudge(text, poem);
            console.log("[gushiwen] Exjudge result:", exjudgeResult);
            if (!exjudgeResult) {
                return { status: 1, data: empty };
            }
            return { status: 2, data: empty };
        }

        const titleP = sonsDiv.find("p").first();
        const title = titleP.text().replace(/[\n\r ]/g, "");
        console.log("[gushiwen] Title:", title);

        const sourceP = sonsDiv.find("p.source");
        const author = sourceP.text().replace(/[\n\r ]/g, "");
        console.log("[gushiwen] Author:", author);

        return { status: 0, data: [title, author, matched] };
    } catch (error) {
        console.error("[gushiwen] findPoemInGushiwen error:", error);
        if (axios.isAxiosError(error)) {
            if (error.code === "ECONNABORTED") {
                console.log("[gushiwen] Timeout in findPoem");
                return { status: 7, data: empty };
            }
            console.error("[gushiwen] Axios error in findPoem:", error.message, error.code, error.response?.status);
            // 网络错误或其他错误，返回搜索失败而不是 null
            return { status: 1, data: empty };
        }
        console.error("[gushiwen] Unknown error in findPoem:", error);
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

// 游戏状态管理
interface PoemData {
    content: string;
    origin: string;
    author: string;
    pos: number;
}

class GameState {
    content: string = "";
    origin: string = "";
    author: string = "";
    pos: number = 0;

    setPoem(data: PoemData) {
        this.content = data.content;
        this.origin = data.origin;
        this.author = data.author;
        this.pos = data.pos;
    }

    getPoem(): PoemData {
        return {
            content: this.content,
            origin: this.origin,
            author: this.author,
            pos: this.pos,
        };
    }
}

const gameState = new GameState();

// 开始新游戏
export async function newGame() {
    const poem = await getPoem();
    gameState.content = poem.content;
    gameState.origin = poem.origin;
    gameState.author = poem.author;
    gameState.pos = 0;

    // 跳过标点符号
    while (gameState.pos < gameState.content.length && PUNCTUATION.includes(gameState.content[gameState.pos])) {
        gameState.pos++;
    }

    // 如果位置超出范围，重新开始
    if (gameState.pos >= gameState.content.length) {
        await newGame();
    }
}

// 进入下一轮
export async function newTurn() {
    gameState.pos++;

    // 跳过标点符号
    while (
        gameState.pos < gameState.content.length &&
        PUNCTUATION.includes(gameState.content[gameState.pos])
    ) {
        gameState.pos++;
    }

    // 如果位置超出范围，开始新游戏
    if (gameState.pos >= gameState.content.length) {
        await newGame();
    }
}

// 获取当前公屏显示的诗句
export function getPublicScreenPoem() {
    if (gameState.pos >= gameState.content.length) {
        newTurn();
    }
    return {
        content: gameState.content,
        origin: gameState.origin,
        author: gameState.author,
        pos: gameState.pos,
    };
}

// 检查诗句
export async function checkPoem(poem: string): Promise<{ verdict: number; data: string[] }> {
    const empty = ["", "", ""];

    const debugBase: Record<string, any> = {
        input: poem,
        content: gameState.content,
        origin: gameState.origin,
        author: gameState.author,
        pos: gameState.pos,
    };

    // 检查长度
    const cleanPoem = clearMark(poem);
    if (cleanPoem.length < 7 || cleanPoem.length >= 50) {
        console.log("[poem-snake] LENGTH_INVALID", {
            ...debugBase,
            reason: "length_invalid",
            cleanPoemLen: cleanPoem.length,
        });
        return { verdict: VERDICT.LENGTH_INVALID, data: empty };
    }

    // 检查是否包含高亮字符
    if (gameState.pos >= gameState.content.length) {
        console.log("[poem-snake] POS_OUT_OF_RANGE", {
            ...debugBase,
            reason: "pos_out_of_range",
        });
        return { verdict: VERDICT.UNKNOWN, data: empty };
        return { verdict: VERDICT.NOT_FOUND, data: empty };
    }

    const highlightedChar = gameState.content[gameState.pos];
    debugBase.highlightedChar = highlightedChar;
    if (!poem.includes(highlightedChar)) {
        console.log("[poem-snake] NO_HIGHLIGHT_CHAR", {
            ...debugBase,
            reason: "no_highlight_char",
        });
        return { verdict: VERDICT.NO_HIGHLIGHTED_CHAR, data: empty };
    }

    // 检查是否是原诗
    const contentClean = clearMark(gameState.content);
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

            console.log("[poem-snake] GUSHIWEN_FOUND", {
                ...debugBase,
                gushiwenResult: gushiwenResult.data,
            });

            return {
                verdict: VERDICT.CORRECT,
                data: gushiwenResult.data,
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

    // 特殊情况：如果用户输入以句号结尾，但匹配到的完整句子在句号之后还有内容，也判定为半句
    // 例如：用户输入"窗含西岭千秋雪。"，完整句子是"窗含西岭千秋雪，门泊东吴万里船。"
    const poemOriginal = poem.trim();
    if (poemOriginal.endsWith("。") && matchedLineOriginal.length > poemOriginal.length) {
        // 检查完整句子在用户输入之后是否还有非标点符号的内容
        const remainingOriginal = matchedLineOriginal.slice(poemOriginal.length);
        const remainingOriginalWithoutPunct = remainingOriginal.replace(/[，。！？、；：""''（）《》〈〉……—…·\s]/g, "");
        if (remainingOriginalWithoutPunct.length > 0) {
            // 用户输入的是半句，判定为不正确
            console.log("[poem-snake] INCOMPLETE", {
                ...debugBase,
                reason: "incomplete_sentence_with_period",
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
    return {
        verdict: VERDICT.CORRECT,
        // data[0] = 标题，data[1] = 【朝代·姓名】，data[2] = 匹配到的整句
        data: [searchResult.title, searchResult.authorDisplay, searchResult.matchedLine],
    };
}

// 导出 VERDICT 和 VERDICT_TEXT 以供外部使用
export { VERDICT, VERDICT_TEXT };

