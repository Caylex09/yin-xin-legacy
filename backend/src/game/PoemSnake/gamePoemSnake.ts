// Poem Snake 游戏专用状态和逻辑
import { VERDICT, VERDICT_TEXT, getPoem, searchPoem, clearMark } from "../gameApi";

const PUNCTUATION = ["，", "？", "。", "！", "：", "、", "；"];

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
        console.log("[poem-snake] NOT_FOUND", {
            ...debugBase,
            reason: "search_no_results",
        });
        return { verdict: VERDICT.NOT_FOUND, data: empty };
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

