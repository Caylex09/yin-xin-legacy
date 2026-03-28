import { BaseGameManager } from "../common/BaseGameManager";
import { BaseRoom, BaseSubmission } from "../common/types";
import { getPoem, PUNCTUATION } from "../gameApi";
import { checkPoem, VERDICT, VERDICT_TEXT } from "./gamePoemSnake";
import { getDb } from "../../db";

export interface PoemSnakeState {
    poems: Array<{ content: string; origin: string; author: string; pos: number }>;
    currentPos: number;
    submissions: BaseSubmission[];
}

export class PoemSnakeGameManager extends BaseGameManager<PoemSnakeState, BaseRoom<PoemSnakeState>> {

    protected getInitialGameState(): PoemSnakeState {
        return {
            poems: [],
            currentPos: 0,
            submissions: [],
        };
    }

    public async startGame(roomCode: string): Promise<{ success: boolean; error?: string }> {
        const room = this.getRoom(roomCode);
        if (!room) {
            return { success: false, error: "房间不存在" };
        }
        if (room.players.length === 0) {
            return { success: false, error: "房间为空" };
        }
        if (room.status !== "waiting") {
            return { success: false, error: "游戏已开始" };
        }

        const now = Date.now();
        room.status = "playing";
        room.currentRound = 1;
        room.state.poems = [];
        room.state.currentPos = 0;
        room.state.submissions = [];
        room.playerScores.clear();
        room.activeVotes.clear(); // 清空所有旧的投票
        room.lastActivity = now;

        for (const player of room.players) {
            room.playerScores.set(player.uid, 0);
        }

        try {
            const success = await this.fetchNextPoem(roomCode);
            if (!success) {
                return { success: false, error: `获取诗词失败` };
            }

            if (room.state.poems.length > 0) {
                room.state.currentPos = room.state.poems[0].pos;
            }
        } catch (error) {
            room.status = "waiting";
            return { success: false, error: "生成题目失败：" + (error as Error).message };
        }

        return { success: true };
    }

    public async fetchNextPoem(roomCode: string): Promise<boolean> {
        const room = this.getRoom(roomCode);
        if (!room) return false;

        try {
            const poem = await getPoem();
            if (!poem || !poem.content) return false;

            let pos = 0;
            while (pos < poem.content.length && PUNCTUATION.includes(poem.content[pos])) {
                pos++;
            }
            if (pos >= poem.content.length) pos = 0;

            room.state.poems.push({ ...poem, pos });
            return true;
        } catch (e) {
            console.error("fetchNextPoem error:", e);
            return false;
        }
    }

    public getCurrentQuestion(roomCode: string): { content: string; highlightedChar: string; author: string; poemTitle: string; round: number } | null {
        const room = this.getRoom(roomCode);
        if (!room || room.status !== "playing") return null;
        if (room.currentRound > room.maxRounds || room.currentRound < 1) return null;

        const poem = room.state.poems[room.currentRound - 1];
        const currentCharPos = room.state.currentPos;
        if (currentCharPos >= poem.content.length) return null;

        return {
            content: poem.content,
            highlightedChar: poem.content[currentCharPos] || "",
            author: poem.author,
            poemTitle: poem.origin,
            round: room.currentRound,
        };
    }

    // ============== 处理输入 ================

    public async handlePlayerAction(roomCode: string, uid: number, actionName: string, payload: any): Promise<any> {
        if (actionName === "submitAnswer") {
            return this.submitAnswer(roomCode, uid, payload.answer);
        } else if (actionName === "applySkip") {
            return this.applySkip(roomCode, uid);
        }
        throw new Error("未知的动作名称");
    }

    public async submitAnswer(roomCode: string, uid: number, answer: string): Promise<{ verdict: number; correct: boolean; data: string[] }> {
        const room = this.getRoom(roomCode);
        if (!room || room.status !== "playing") throw new Error("房间不存在或游戏未开始");
        if (!room.players.some(p => p.uid === uid)) throw new Error("你不是该房间的玩家");

        const poem = room.state.poems[room.currentRound - 1];
        const result = await checkPoem(answer, poem.content, room.state.currentPos);

        room.lastActivity = Date.now();

        if (result.verdict === VERDICT.CORRECT) {
            const currentScore = room.playerScores.get(uid) || 0;
            room.playerScores.set(uid, currentScore + 5);

            // 答对了，如果此时正在 skip 投票，则撤销跳过意图
            this.clearVote(roomCode, "skip");

            room.state.currentPos++;
            while (room.state.currentPos < poem.content.length && PUNCTUATION.includes(poem.content[room.state.currentPos])) {
                room.state.currentPos++;
            }

            if (room.state.currentPos >= poem.content.length) {
                room.currentRound++;
                if (room.currentRound <= room.maxRounds) {
                    await this.fetchNextPoem(roomCode);
                    room.state.currentPos = room.state.poems[room.currentRound - 1].pos;
                }
            }
        }

        const player = room.players.find(p => p.uid === uid);
        const submission: BaseSubmission = {
            id: `${roomCode}_${Date.now()}_${uid}`,
            userId: uid,
            username: player?.username || "",
            answer: result.data[2] || answer,
            isCorrect: result.verdict === VERDICT.CORRECT,
            verdictText: VERDICT_TEXT[result.verdict],
            submittedAt: new Date().toISOString(),
            data: { author: result.data[1] || "", poemTitle: result.data[0] || "" }
        };
        room.state.submissions.push(submission);

        return {
            verdict: result.verdict,
            correct: result.verdict === VERDICT.CORRECT,
            data: result.data
        };
    }

