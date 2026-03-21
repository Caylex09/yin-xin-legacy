import crypto from "crypto";
import { BaseRoom, VoteSession, BasePlayer } from "./types";
import { getDb } from "../../db";

export interface VoteResult {
    accept: number;
    reject: number;
    otherAcceptCount: number;
    otherRejectCount: number;
    timeoutCount: number;
    voteStatus: Array<{ uid: number; username: string; status: "accept" | "reject" | "timeout" }>;
}

export abstract class BaseGameManager<TState, TRoom extends BaseRoom<TState>> {
    protected rooms: Map<string, TRoom> = new Map();
    protected matchmakingQueue: number[] = [];
    protected readonly MAX_ROOM_PLAYERS = 50;
    protected readonly MIN_ROUNDS = 5;
    protected readonly MAX_ROUNDS = 100;

    // ==================== 匹配系统 ====================

    public getMatchmakingQueueSize(): number {
        return this.matchmakingQueue.length;
    }

    public joinMatchmaking(uid: number): void {
        if (!this.matchmakingQueue.includes(uid)) {
            this.matchmakingQueue.push(uid);
        }
    }

    public leaveMatchmaking(uid: number): void {
        const index = this.matchmakingQueue.indexOf(uid);
        if (index > -1) {
            this.matchmakingQueue.splice(index, 1);
        }
    }

    /**
     * 尝试从队列中匹配指定人数，成功则返回匹配的 UID 列表，否则返回 null
     */
    public tryMatch(playersNeeded: number = 2): number[] | null {
        if (this.matchmakingQueue.length >= playersNeeded) {
            return this.matchmakingQueue.splice(0, playersNeeded);
        }
        return null;
    }

    // ==================== 房间系统 ====================

