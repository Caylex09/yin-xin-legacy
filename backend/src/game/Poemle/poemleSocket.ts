import { Server, Socket } from "socket.io";
import { getDb } from "../../db";
import { assertTokenFresh } from "../../middleware";
import { verifyToken } from "../../auth";
import { poemleGameManager } from "./PoemleGameManager";
import { PUNCTUATION } from "./gamePoemle";

// Tracks who is currently active in the Poemle namespace
export const poemleOnlineUsers = new Map<number, { username: string; last: number }>();
export const poemleUserRoomStatus = new Map<number, string | null>(); // uid -> roomCode

export function setupPoemleSocket(io: Server, globalOnlineUsers: Map<number, any>) {
    const namespace = io.of("/game/poemle");

    namespace.use((socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace("Bearer ", "");
            if (!token) return next(new Error("Authentication error"));

            const payload = verifyToken(token) as { sub: number; tokenVersion?: number };
            assertTokenFresh(payload.sub, payload.tokenVersion);

            (socket as any).uid = payload.sub;
            next();
        } catch (e) {
            console.error("Socket auth error:", e);
            next(new Error("Authentication error"));
        }
    });

    namespace.on("connection", (socket) => {
        const uid = (socket as any).uid as number;

        // Fetch user info for username/avatar
        const db = getDb();
        const user = db.prepare("SELECT username, avatar FROM users WHERE uid = ?").get(uid) as any;
        if (!user) return socket.disconnect();

        poemleOnlineUsers.set(uid, { username: user.username, last: Date.now() });

        // Resume previous room if available
        const existingRoomCode = poemleUserRoomStatus.get(uid);
        if (existingRoomCode) {
            const room = poemleGameManager.getRoom(existingRoomCode);
            if (room) {
                room.onlineUsers.add(uid);
                socket.join(`poemle_room_${existingRoomCode}`);
                socket.emit("room_redirect", { roomCode: existingRoomCode });
            } else {
                poemleUserRoomStatus.set(uid, null);
            }
        } else {
            poemleUserRoomStatus.set(uid, null);
        }

        socket.emit("online_count", { count: poemleOnlineUsers.size });
        namespace.emit("online_count", { count: poemleOnlineUsers.size });
        socket.emit("matchmaking_status", { count: poemleGameManager.getMatchmakingQueueSize() });

        // === Matchmaking ===
        socket.on("matchmaking_join", () => {
            poemleGameManager.joinMatchmaking(uid);
            const players = poemleGameManager.tryMatch(2);

            if (players) {
                const p1 = db.prepare("SELECT username, avatar FROM users WHERE uid = ?").get(players[0]) as any;
                const roomCode = poemleGameManager.createRoom(
                    players[0], p1.username, p1.avatar || "", 1, true, '自由'
                );
                const p2 = db.prepare("SELECT username, avatar FROM users WHERE uid = ?").get(players[1]) as any;
                poemleGameManager.joinRoom(roomCode, players[1], p2.username, p2.avatar || "");

                namespace.to(`user_${players[0]}`).emit("matchmaking_matched", { roomCode });
                namespace.to(`user_${players[1]}`).emit("matchmaking_matched", { roomCode });

                poemleUserRoomStatus.set(players[0], roomCode);
                poemleUserRoomStatus.set(players[1], roomCode);
                namespace.emit("matchmaking_status", { count: poemleGameManager.getMatchmakingQueueSize() });
            } else {
                namespace.emit("matchmaking_status", { count: poemleGameManager.getMatchmakingQueueSize() });
            }
        });

        socket.on("matchmaking_leave", () => {
            poemleGameManager.leaveMatchmaking(uid);
            namespace.emit("matchmaking_status", { count: poemleGameManager.getMatchmakingQueueSize() });
        });

        // === Room Creation / Join ===
        socket.on("room_create", (data) => {
            const { maxRounds, mode } = data || { maxRounds: 1, mode: '自由' };
            const roomCode = poemleGameManager.createRoom(uid, user.username, user.avatar || "", maxRounds, false, mode);
            poemleUserRoomStatus.set(uid, roomCode);
            socket.emit("room_created", { roomCode });
        });

        socket.on("room_join", (data) => {
            const { roomCode } = data;
            const res = poemleGameManager.joinRoom(roomCode, uid, user.username, user.avatar || "");
            if (!res.success) {
                return socket.emit("room_error", { message: res.error });
            }

            socket.join(`poemle_room_${roomCode}`);
            poemleUserRoomStatus.set(uid, roomCode);

            socket.emit("your_id", { uid });

            const room = poemleGameManager.getRoom(roomCode)!;
            room.onlineUsers.add(uid);

            const PUNCTUATION = new Set(["，", "。", "！", "？", "、", "；", "：", "”", "“", "（", "）", "《", "》", "〈", "〉", "—", "...", "·", "’", "‘"]);
            const pRoundStates = room.status === "playing" ? room.state.playerRoundStates : {};

            namespace.to(`poemle_room_${roomCode}`).emit("room_joined", {
                roomCode,
                players: room.players.map(p => ({
                    ...p,
                    score: room.status === "playing" ? poemleGameManager.calculateRealTimeScore(p.uid, room) : (room.playerScores.get(p.uid) || 0),
                    guesses: pRoundStates[p.uid]?.guesses || []
                })),
                hostId: room.hostId,
                status: room.status,
                maxRounds: room.maxRounds,
                currentRound: room.currentRound,
                mode: room.mode,
                autoStart: room.autoStart,
                question: room.state.currentQuestion ? {
                    id: room.state.currentQuestion.id,
                    title: room.state.currentQuestion.title,
                    author: room.state.currentQuestion.author,
                    lineLength: Array.from(room.state.currentQuestion.line).filter((c: any) => !PUNCTUATION.has(c)).length
                } : null
            });

            // Auto-start for matchmaking rooms
            if (room.autoStart && room.players.length === 2 && room.status === "waiting" && !(room as any).countdownTimer) {
                let countdown = 5;
                namespace.to(`poemle_room_${roomCode}`).emit("room_countdown_start", { roomCode, countdown });

                const countdownInterval = setInterval(async () => {
                    countdown--;
                    if (countdown > 0) {
                        namespace.to(`poemle_room_${roomCode}`).emit("room_countdown_update", { roomCode, countdown });
                    } else {
                        clearInterval(countdownInterval);
                        delete (room as any).countdownTimer;
                        const startRes = await poemleGameManager.startGame(roomCode);
                        if (startRes.success) {
                            namespace.to(`poemle_room_${roomCode}`).emit("room_game_started", {
                                currentRound: room.currentRound,
                                maxRounds: room.maxRounds,
                                players: room.players.map(p => ({ ...p, score: room.status === "playing" ? poemleGameManager.calculateRealTimeScore(p.uid, room) : (room.playerScores.get(p.uid) || 0) })),
                                question: room.state.currentQuestion ? {
                                    id: room.state.currentQuestion.id,
                                    title: room.state.currentQuestion.title,
                                    author: room.state.currentQuestion.author,
                                    lineLength: Array.from(room.state.currentQuestion.line).filter((c: any) => !PUNCTUATION.has(c)).length
                                } : null
                            });
                        }
                    }
                }, 1000);
                (room as any).countdownTimer = countdownInterval;
            }
        });

        socket.on("room_start", async (data) => {
            const { roomCode } = data || {};
            if (!roomCode) return socket.emit("room_error", { message: "Invalid request" });
            const room = poemleGameManager.getRoom(roomCode);
            if (!room) return socket.emit("room_error", { message: "Room not found" });
            if (room.hostId !== uid) return socket.emit("room_error", { message: "Not host" });
            if (room.status !== "waiting") return socket.emit("room_error", { message: "Game already started" });

            if (!(room as any).countdownTimer) {
                let countdown = 5;
                namespace.to(`poemle_room_${roomCode}`).emit("room_countdown_start", { roomCode, countdown });

                const countdownInterval = setInterval(async () => {
                    countdown--;
                    if (countdown > 0) {
                        namespace.to(`poemle_room_${roomCode}`).emit("room_countdown_update", { roomCode, countdown });
                    } else {
                        clearInterval(countdownInterval);
                        delete (room as any).countdownTimer;
                        const startRes = await poemleGameManager.startGame(roomCode);
                        if (startRes.success) {
                            namespace.to(`poemle_room_${roomCode}`).emit("room_game_started", {
                                currentRound: room.currentRound,
                                maxRounds: room.maxRounds,
                                players: room.players.map(p => ({ ...p, score: room.status === 'playing' ? poemleGameManager.calculateRealTimeScore(p.uid, room) : (room.playerScores.get(p.uid) || 0) })),
                                question: room.state.currentQuestion ? {
                                    id: room.state.currentQuestion.id,
                                    title: room.state.currentQuestion.title,
                                    author: room.state.currentQuestion.author,
                                    lineLength: Array.from(room.state.currentQuestion.line).filter((c: any) => !PUNCTUATION.has(c)).length
                                } : null
                            });
                        } else {
                            namespace.to(`poemle_room_${roomCode}`).emit("room_error", { message: startRes.error });
                        }
                    }
                }, 1000);
                (room as any).countdownTimer = countdownInterval;
            }
        });

        socket.on("room_submit_guess", async (data) => {
            const { roomCode, guess, structure } = data;
            const res = await poemleGameManager.handlePlayerAction(roomCode, uid, "submit_guess", { guess, structure });

            if (!res.success) {
                return socket.emit("room_error", { message: res.error });
            }

            if (res.isFirstBlood) {
                const db = getDb();
                try {
                    const room = poemleGameManager.getRoom(roomCode);
                    if (room && room.autoStart) db.prepare("UPDATE users SET score = score + 20 WHERE uid = ?").run(uid);
                    namespace.to(`poemle_room_${roomCode}`).emit("room_chat_message", {
                        type: "chat",
                        message: {
                            id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                            userId: "system",
                            username: "系统",
                            message: (room && room.autoStart) ? `恭喜 ${user.username} 斩获首杀，获得积分 +20！` : `恭喜 ${user.username} 斩获首杀！`,
                            timestamp: Date.now()
                        }
                    });
                } catch (e) {
                    console.error("Failed to update first blood score:", e);
                }
            } else if (res.isAllGreen) {
                const db = getDb();
                try {
                    const room = poemleGameManager.getRoom(roomCode);
                    if (room && room.autoStart) db.prepare("UPDATE users SET score = score + 10 WHERE uid = ?").run(uid);
                    namespace.to(`poemle_room_${roomCode}`).emit("room_chat_message", {
                        type: "chat",
                        message: {
                            id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                            userId: "system",
                            username: "系统",
                            message: (room && room.autoStart) ? `恭喜 ${user.username} 完成答题，获得积分 +10！` : `恭喜 ${user.username} 完成答题！`,
                            timestamp: Date.now()
                        }
                    });
                } catch (e) {
                    console.error("Failed to update finish score:", e);
                }
            }

            socket.emit("submission_result", {
                guess,
                judgeResult: res.judgeResult,
                isAllGreen: res.isAllGreen,
                currentScore: res.currentScore
            });

            // Update sender's score
            socket.emit("room_player_progress", {
                uid,
                score: res.currentScore,
                finished: res.isAllGreen
            });

            // Broadcast progress and masked grid to opponents
            const maskedJudgeResult = res.judgeResult.map((cell: any) => ({
                char: '',
                verdict: res.isAllGreen ? 'green' : (cell.char === '' ? 'gray' : cell.verdict)
            }));
            socket.broadcast.to(`poemle_room_${roomCode}`).emit("room_player_progress", {
                uid,
                score: res.currentScore,
                finished: res.isAllGreen,
                judgeResult: maskedJudgeResult
            });

            if (res.allFinished) {
                await handleRoundEnd(roomCode);
            }
        });

        socket.on("room_abandon", async (data) => {
            const { roomCode } = data;
            const res = await poemleGameManager.handlePlayerAction(roomCode, uid, "abandon", {});
            if (res.success) {
                socket.emit("abandon_result", { success: true });
                namespace.to(`poemle_room_${roomCode}`).emit("room_player_progress", { uid, abandoned: true, score: 0 });
                if (res.allFinished) {
                    await handleRoundEnd(roomCode);
                }
            }
        });

        socket.on("room_leave", async (data) => {
            const { roomCode } = data;
            const room = poemleGameManager.getRoom(roomCode);
            if (!room) return;

            if (room.status === "playing") {
                const pState = room.state.playerRoundStates[uid];
                if (pState && !pState.finished && !pState.abandoned) {
                    const res = await poemleGameManager.handlePlayerAction(roomCode, uid, "abandon", {});
                    if (res.success) {
                        namespace.to(`poemle_room_${roomCode}`).emit("room_player_progress", { uid, abandoned: true, score: 0 });
                        if (res.allFinished) {
                            await handleRoundEnd(roomCode);
                        }
                    }
                }
            }
            if (room) room.onlineUsers.delete(uid);
            poemleUserRoomStatus.delete(uid);
            socket.leave(`poemle_room_${roomCode}`);
        });

        // Chat and other requests
        socket.on("room_chat_message", (data) => {
            const { roomCode, message } = data;
            if (!roomCode || !message) return;
            namespace.to(`poemle_room_${roomCode}`).emit("room_chat_message", {
                type: "chat",
                message: {
                    id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                    userId: String(uid),
                    username: user.username,
                    message: message,
                    timestamp: Date.now()
                }
            });
        });

        socket.on("room_skip_request", (data) => {
            const { roomCode } = data;
            if (!roomCode) return;

            const room = poemleGameManager.getRoom(roomCode);
            if (room) {
                const pState = room.state.playerRoundStates[uid];
                if (pState && pState.finished) {
                    socket.emit("room_error", { message: "您已完成猜词，只能观战和发言" });
                    return;
                }

                const hasFinished = Object.values(room.state.playerRoundStates).some((state: any) => state.finished);
                if (hasFinished) {
                    socket.emit("room_error", { message: "已有玩家猜出答案，无法换题" });
                    return;
                }
            }

            const voteRes = poemleGameManager.initiateVote(roomCode, "skip", uid);
            if (!voteRes.success) {
                socket.emit("room_error", { message: voteRes.error || "发起换题失败" });
                return;
            }

            namespace.to(`poemle_room_${roomCode}`).emit("room_skip_requested", { uid, username: user.username });
            checkAndExecuteSkip(roomCode);
        });

        socket.on("room_end_request", async (data) => {
            const { roomCode } = data;
            if (!roomCode) return;
            const room = poemleGameManager.getRoom(roomCode);
            if (!room) return;

            const pState = room.state.playerRoundStates[uid];

            if (pState && pState.finished) {
                socket.emit("room_error", { message: "您已完成猜词，只能观战和发言" });
                return;
            }

            const hasFinished = Object.values(room.state.playerRoundStates).some((state: any) => state.finished);

            if (hasFinished) {
                // Anyone has finished -> I haven't finished -> directly settle without vote.
                const res = await poemleGameManager.handlePlayerAction(roomCode, uid, "abandon", {});
                if (res.success) {
                    socket.emit("abandon_result", { success: true });
                    namespace.to(`poemle_room_${roomCode}`).emit("room_player_progress", { uid, abandoned: true, score: 0 });

                    namespace.to(`poemle_room_${roomCode}`).emit("room_chat_message", {
                        type: "chat",
                        message: {
                            userId: "system",
                            username: "系统",
                            message: `${user.username} 选择了提前结算，放弃本局。`,
                            timestamp: Date.now()
                        }
                    });

                    if (res.allFinished) {
                        await handleRoundEnd(roomCode);
                    }
                }
                return;
            }

            // Normal vote logic
            const voteRes = poemleGameManager.initiateVote(roomCode, "end", uid);
            if (!voteRes.success) {
                socket.emit("room_error", { message: voteRes.error || "发起提前结算失败" });
                return;
            }

            namespace.to(`poemle_room_${roomCode}`).emit("room_draw_requested", { uid, username: user.username });
            checkAndExecuteEnd(roomCode);
        });

        socket.on("room_skip_vote", (data) => {
            const { roomCode, agree, vote } = data;
            const isAccept = vote === 'accept' || agree === true;
            if (roomCode) {
                const room = poemleGameManager.getRoom(roomCode);
                if (room && room.state.playerRoundStates[uid]?.finished) {
                    socket.emit("room_error", { message: "您已完成猜词，只能观战和发言" });
                    return;
                }
                poemleGameManager.handleVote(roomCode, "skip", uid, isAccept ? "accept" : "reject");
                if (!isAccept) {
                    poemleGameManager.clearVote(roomCode, "skip");
                    namespace.to(`poemle_room_${roomCode}`).emit("room_skip_rejected", { uid });
                    namespace.to(`poemle_room_${roomCode}`).emit("room_chat_message", {
                        type: "chat",
                        message: { userId: "system", username: "系统", message: "换题投票已被拒绝", timestamp: Date.now() }
                    });
                } else {
                    checkAndExecuteSkip(roomCode);
                }
            }
        });

        socket.on("room_end_vote", (data) => {
            const { roomCode, agree, vote } = data;
            const isAccept = vote === 'accept' || agree === true;
            if (roomCode) {
                const room = poemleGameManager.getRoom(roomCode);
                if (room && room.state.playerRoundStates[uid]?.finished) {
                    socket.emit("room_error", { message: "您已完成猜词，只能观战和发言" });
                    return;
                }
                poemleGameManager.handleVote(roomCode, "end", uid, isAccept ? "accept" : "reject");
                if (!isAccept) {
                    poemleGameManager.clearVote(roomCode, "end");
                    namespace.to(`poemle_room_${roomCode}`).emit("room_draw_rejected", { uid });
                    namespace.to(`poemle_room_${roomCode}`).emit("room_chat_message", {
                        type: "chat",
                        message: { userId: "system", username: "系统", message: "提前结算请求已被拒绝", timestamp: Date.now() }
                    });
                } else {
                    checkAndExecuteEnd(roomCode);
                }
            }
        });

        async function checkAndExecuteSkip(roomCode: string) {
            if (poemleGameManager.isVotePassed(roomCode, "skip")) {
                poemleGameManager.clearVote(roomCode, "skip");

                const room = poemleGameManager.getRoom(roomCode);
                if (room) {
                    const hasFinished = Object.values(room.state.playerRoundStates).some((state: any) => state.finished);
                    if (hasFinished) {
                        namespace.to(`poemle_room_${roomCode}`).emit("room_skip_rejected", {});
                        namespace.to(`poemle_room_${roomCode}`).emit("room_chat_message", {
                            type: "chat",
                            message: {
                                userId: "system",
                                username: "系统",
                                message: "换题取消：已有玩家猜出答案",
                                timestamp: Date.now()
                            }
                        });
                        return;
                    }
                }

                namespace.to(`poemle_room_${roomCode}`).emit("room_chat_message", {
                    type: "chat",
                    message: {
                        userId: "system",
                        username: "系统",
                        message: "换题投票通过，正在换题...",
                        timestamp: Date.now()
                    }
                });

                try {
                    const skipResult = await poemleGameManager.skipQuestion(roomCode);
                    if (skipResult && skipResult.success) {
                        const room = poemleGameManager.getRoom(roomCode);
                        if (room) {
                            namespace.to(`poemle_room_${roomCode}`).emit("room_question_update", {
                                currentRound: room.currentRound,
                                question: skipResult.question ? {
                                    id: skipResult.question.id,
                                    title: skipResult.question.title,
                                    author: skipResult.question.author,
                                    lineLength: Array.from(skipResult.question.line).filter((c: any) => !PUNCTUATION.has(c)).length
                                } : null
                            });
                            namespace.to(`poemle_room_${roomCode}`).emit("room_chat_message", {
                                type: "chat",
                                message: {
                                    userId: "system",
                                    username: "系统",
                                    message: "换题成功，新回合已开始！",
                                    timestamp: Date.now()
                                }
                            });
                        }
                    } else {
                        namespace.to(`poemle_room_${roomCode}`).emit("room_chat_message", {
                            type: "chat",
                            message: {
                                userId: "system",
                                username: "系统",
                                message: "换题失败",
                                timestamp: Date.now()
                            }
                        });
                    }
                } catch (e: any) {
                    namespace.to(`poemle_room_${roomCode}`).emit("room_chat_message", {
                        type: "chat",
                        message: {
                            userId: "system",
                            username: "系统",
                            message: "换题出错",
                            timestamp: Date.now()
                        }
                    });
                }
            }
        }

        async function checkAndExecuteEnd(roomCode: string) {
            if (poemleGameManager.isVotePassed(roomCode, "end")) {
                poemleGameManager.clearVote(roomCode, "end");
                const room = poemleGameManager.getRoom(roomCode);

                if (room) {
                    const hasFinished = Object.values(room.state.playerRoundStates).some((state: any) => state.finished);
                    if (hasFinished) {
                        namespace.to(`poemle_room_${roomCode}`).emit("room_draw_rejected", {});
                        namespace.to(`poemle_room_${roomCode}`).emit("room_chat_message", {
                            type: "chat",
                            message: { userId: "system", username: "系统", message: "提前结算已被取消：已有玩家猜出答案", timestamp: Date.now() }
                        });
                        return;
                    }
                }

                namespace.to(`poemle_room_${roomCode}`).emit("room_chat_message", {
                    type: "chat",
                    message: {
                        userId: "system",
                        username: "系统",
                        message: "提前结算投票通过，本回合直接结束。",
                        timestamp: Date.now()
                    }
                });
                if (room) {
                    for (const uidStr of Object.keys(room.state.playerRoundStates)) {
                        const numUid = parseInt(uidStr);
                        const pState = room.state.playerRoundStates[numUid];
                        if (pState && !pState.finished) {
                            pState.abandoned = true;
                            pState.roundScore = 0;
                            namespace.to(`poemle_room_${roomCode}`).emit("room_player_progress", { uid: numUid, abandoned: true, score: 0 });
                        }
                    }
                    await handleRoundEnd(roomCode);
                }
            }
        }

        // Heartbeat check (client sends room_sync_request)
        socket.on("room_sync_request", (data) => {
            const { roomCode } = data;
            const room = poemleGameManager.getRoom(roomCode);
            if (room && room.status === "playing") {
                const scores: Record<number, number> = {};
                for (const player of room.players) {
                    scores[player.uid] = poemleGameManager.calculateRealTimeScore(player.uid, room);
                }
                socket.emit("room_sync", { scores });
            }
        });

        async function handleRoundEnd(roomCode: string) {
            const room = poemleGameManager.getRoom(roomCode);
            if (!room) return;

            let maxScore = -1;
            let winners: number[] = [];
            for (const uidStr of Object.keys(room.state.playerRoundStates)) {
                const numUid = parseInt(uidStr);
                const pState = room.state.playerRoundStates[numUid];
                const score = pState.finished ? Math.max(0, pState.roundScore) : 0;

                const prev = room.playerScores.get(numUid) || 0;
                room.playerScores.set(numUid, prev + score);

                if (score > maxScore) {
                    maxScore = score;
                    winners = [numUid];
                } else if (score === maxScore && score > 0) {
                    winners.push(numUid);
                }
            }

            if (maxScore > 0 && winners.length > 0) {
                if (room.autoStart) {
                    const db = getDb();
                    for (const winnerUid of winners) {
                        try {
                            db.prepare("UPDATE users SET score = score + 10 WHERE uid = ?").run(winnerUid);
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }
                const winnerNames = winners.map(u => poemleOnlineUsers.get(u)?.username || `User ${u}`).join("、");
                namespace.to(`poemle_room_${roomCode}`).emit("room_chat_message", {
                    type: "chat",
                    message: {
                        id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                        userId: "system",
                        username: "系统",
                        message: room.autoStart ? `本局结束！${winnerNames} 最终得分最高，赢得对局，获得积分 +10！` : `本局结束！${winnerNames} 最终得分最高，赢得对局！`,
                        timestamp: Date.now()
                    }
                });
            }

            // Expose answer
            namespace.to(`poemle_room_${roomCode}`).emit("room_round_end", {
                answer: room.state.currentQuestion?.line,
                scores: Object.fromEntries(room.playerScores.entries())
            });

            setTimeout(async () => {
                const nextRes = await poemleGameManager.nextRound(roomCode);
                if (nextRes.finished) {
                    namespace.to(`poemle_room_${roomCode}`).emit("room_game_finished", {
                        results: Array.from(room.playerScores.entries()).map(([k, v]) => ({ uid: k, score: v }))
                    });
                    // Here update DB for score history if needed...
                    poemleGameManager.removeRoom(roomCode);
                } else if (nextRes.success) {
                    namespace.to(`poemle_room_${roomCode}`).emit("room_question_update", {
                        currentRound: room.currentRound,
                        question: nextRes.question ? {
                            id: nextRes.question.id,
                            title: nextRes.question.title,
                            author: nextRes.question.author,
                            lineLength: Array.from(nextRes.question.line).filter((c: any) => !PUNCTUATION.has(c)).length
                        } : null
                    });
                }
            }, 5000); // 5 sec between rounds
        }

        socket.join(`user_${uid}`);

        socket.on("disconnect", () => {
            const currentRoomCode = poemleUserRoomStatus.get(uid);
            if (currentRoomCode) {
                const room = poemleGameManager.getRoom(currentRoomCode);
                if (room) room.onlineUsers.delete(uid);
            }
            poemleOnlineUsers.delete(uid);
            poemleGameManager.leaveMatchmaking(uid);
            namespace.emit("online_count", { count: poemleOnlineUsers.size });
            namespace.emit("matchmaking_status", { count: poemleGameManager.getMatchmakingQueueSize() });
        });
    });
}