    // ================= 快捷动作 =================
    public async applySkip(roomCode: string, uid: number): Promise<{ skipChar: boolean; finished: boolean }> {
        const room = this.getRoom(roomCode);
        if (!room) return { skipChar: false, finished: false };

        const poem = room.state.poems[room.currentRound - 1];

        room.state.currentPos++;
        while (room.state.currentPos < poem.content.length && PUNCTUATION.includes(poem.content[room.state.currentPos])) {
            room.state.currentPos++;
        }

        if (room.state.currentPos >= poem.content.length) {
            room.currentRound++;
            if (room.currentRound <= room.maxRounds) {
                await this.fetchNextPoem(roomCode);
                room.state.currentPos = room.state.poems[room.currentRound - 1].pos;
            }
            return { skipChar: false, finished: room.currentRound > room.maxRounds };
        }

        return { skipChar: true, finished: false };
    }

    // ================= 拓展 API =================
    public tryMatchWithDetails(playersNeeded: number = 2): { matched: boolean; roomCode?: string; players?: Array<{ uid: number; username: string; avatar: string }> } {
        const uids = super.tryMatch(playersNeeded);
        if (uids && uids.length >= 2) {
            const player1 = uids[0];
            const player2 = uids[1];
            const db = getDb();
            const user1 = db.prepare("SELECT username, avatar FROM users WHERE uid = ?").get(player1) as { username: string, avatar: string } | undefined;
            const user2 = db.prepare("SELECT username, avatar FROM users WHERE uid = ?").get(player2) as { username: string, avatar: string } | undefined;
            if (!user1 || !user2) return { matched: false };

            const code = this.createRoom(player1, user1.username, user1.avatar, 5, true);
            const joinResult = this.joinRoom(code, player2, user2.username, user2.avatar);

            if (joinResult.success) {
                return { matched: true, roomCode: code, players: [{ uid: player1, username: user1.username, avatar: user1.avatar }, { uid: player2, username: user2.username, avatar: user2.avatar }] };
            }
        }
        return { matched: false };
    }

    public findUserActiveRoom(uid: number): string | null {
        for (const [code, room] of this.rooms.entries()) {
            if (room.players.some((p) => p.uid === uid)) return code;
            if (room.status === "playing" && room.allJoinedUsers.has(uid)) return code;
        }
        return null;
    }

    public leaveRoom(roomCode: string, uid: number): void {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        const keepPlayerInWaitingMatch = room.autoStart && room.status === "waiting";
        const keepDuringPlaying = room.status === "playing";
        if (!keepPlayerInWaitingMatch && !keepDuringPlaying) {
            room.players = room.players.filter((p) => p.uid !== uid);
            room.playerScores.delete(uid);
        }

        super.leaveMatchmaking(uid);

        if (!keepPlayerInWaitingMatch && !keepDuringPlaying && room.players.length === 0) {
            if ((room as any).countdownTimer) {
                clearInterval((room as any).countdownTimer);
                delete (room as any).countdownTimer;
            }
        }
    }

    public destroyRoom(roomCode: string): BaseRoom<PoemSnakeState> | null {
        const room = this.rooms.get(roomCode);
        if (room) {
            this.rooms.delete(roomCode);
        }
        return room || null;
    }

