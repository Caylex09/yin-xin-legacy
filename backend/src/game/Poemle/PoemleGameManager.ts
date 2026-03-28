import { BaseGameManager } from "../common/BaseGameManager";
import { BaseRoom, BasePlayer } from "../common/types";
import { searchClient } from "../../meiliClient";
import { getDb } from "../../db";
import { judgePoemle, PUNCTUATION } from "./gamePoemle";

export interface PoemleQuestion {
    id: string;
    title: string;
    author: string; authorName: string; dynasty: string;
    line: string;
    type: string;
}

export interface PoemlePlayerState {
    guesses: string[];
    startTime: number;
    finished: boolean;
    abandoned: boolean;
    roundScore: number; // calculated at finish or real-time
}

export interface PoemleGameState {
    mode: string; // '七言' | '五言' | '自由' 
    currentQuestion: PoemleQuestion | null;
    playerRoundStates: Record<number, PoemlePlayerState>; // mapping uid to state
    startTime: number;
    firstBloodUid: number | null;
}

export interface PoemleRoom extends BaseRoom<PoemleGameState> {
    mode: string; // The room's chosen mode
}

export class PoemleGameManager extends BaseGameManager<PoemleGameState, PoemleRoom> {
    public maxScorePerRound = 1000;
    protected MIN_ROUNDS = 1;

    protected getInitialGameState(): PoemleGameState {
        return {
            mode: '自由',
            currentQuestion: null,
            playerRoundStates: {},
            startTime: 0,
            firstBloodUid: null
        };
    }

    // Override to include mode
    public createRoom(hostId: number, username: string, avatar: string, maxRounds?: number, autoStart?: boolean, mode?: string): string {
        const roomCode = super.createRoom(hostId, username, avatar, maxRounds, autoStart);
        const room = this.rooms.get(roomCode) as PoemleRoom;
        if (room) {
            room.mode = mode || '自由';
            room.state.mode = room.mode;
        }
        return roomCode;
    }

    private async fetchRandomQuestion(mode: string): Promise<PoemleQuestion | null> {
        const db = getDb();
        const poems = db.prepare("SELECT * FROM wiki_items WHERE target_type = 'poetry'").all() as any[];

        let filtered = poems;
        if (mode === '七言' || mode === '五言') {
            filtered = poems.filter(t => {
                try {
                    const attrs = JSON.parse(t.attributes || '{}');
                    return (attrs.tags || []).some((t: string) => t.includes(mode));
                } catch (e) { return false; }
            });
        }
        if (filtered.length === 0) filtered = poems;
        if (filtered.length === 0) return null;

        for (let tries = 0; tries < 50; tries++) {
            const chosen = filtered[Math.floor(Math.random() * filtered.length)];
            try {
                const doc = await searchClient.index("poetry").getDocument(chosen.target_id);
                const sentences: string[] = [];
                const iterate = (arr: any) => {
                    if (Array.isArray(arr)) {
                        for (const a of arr) iterate(a);
                    } else if (typeof arr === 'string') {
                        sentences.push(arr);
                    }
                }
                iterate(doc.content || []);

                const chunks = sentences.flatMap(str => str.match(/[^。！？；]+[。！？；]?/g) || []);
                let eligible = chunks.filter(chunk => {
                    const parts = chunk.split(/[，、,]/).map(x => Array.from(x).filter(c => !PUNCTUATION.has(c as string)).join('')).filter(x => x.length > 0);
                    if (parts.length !== 2) return false;
                    if (mode === '七言') return parts[0].length === 7 && parts[1].length === 7;
                    if (mode === '五言') return parts[0].length === 5 && parts[1].length === 5;
                    return true;
                });

                if (eligible.length > 0) {
                    const line = eligible[Math.floor(Math.random() * eligible.length)];
                    let authorName = doc.author || '';
                    let dynasty = '未知';
                    if (doc.author) {
                        try {
                            const poet = await searchClient.index('poets').getDocument(doc.author);
                            authorName = poet.name;
                            dynasty = poet.dynasty || dynasty;
                        } catch (e) { }
                    }
                    return {
                        id: chosen.target_id,
                        title: doc.title || '',
                        author: doc.author || '', authorName: authorName, dynasty: dynasty,
                        line,
                        type: mode
                    };
                }
            } catch { }
        }
        return null;
    }

    public async startGame(roomCode: string): Promise<{ success: boolean; error?: string }> {
        const room = this.rooms.get(roomCode);
        if (!room) return { success: false, error: "房间不存在" };
        if (room.status === "playing") return { success: false, error: "游戏已在进行中" };

        const q = await this.fetchRandomQuestion(room.mode);
        if (!q) return { success: false, error: "无法获取题目" };

        room.status = "playing";
        room.currentRound = 1;
        room.state.currentQuestion = q;
        room.state.startTime = Date.now();
        room.state.firstBloodUid = null;
        room.state.playerRoundStates = {};

        // Initialize state for each player
        for (const player of room.players) {
            room.playerScores.set(player.uid, 0); // reset score
            room.state.playerRoundStates[player.uid] = {
                guesses: [],
                startTime: Date.now(),
                finished: false,
                abandoned: false,
                roundScore: 0
            };
        }

        return { success: true };
    }

    public calculateRealTimeScore(uid: number, room: PoemleRoom): number {
        const pState = room.state.playerRoundStates[uid];
        if (!pState) return 0;
        if (pState.abandoned) return 0;
        if (pState.finished) return pState.roundScore;

        const Math = globalThis.Math;
        const elapsedSeconds = Math.floor((Date.now() - pState.startTime) / 1000);
        // 如果游戏还没结束，即尚未判定到全对前，目前的 guesses 都是错的。
        const attempts = pState.guesses.length;
        const penalty = elapsedSeconds + (attempts * 20);
        return Math.max(1, 5000 - penalty);
    }