    protected generateRoomCode(): string {
        return crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 6);
    }

    public getRoom(roomCode: string): TRoom | undefined {
        return this.rooms.get(roomCode);
    }

    public getRooms(): Map<string, TRoom> {
        return this.rooms;
    }

    protected abstract getInitialGameState(): TState;

    public createRoom(hostId: number, username: string, avatar: string, maxRounds: number = this.MIN_ROUNDS, autoStart = true): string {
        const rounds = Math.min(Math.max(maxRounds, this.MIN_ROUNDS), this.MAX_ROUNDS);
        const code = this.generateRoomCode();

        const db = getDb();
        const user = db.prepare("SELECT score FROM users WHERE uid = ?").get(hostId) as { score: number } | undefined;
        const score = user?.score || 0;

        const now = Date.now();
        const room = {
            id: code,
            hostId,
            players: [{ uid: hostId, username, avatar, score }],
            status: "waiting",
            currentRound: 0,
            maxRounds: rounds,
            playerScores: new Map([[hostId, 0]]),
            state: this.getInitialGameState(),
            activeVotes: new Map<string, VoteSession>(),
            createdAt: now,
            lastActivity: now,
            allJoinedUsers: new Set([hostId]),
            onlineUsers: new Set([hostId]),
            autoStart,
        } as TRoom;

        this.rooms.set(code, room);
        return code;
    }

    public joinRoom(roomCode: string, uid: number, username: string, avatar: string): { success: boolean; error?: string } {
        const room = this.rooms.get(roomCode);
        if (!room) {
            return { success: false, error: "房间不存在" };
        }

        // 如果用户已经在房间中，直接返回成功（幂等性）
        if (room.players.some((p) => p.uid === uid)) {
            return { success: true };
        }

        // 如果游戏已开始，仅允许曾在房间的玩家回归
        if (room.status === "playing") {
            if (!room.allJoinedUsers.has(uid)) {
                return { success: false, error: "游戏已开始，无法加入" };
            }
            if (room.players.length >= this.MAX_ROOM_PLAYERS) {
                return { success: false, error: "房间已满" };
            }
            const db = getDb();
            const user = db.prepare("SELECT score FROM users WHERE uid = ?").get(uid) as { score: number } | undefined;
            const score = user?.score || 0;

            const previousScore = room.playerScores.get(uid) ?? 0;
            room.players.push({ uid, username, avatar, score });
            room.playerScores.set(uid, previousScore);
            room.allJoinedUsers.add(uid);

            return { success: true };
        }

        // 游戏未开始时，检查房间是否已满
        if (room.players.length >= this.MAX_ROOM_PLAYERS) {
            return { success: false, error: "房间已满" };
        }

        const db = getDb();
        const user = db.prepare("SELECT score FROM users WHERE uid = ?").get(uid) as { score: number } | undefined;
        const score = user?.score || 0;

        room.players.push({ uid, username, avatar, score });
        room.playerScores.set(uid, 0);
        room.allJoinedUsers.add(uid);

        return { success: true };
    }

    public removeRoom(roomCode: string): void {
        this.rooms.delete(roomCode);
    }

    // ==================== 投票系统 ====================

    /**
     * 发起投票
     */
    public initiateVote(roomCode: string, type: string, uid: number): { success: boolean; error?: string; needed?: number; onlineCount?: number } {
        const room = this.rooms.get(roomCode);
        if (!room) return { success: false, error: "房间不存在" };
        if (!room.players.some(p => p.uid === uid)) return { success: false, error: "不是该房间玩家" };

        if (room.activeVotes.has(type)) {
            return { success: false, error: "该类型投票正在进行中" };
        }

        const onlineCount = room.onlineUsers.size || room.players.length;
        const session: VoteSession = {
            type,
            initiator: uid,
            requests: new Set([uid]),
            votes: new Map([[uid, "accept"]]),
            voteOnlineCount: onlineCount,
        };

        room.activeVotes.set(type, session);
        room.lastActivity = Date.now();

        const needed = Math.floor(onlineCount / 2) + 1;
        return { success: true, needed, onlineCount };
    }

    /**
     * 处理投票
     */
    public handleVote(roomCode: string, type: string, uid: number, vote: "accept" | "reject"): { success: boolean; error?: string } {
        const room = this.rooms.get(roomCode);
        if (!room) return { success: false, error: "房间不存在" };

        const session = room.activeVotes.get(type);
        if (!session) return { success: false, error: "投票不存在" };

        session.votes.set(uid, vote);
        if (vote === "accept") {
            session.requests.add(uid);
        } else {
            session.requests.delete(uid);
        }

        room.lastActivity = Date.now();
        return { success: true };
    }

    /**
     * 清除投票
     */
    public clearVote(roomCode: string, type: string): void {
        const room = this.rooms.get(roomCode);
        if (room) {
            room.activeVotes.delete(type);
        }
    }

    /**
     * 计算指定类型的投票结果
     */
    public calculateVoteResult(roomCode: string, type: string): VoteResult | null {
        const room = this.rooms.get(roomCode);
        if (!room) return null;

        const session = room.activeVotes.get(type);
        if (!session) return null;

        const initiator = session.initiator;
        const otherPlayers = room.players.filter(p => p.uid !== initiator);

        const totalVoted = session.votes.size;
        const hasInitiatorInVotes = session.votes.has(initiator);
        const otherVotedCount = hasInitiatorInVotes ? totalVoted - 1 : totalVoted;

        const otherAcceptCount = Array.from(session.requests).filter(uid => uid !== initiator).length;
        // 发起者默认算1票同意
        const accept = 1 + otherAcceptCount;

        const otherRejectCount = otherVotedCount - otherAcceptCount;
        const timeoutCount = otherPlayers.length - otherVotedCount;
        const reject = otherRejectCount + timeoutCount;

        const voteStatus: Array<{ uid: number; username: string; status: "accept" | "reject" | "timeout" }> = otherPlayers.map(player => {
            const v = session.votes.get(player.uid);
            return {
                uid: player.uid,
                username: player.username,
                status: (v === "accept" || v === "reject") ? v : "timeout"
            };
        });

        return {
            accept,
            reject,
            otherAcceptCount,
            otherRejectCount,
            timeoutCount,
            voteStatus
        };
    }

    /**
     * 检查投票是否通过
     */
    public isVotePassed(roomCode: string, type: string): boolean {
        const session = this.rooms.get(roomCode)?.activeVotes.get(type);
        if (!session) return false;

        const needed = Math.floor(session.voteOnlineCount / 2) + 1;
        const result = this.calculateVoteResult(roomCode, type);
        if (!result) return false;

        return result.accept >= needed;
    }

    // ==================== 抽象生命周期 ====================

    /**
     * 游戏开始前准备
     */
    public abstract startGame(roomCode: string): Promise<{ success: boolean; error?: string }>;

    /**
     * 单一玩家输入、交互事件处理
     */
    public abstract handlePlayerAction(roomCode: string, uid: number, actionName: string, payload: any): Promise<any>;
}