    public finishGame(roomCode: string): { players: Array<{ uid: number; username: string; score: number; bonusScore: number; newTotalScore: number }> } | null {
        const room = this.rooms.get(roomCode);
        if (!room) return null;

        this.clearVote(roomCode, "end");
        this.clearVote(roomCode, "draw");

        const results = room.players.map((player) => {
            return {
                uid: player.uid,
                username: player.username,
                score: room.playerScores.get(player.uid) || 0,
                bonusScore: 0,
                newTotalScore: 0,
            };
        });

        if (results.length === 0) return { players: [] };

        const winner = results.reduce((prev, curr) => (curr.score > prev.score ? curr : prev));
        const isTie = results.every((r) => r.score === winner.score);

        if (!room.autoStart) {
            const db = getDb();
            for (const result of results) {
                result.bonusScore = 0;
                const currentUser = db.prepare("SELECT score FROM users WHERE uid = ?").get(result.uid) as { score: number } | undefined;
                result.newTotalScore = currentUser?.score || 0;
            }
        } else {
            const db = getDb();
            const drawSession = room.activeVotes.get("draw");
            const isDrawRequest = drawSession && drawSession.requests.size >= 2;

            for (const result of results) {
                let bonusScore = 0;
                if (isDrawRequest || isTie) {
                    bonusScore = 5;
                } else if (result.uid === winner.uid) {
                    bonusScore = 20;
                } else {
                    bonusScore = 5;
                }
                result.bonusScore = bonusScore;

                const currentUser = db.prepare("SELECT score FROM users WHERE uid = ?").get(result.uid) as { score: number } | undefined;
                const currentScore = currentUser?.score || 0;
                const newScore = currentScore + result.score + bonusScore;
                db.prepare("UPDATE users SET score = ? WHERE uid = ?").run(newScore, result.uid);
                result.newTotalScore = newScore;

                const now = new Date().toISOString();
                const totalChange = result.score + bonusScore;
                if (totalChange !== 0) {
                    db.prepare("INSERT INTO score_history (uid, change_amount, reason, room_code, created_at) VALUES (?, ?, ?, ?, ?)").run(
                        result.uid,
                        totalChange,
                        `1v1对战：游戏得分 ${result.score}，${bonusScore > 0 ? `奖励 ${bonusScore}` : '无奖励'}`,
                        roomCode,
                        now
                    );
                }
            }
        }

        room.status = "finished";
        room.lastActivity = Date.now();

        return { players: results };
    }

    // ================= 投票 wrappers =================

    public requestSkip(roomCode: string, uid: number) {
        const room = this.rooms.get(roomCode);
        if (!room || room.status !== "playing") return { success: false, state: "failed" as const, skipChar: false, error: "房间不存在或游戏未开始" };
        if (!room.players.some((p) => p.uid === uid)) return { success: false, state: "failed" as const, skipChar: false, error: "你不是该房间的玩家" };

        if (room.activeVotes.has("skip")) {
            return { success: false, state: "failed" as const, error: "当前已有跳过投票在进行中，请输入 accept 同意或 reject 拒绝" };
        }

        if (room.players.length === 1) {
            this.applySkip(roomCode, uid).then(() => { });
            return { success: true, state: "applied" as const, skipChar: true, finished: false, accept: 1, reject: 0 };
        }

        const voteRes = this.initiateVote(roomCode, "skip", uid);
        return { success: true, state: "pending" as const, needed: voteRes.needed, current: 1, accept: 1, reject: 0, initiator: uid };
    }

    public async resolveSkipVote(roomCode: string, forceApply: boolean = false) {
        const room = this.getRoom(roomCode);
        if (!room || room.status !== "playing") {
            this.clearVote(roomCode, "skip");
            return { success: false, state: "failed" as const };
        }
        const session = room.activeVotes.get("skip");
        if (!session) return { success: false, state: "failed" as const };

        const needed = Math.floor(session.voteOnlineCount / 2) + 1;
        const result = this.calculateVoteResult(roomCode, "skip");
        this.clearVote(roomCode, "skip");

        if (forceApply || (result && result.accept >= needed)) {
            const res = await this.applySkip(roomCode, session.initiator);
            return { success: true, state: "applied" as const, ...res, ...result, needed };
        }
        return { success: true, state: "failed" as const, ...result, needed };
    }

    public async acceptSkip(roomCode: string, uid: number) {
        const result = this.handleVote(roomCode, "skip", uid, "accept");
        const session = this.getRoom(roomCode)?.activeVotes.get("skip");
        if (result.success && session) {
            const voteResult = this.calculateVoteResult(roomCode, "skip");
            const needed = Math.floor(session.voteOnlineCount / 2) + 1;
            if (voteResult && voteResult.accept >= needed) {
                return await this.resolveSkipVote(roomCode, true);
            }
            return { success: true, state: "pending" as const, needed, accept: voteResult?.accept || 0, reject: voteResult?.reject || 0, voteStatus: voteResult?.voteStatus || [] };
        }
        return { success: result.success, state: "pending" as const };
    }