    public async handlePlayerAction(roomCode: string, uid: number, actionName: string, payload: any): Promise<any> {
        const room = this.rooms.get(roomCode);
        if (!room) return { success: false, error: "房间不存在" };

        if (actionName === "submit_guess") {
            const q = room.state.currentQuestion;
            if (!q) return { success: false, error: "当前没有题目" };
            const pState = room.state.playerRoundStates[uid];
            if (!pState) return { success: false, error: "玩家状态不存在" };
            if (pState.finished || pState.abandoned) return { success: false, error: "您已完成或放弃本轮" };

            const { guess, structure } = payload;
            pState.guesses.push(guess);

            let judgeResult = judgePoemle(guess, q.line, structure);
            const isAllGreen = judgeResult.every(r => r.verdict === 'green') && judgeResult.length === Array.from(q.line).filter(c => !PUNCTUATION.has(c)).length;

            if (structure && Array.isArray(structure)) {
                const targetLen = Array.from(q.line).filter(c => !PUNCTUATION.has(c)).length;
                const isLengthCorrect = judgeResult.length === targetLen;
                const fillVerdict = isLengthCorrect ? 'green' : 'gray';
                const gridSize = room.state.mode === '自由' ? 20 : targetLen;
                const padded = new Array(gridSize).fill(null).map(() => ({ char: '', verdict: fillVerdict }));
                let rIdx = 0;
                let pIdx = 0;
                for (const gLen of structure) {
                    for (let i = 0; i < gLen; i++) {
                        if (rIdx < judgeResult.length) padded[pIdx++] = judgeResult[rIdx++];
                    }
                    pIdx += (Math.floor(gridSize / 2) - gLen);
                }
                judgeResult = padded as any;
            } else {
                const targetLen = Array.from(q.line).filter(c => !PUNCTUATION.has(c)).length;
                const isLengthCorrect = judgeResult.length === targetLen;
                const fillVerdict = isLengthCorrect ? 'green' : 'gray';

                const gridSize = room.state.mode === '自由' ? 20 : targetLen;
                const padded = new Array(gridSize).fill(null).map(() => ({ char: '', verdict: fillVerdict }));
                const halfLen = Math.ceil(judgeResult.length / 2);
                const halfSize = Math.floor(gridSize / 2);

                for (let i = 0; i < halfLen && i < halfSize; i++) {
                    padded[i] = judgeResult[i];
                    if (halfLen + i < judgeResult.length) {
                        padded[halfSize + i] = judgeResult[halfLen + i];
                    }
                }
                judgeResult = padded as any;
            }

            let isFirstBlood = false;
            if (isAllGreen) {
                const elapsedSeconds = Math.floor((Date.now() - pState.startTime) / 1000);
                const penalty = elapsedSeconds + ((pState.guesses.length - 1) * 20);
                pState.roundScore = Math.max(1, 5000 - penalty);
                pState.finished = true;

                if (!room.state.firstBloodUid) {
                    room.state.firstBloodUid = uid;
                    isFirstBlood = true;
                }
            }

            const allFinished = Object.values(room.state.playerRoundStates).every(s => s.finished || s.abandoned);

            return {
                success: true,
                judgeResult,
                isAllGreen,
                isFirstBlood,
                currentScore: this.calculateRealTimeScore(uid, room),
                allFinished
            };
        }

        if (actionName === "abandon") {
            const pState = room.state.playerRoundStates[uid];
            if (pState && !pState.finished) {
                pState.abandoned = true;
                pState.roundScore = 0; // or 0
                const allFinished = Object.values(room.state.playerRoundStates).every(s => s.finished || s.abandoned);
                return { success: true, allFinished };
            }
            return { success: false, error: "无法放弃" };
        }

        return { success: false, error: "未知的动作" };
    }

    public async skipQuestion(roomCode: string): Promise<any> {
        const room = this.rooms.get(roomCode);
        if (!room) return { success: false, error: "房间不存在" };

        const q = await this.fetchRandomQuestion(room.mode);
        if (!q) return { success: false, error: "无法获取题目" };

        room.state.currentQuestion = q;
        room.state.startTime = Date.now();
        room.state.firstBloodUid = null;

        for (const uid of Object.keys(room.state.playerRoundStates)) {
            const numUid = parseInt(uid);
            room.state.playerRoundStates[numUid] = {
                guesses: [],
                startTime: Date.now(),
                finished: false,
                abandoned: false,
                roundScore: 0
            };
        }
        return { success: true, question: q };
    }

    public async nextRound(roomCode: string): Promise<any> {
        const room = this.rooms.get(roomCode);
        if (!room) return { success: false, error: "房间不存在" };

        if (room.currentRound >= room.maxRounds) {
            room.status = "finished";
            return { success: true, finished: true };
        }

        const q = await this.fetchRandomQuestion(room.mode);
        if (!q) return { success: false, error: "无法获取题目" };

        room.currentRound += 1;
        room.state.currentQuestion = q;
        room.state.startTime = Date.now();
        room.state.firstBloodUid = null;

        for (const uid of Object.keys(room.state.playerRoundStates)) {
            const numUid = parseInt(uid);
            room.state.playerRoundStates[numUid] = {
                guesses: [],
                startTime: Date.now(),
                finished: false,
                abandoned: false,
                roundScore: 0
            };
        }
        return { success: true, finished: false, question: q };
    }
}

export const poemleGameManager = new PoemleGameManager();
