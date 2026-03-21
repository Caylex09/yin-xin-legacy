import { PoemSnakeGameManager } from "./PoemSnakeGameManager";
import { BaseRoom, BasePlayer } from "../common/types";
import { checkPoem, VERDICT, VERDICT_TEXT } from "./gamePoemSnake";

export class PoemSnakePublicManager extends PoemSnakeGameManager {
    public readonly PUBLIC_ROOM_ID = "public";

    constructor() {
        super();
        this.initPublicRoom();
    }

    private async initPublicRoom() {
        if (!this.rooms.has(this.PUBLIC_ROOM_ID)) {
            const publicRoom: BaseRoom<any> = {
                id: this.PUBLIC_ROOM_ID,
                hostId: 0,
                players: [], // We don't strictly manage players for public
                status: "playing",
                currentRound: 1,
                maxRounds: Infinity, // 永远运行
                playerScores: new Map(),
                state: this.getInitialGameState(),
                activeVotes: new Map(),
                createdAt: Date.now(),
                lastActivity: Date.now(),
                allJoinedUsers: new Set(),
                onlineUsers: new Set(),
                autoStart: false
            };
            this.rooms.set(this.PUBLIC_ROOM_ID, publicRoom);
            await this.fetchNextPoem(this.PUBLIC_ROOM_ID);
        }
    }

    public getPublicScreenRoom() {
        return this.getRoom(this.PUBLIC_ROOM_ID);
    }

    public async submitPublicAnswer(uid: number, username: string, answer: string, scoreReward: number) {
        const room = this.getRoom(this.PUBLIC_ROOM_ID);
        if (!room) throw new Error("公屏未初始化");

        const poem = room.state.poems[room.currentRound - 1];
        if (!poem || !poem.content) throw new Error("公屏诗词加载中");
        const result = await checkPoem(answer, poem.content, room.state.currentPos);
        room.lastActivity = Date.now();

        if (result.verdict === VERDICT.CORRECT) {
            const currentScore = room.playerScores.get(uid) || 0;
            room.playerScores.set(uid, currentScore + scoreReward);

            room.state.currentPos++;
            const { PUNCTUATION } = require("../gameApi");
            while (room.state.currentPos < poem.content.length && PUNCTUATION.includes(poem.content[room.state.currentPos])) {
                room.state.currentPos++;
            }

            if (room.state.currentPos >= poem.content.length) {
                room.currentRound++;
                await this.fetchNextPoem(this.PUBLIC_ROOM_ID);
                room.state.currentPos = room.state.poems[room.currentRound - 1].pos;
            }
        }

        const submission = {
            id: `public_${Date.now()}_${uid}`,
            userId: uid,
            username: username,
            answer: result.data[2] || answer,
            isCorrect: result.verdict === VERDICT.CORRECT,
            verdictText: VERDICT_TEXT[result.verdict],
            submittedAt: new Date().toISOString(),
            data: { author: result.data[1] || "", poemTitle: result.data[0] || "" }
        };
        room.state.submissions.push(submission);
        if (room.state.submissions.length > 50) {
            room.state.submissions.shift(); // Keep only last 50 submissions to prevent memory leak
        }

        return {
            verdict: result.verdict,
            correct: result.verdict === VERDICT.CORRECT,
            data: result.data,
            submission,
            roomState: { currentPos: room.state.currentPos, currentRound: room.currentRound }
        };
    }
}

export const publicRoomManager = new PoemSnakePublicManager();