    public rejectSkip(roomCode: string, uid: number) {
        const result = this.handleVote(roomCode, "skip", uid, "reject");
        const session = this.getRoom(roomCode)?.activeVotes.get("skip");
        const voteResult = this.calculateVoteResult(roomCode, "skip");
        const needed = session ? Math.floor(session.voteOnlineCount / 2) + 1 : 0;
        return { success: result.success, state: "pending" as const, needed, accept: voteResult?.accept || 0, reject: voteResult?.reject || 0, voteStatus: voteResult?.voteStatus || [] };
    }

    public requestEnd(roomCode: string, uid: number) {
        const room = this.rooms.get(roomCode);
        if (!room || room.status !== "playing") return { success: false, error: "房间不存在" };
        if (room.activeVotes.has("end")) return { success: false, error: "已有提前结束投票在进行中" };
        const res = this.initiateVote(roomCode, "end", uid);
        return { success: true, needed: res.needed, state: "pending" as const, initiator: uid, accept: 1, reject: 0, current: 1 };
    }

    public acceptEnd(roomCode: string, uid: number) {
        const result = this.handleVote(roomCode, "end", uid, "accept");
        const session = this.getRoom(roomCode)?.activeVotes.get("end");
        if (result.success && session) {
            const voteResult = this.calculateVoteResult(roomCode, "end");
            const needed = Math.floor(session.voteOnlineCount / 2) + 1;
            if (voteResult && voteResult.accept >= needed) {
                return this.resolveEndVote(roomCode);
            }
            return { success: true, state: "pending" as const, needed, accept: voteResult?.accept || 0, reject: voteResult?.reject || 0, voteStatus: voteResult?.voteStatus || [] };
        }
        return { success: result.success, state: "pending" as const, accept: 0, reject: 0, voteStatus: [] };
    }

    public rejectEnd(roomCode: string, uid: number) {
        const result = this.handleVote(roomCode, "end", uid, "reject");
        const session = this.getRoom(roomCode)?.activeVotes.get("end");
        const voteResult = this.calculateVoteResult(roomCode, "end");
        const needed = session ? Math.floor(session.voteOnlineCount / 2) + 1 : 0;
        return { success: result.success, state: "pending" as const, needed, accept: voteResult?.accept || 0, reject: voteResult?.reject || 0, voteStatus: voteResult?.voteStatus || [] };
    }

    public resolveEndVote(roomCode: string) {
        const room = this.getRoom(roomCode);
        if (!room) return { success: false, state: "failed" as const };
        const session = room.activeVotes.get("end");
        if (!session) return { success: false, state: "failed" as const };

        const needed = Math.floor(session.voteOnlineCount / 2) + 1;
        const result = this.calculateVoteResult(roomCode, "end");
        this.clearVote(roomCode, "end");

        if (result && result.accept >= needed) {
            const finishResult = this.finishGame(roomCode);
            return { success: true, state: "applied" as const, finishResult, needed, ...result };
        }
        return { success: true, state: "failed" as const, needed, ...result };
    }

    public getRoomSubmissions(roomCode: string, uid?: number) {
        const room = this.getRoom(roomCode);
        if (!room) return [];
        if (uid) return room.state.submissions.filter(s => s.userId === uid);
        return room.state.submissions;
    }

    public startRoomCleanup(io: any) {
        setInterval(() => { /* cleanup logic */ }, 60000);
    }


    public requestDraw(roomCode: string, uid: number) {
        const room = this.rooms.get(roomCode);
        if (!room || room.status !== "playing") return { success: false, error: "房间不符合条件" };
        if (room.activeVotes.has("draw")) return { success: false, error: "已有提前结算请求进行中" };
        this.initiateVote(roomCode, "draw", uid);
        return { success: true };
    }

    public acceptDraw(roomCode: string, uid: number): { success: boolean; error?: string; finished?: boolean; finishResult?: any } {
        const room = this.rooms.get(roomCode);
        if (!room || room.status !== "playing") return { success: false, error: "房间不符合条件" };
        this.handleVote(roomCode, "draw", uid, "accept");

        const session = room.activeVotes.get("draw");
        if (session && session.requests.size >= 2) {
            const finishResult = this.finishGame(roomCode);
            this.clearVote(roomCode, "draw");
            return { success: true, finished: true, finishResult };
        }
        return { success: true, finished: false };
    }

    public rejectDraw(roomCode: string, uid: number) {
        this.handleVote(roomCode, "draw", uid, "reject");
        this.clearVote(roomCode, "draw");
        return { success: true };
    }
}

export const poemSnakeRoomManager = new PoemSnakeGameManager();