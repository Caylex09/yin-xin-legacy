// PoemSnake 游戏相关的 WebSocket 事件处理
import { Server } from "socket.io";
import { getDb } from "../../db";
import { verifyToken } from "../../auth";
import { assertTokenFresh } from "../../middleware";
import { newTurn, getPublicScreenPoem, checkPoem, VERDICT, VERDICT_TEXT } from "./gamePoemSnake";
import * as matchmaking from "./gamePoemSnakeMatchMaking";
import { gameOnlineUsers, userRoomStatus, skipVoteTimers, endVoteTimers, getPublicScreenOnlineCount } from "./poemSnakeState";

// ==================== 投票系统公共函数 ====================

// 播报投票结果（统一处理）
function broadcastVoteResult(
  io: Server,
  room: ReturnType<typeof matchmaking.getRoom>,
  voteResult: {
    state: "applied" | "failed";
    accept?: number;
    reject?: number;
    needed?: number;
    voteStatus?: Array<{ uid: number; username: string; status: "accept" | "reject" | "timeout" }>;
  },
  voteType: "skip" | "end"
) {
  if (!room) return;

  const needed = voteResult.needed ?? 0;
  const accept = voteResult.accept ?? 0;
  const reject = voteResult.reject ?? 0;
  const passed = voteResult.state === "applied";

  // 构建投票状态摘要（只播报一次）
  const statusParts: string[] = [];
  if (voteResult.voteStatus) {
    for (const status of voteResult.voteStatus) {
      if (status.status === "accept") {
        statusParts.push(`${status.username} 同意${voteType === "skip" ? "跳过" : "结束房间"}`);
      } else if (status.status === "reject") {
        statusParts.push(`${status.username} 拒绝${voteType === "skip" ? "跳过" : "结束房间"}`);
      } else {
        statusParts.push(`${status.username} 未做出选择，默认拒绝`);
      }
    }
  }

  // 构建最终结果消息
  const resultMsg = passed
    ? `${voteType === "skip" ? "跳过" : "结束房间"}投票通过 (${accept}/${needed})`
    : `${voteType === "skip" ? "跳过" : "结束房间"}投票未通过 (${accept}/${needed})，拒绝 ${reject} 人`;

  // 如果有多人投票，先播报每个人的状态，再播报结果
  if (statusParts.length > 0) {
    const statusMsg = statusParts.join("；");
    for (const player of room.players) {
      io.to(`user_${player.uid}`).emit("room_chat_message", {
        type: "system",
        message: {
          id: `${voteType}_vote_summary_${Date.now()}`,
          userId: "system",
          username: "系统",
          message: statusMsg,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  // 播报最终结果
  for (const player of room.players) {
    io.to(`user_${player.uid}`).emit("room_chat_message", {
      type: "system",
      message: {
        id: `${voteType}_vote_result_${Date.now()}`,
        userId: "system",
        username: "系统",
        message: resultMsg,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

// 处理游戏结束逻辑（统一处理）
function handleGameFinish(
  io: Server,
  db: ReturnType<typeof getDb>,
  roomCode: string,
  room: ReturnType<typeof matchmaking.getRoom>
) {
  if (!room) return;

  const finishResult = matchmaking.finishGame(roomCode);
  if (!finishResult) return;

  const allJoinedUsers = Array.from(room.allJoinedUsers || []);
  for (const joinedUid of allJoinedUsers) {
    const userResult = finishResult.players.find((p) => p.uid === joinedUid);
    if (userResult) {
      io.to(`user_${joinedUid}`).emit("room_game_finished", {
        results: finishResult.players,
      });
      io.to(`user_${joinedUid}`).emit("score_update", { score: userResult.newTotalScore });
    } else {
      const userInfo = db.prepare("SELECT username FROM users WHERE uid = ?").get(joinedUid) as { username: string } | undefined;
      if (userInfo) {
        const scoreSummary = finishResult.players.map((p) => `${p.username}: 游戏得分 ${p.score}，${p.bonusScore > 0 ? `奖励 ${p.bonusScore}` : '无奖励'}，总积分 ${p.newTotalScore}`).join("；");
        io.to(`user_${joinedUid}`).emit("room_chat_message", {
          type: "system",
          message: {
            id: `room_finished_${Date.now()}_${roomCode}`,
            userId: "system",
            username: "系统",
            message: `房间 ${roomCode} 游戏结束。${scoreSummary}`,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }
  }

  matchmaking.destroyRoom(roomCode);
  for (const player of room.players) {
    io.to(`user_${player.uid}`).emit("room_destroyed", {
      roomCode,
      reason: "游戏结束",
    });
  }
}

// 设置 PoemSnake WebSocket 事件处理器
export function setupPoemSnakeSocket(
  io: Server,
  onlineUsers: Map<number, { username?: string; last: number }>
) {
  // WebSocket 认证中间件
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return next(new Error("缺少token"));
    }
    try {
      const payload = verifyToken(token) as { sub: number; tokenVersion?: number };
      assertTokenFresh(payload.sub, payload.tokenVersion);
      (socket as any).uid = payload.sub;
      next();
    } catch (e) {
      next(new Error("认证失败"));
    }
  });

  // WebSocket 连接处理
  io.on("connection", async (socket) => {
    const uid = (socket as any).uid;
    const db = getDb();
    const user = db.prepare("SELECT username, is_game_admin, score FROM users WHERE uid = ?").get(uid) as { username: string; is_game_admin: number; score: number } | undefined;
    if (!user) {
      socket.disconnect();
      return;
    }

    // 更新在线用户（全局）
    onlineUsers.set(uid, { username: user.username, last: Date.now() });
    // 更新游戏内在线用户
    gameOnlineUsers.set(uid, { username: user.username, last: Date.now() });
    // 初始状态：用户在公屏
    userRoomStatus.set(uid, null);
    io.emit("online_count", { count: getPublicScreenOnlineCount() });

    // 发送初始游戏状态
    const poem = getPublicScreenPoem();
    socket.emit("game_state", {
      type: "game_state",
      gameState: {
        currentPoem: poem.content,
        highlightedChar: poem.content[poem.pos] || "",
        author: poem.author,
        authorName: poem.author,
        poemTitle: poem.origin,
        round: 1,
        isActive: true,
      },
    });

    // 处理聊天消息（只在公屏时发送）
    socket.on("chat_message", (data: { message: string }) => {
      if (!data.message || !data.message.trim()) return;
      const userRoom = userRoomStatus.get(uid);
      // 如果用户在房间中，不处理公屏聊天
      if (userRoom !== null && userRoom !== undefined) {
        return;
      }

      onlineUsers.set(uid, { username: user.username, last: Date.now() });
      gameOnlineUsers.set(uid, { username: user.username, last: Date.now() });
      // 确保用户标记为在公屏
      userRoomStatus.set(uid, null);

      io.emit("chat_message", {
        type: "chat_message",
        message: {
          id: Date.now().toString(),
          userId: uid.toString(),
          username: user.username,
          message: data.message.trim(),
          timestamp: new Date().toISOString(),
        },
      });
      io.emit("online_count", { count: getPublicScreenOnlineCount() });
    });

    // 处理提交答案
    socket.on("submit_answer", async (data: { answer: string }) => {
      if (!data.answer || !data.answer.trim()) return;

      // 如果用户在房间中，不处理公屏提交答案
      const userRoom = userRoomStatus.get(uid);
      if (userRoom !== null && userRoom !== undefined) {
        return;
      }

      onlineUsers.set(uid, { username: user.username, last: Date.now() });
      gameOnlineUsers.set(uid, { username: user.username, last: Date.now() });

      const result = await checkPoem(data.answer.trim());
      const now = new Date().toISOString();
      const onlineCount = getPublicScreenOnlineCount();

      // 保存提交记录
      db.prepare(
        "INSERT INTO poem_snake_submissions (username, content, author, origin, verdict, verdictCN, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(
        user.username,
        result.data[2] || data.answer.trim(),
        result.data[1] || "",
        result.data[0] || "",
        result.verdict,
        VERDICT_TEXT[result.verdict],
        now
      );

      // 发送提交结果
      socket.emit("submission_result", {
        type: "submission_result",
        isCorrect: result.verdict === VERDICT.CORRECT,
        verdict: result.verdict,
        verdictText: VERDICT_TEXT[result.verdict],
        score: result.verdict === VERDICT.CORRECT ? onlineCount : 0,
      });

      // 如果回答正确，更新积分并进入下一轮
      if (result.verdict === VERDICT.CORRECT) {
        db.prepare("UPDATE users SET score = score + ? WHERE uid = ?").run(onlineCount, uid);
        await newTurn();

        // 获取用户头像
        const userWithAvatar = db.prepare("SELECT avatar FROM users WHERE uid = ?").get(uid) as { avatar: string } | undefined;
        const avatar = userWithAvatar?.avatar || "";

        // 广播正确答案
        io.emit("game_state_update", {
          type: "correct_answer",
          username: user.username,
          avatar: avatar,
          answer: result.data[2],
          author: result.data[1],
          poemTitle: result.data[0],
        });
      }

      // 广播新的游戏状态
      const poem = getPublicScreenPoem();
      io.emit("game_state_update", {
        type: "poem_update",
        gameState: {
          currentPoem: poem.content,
          highlightedChar: poem.content[poem.pos] || "",
          author: poem.author,
          authorName: poem.author,
          poemTitle: poem.origin,
          round: 1,
          isActive: true,
        },
      });

      // 广播提交历史更新
      io.emit("submissions_update");
      io.emit("online_count", { count: getPublicScreenOnlineCount() });
    });

    // 处理跳过请求
    socket.on("skip_turn", async () => {
      onlineUsers.set(uid, { username: user.username, last: Date.now() });
      gameOnlineUsers.set(uid, { username: user.username, last: Date.now() });

      // 获取最新的用户信息（包括积分和游戏管理员状态）
      const currentUser = db.prepare("SELECT is_game_admin, score FROM users WHERE uid = ?").get(uid) as { is_game_admin: number; score: number } | undefined;
      if (!currentUser) {
        // 发送系统消息到聊天框
        socket.emit("chat_message", {
          type: "chat_message",
          message: {
            id: Date.now().toString(),
            userId: "system",
            username: "系统",
            message: "用户不存在",
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      const isGameAdmin = currentUser.is_game_admin === 1;
      const userScore = currentUser.score || 0;
      const SKIP_COST = 1;

      // 检查权限和积分
      if (!isGameAdmin && userScore < SKIP_COST) {
        // 发送系统消息到聊天框
        socket.emit("chat_message", {
          type: "chat_message",
          message: {
            id: Date.now().toString(),
            userId: "system",
            username: "系统",
            message: `积分不足，跳过需要 ${SKIP_COST} 积分，当前积分：${userScore}`,
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      // 扣除积分（如果不是游戏管理员）
      if (!isGameAdmin) {
        db.prepare("UPDATE users SET score = score - ? WHERE uid = ?").run(SKIP_COST, uid);
      }

      // 广播被谁跳过（公屏提示）
      io.emit("game_state_update", {
        type: "skip_turn",
        username: user.username,
      });

      // 执行跳过，进入下一轮
      await newTurn();

      // 发送跳过成功结果
      socket.emit("skip_result", {
        success: true,
        cost: isGameAdmin ? 0 : SKIP_COST,
        remainingScore: isGameAdmin ? userScore : userScore - SKIP_COST,
      });

      // 刷新个人统计
      const updatedUser = db.prepare("SELECT score FROM users WHERE uid = ?").get(uid) as { score: number } | undefined;
      if (updatedUser) {
        socket.emit("score_update", { score: updatedUser.score });
      }

      // 广播新的游戏状态
      const poem = getPublicScreenPoem();
      io.emit("game_state_update", {
        type: "poem_update",
        gameState: {
          currentPoem: poem.content,
          highlightedChar: poem.content[poem.pos] || "",
          author: poem.author,
          authorName: poem.author,
          poemTitle: poem.origin,
          round: 1,
          isActive: true,
        },
      });

      io.emit("online_count", { count: getPublicScreenOnlineCount() });
    });

    // 匹配和房间相关事件
    // 1v1匹配：加入匹配队列
    socket.on("matchmaking_join", () => {
      const existingRoomCode = matchmaking.findUserActiveRoom(uid);
      if (existingRoomCode) {
        socket.emit("room_error", { error: "你有未销毁的房间，已为你返回原房间", existingRoomCode });
        socket.emit("room_redirect", { roomCode: existingRoomCode });
        return;
      }

      matchmaking.joinMatchmaking(uid);
      // 尝试匹配
      const matchResult = matchmaking.tryMatch();
      if (matchResult.matched && matchResult.roomCode) {
        const roomCode = matchResult.roomCode;
        // 匹配成功，通知两个玩家
        const room = matchmaking.getRoom(roomCode);
        if (room) {
          // 两个玩家都标记为在房间中，公屏人数减少
          for (const player of room.players) {
            userRoomStatus.set(player.uid, roomCode);
          }
          io.emit("online_count", { count: getPublicScreenOnlineCount() });

          const roomPlayersData = room.players.map((p) => ({ uid: p.uid, username: p.username, avatar: p.avatar }));
          for (const player of room.players) {
            io.to(`user_${player.uid}`).emit("matchmaking_matched", {
              roomCode,
              players: roomPlayersData,
              hostId: room.hostId,
            });
          }

          // 匹配成功后立即开始倒计时（不管玩家是否在房间页面），一旦有2人或以上就启动
          if (room.autoStart && room.status === "waiting" && room.players.length >= 2 && !(room as any).countdownTimer) {

            let countdown = 5;
            // 通知所有玩家开始倒计时
            for (const player of room.players) {
              io.to(`user_${player.uid}`).emit("room_countdown_start", {
                roomCode,
                countdown,
              });
            }

            // 每秒发送倒计时更新
            const countdownInterval = setInterval(() => {
              countdown--;
              const currentRoom = matchmaking.getRoom(roomCode);
              // 如果房间不存在或游戏已开始，停止倒计时（不退的人自己负责，人数少也继续倒计时）
              if (!currentRoom || currentRoom.status !== "waiting") {
                clearInterval(countdownInterval);
                if (currentRoom) {
                  delete (currentRoom as any).countdownTimer;
                }
                return;
              }

              if (countdown > 0) {
                // 通知所有玩家（包括不在房间页面的，即使有人离开也继续通知剩余玩家）
                for (const player of currentRoom.players) {
                  io.to(`user_${player.uid}`).emit("room_countdown_update", {
                    roomCode: matchResult.roomCode,
                    countdown,
                  });
                }
              } else {
                // 倒计时结束，开始游戏（即使有人离开，只要房间还有玩家且状态为waiting，就开始游戏）
                clearInterval(countdownInterval);
                delete (currentRoom as any).countdownTimer;

                // 如果房间还有玩家，就开始游戏
                if (currentRoom.players.length > 0) {
                  matchmaking.startGame(roomCode).then((result) => {
                    if (result.success) {
                      const gameRoom = matchmaking.getRoom(roomCode);
                      if (gameRoom) {
                        const question = matchmaking.getCurrentQuestion(roomCode);
                        if (question) {
                          for (const player of gameRoom.players) {
                            io.to(`user_${player.uid}`).emit("room_game_started", {
                              roomCode,
                              question,
                              players: gameRoom.players.map((p) => ({ uid: p.uid, username: p.username, avatar: p.avatar })),
                            });
                          }
                        }
                      }
                    } else {
                      // 游戏开始失败，通知玩家
                      const errorRoom = matchmaking.getRoom(roomCode);
                      if (errorRoom) {
                        for (const player of errorRoom.players) {
                          io.to(`user_${player.uid}`).emit("room_error", { error: result.error || "游戏开始失败" });
                        }
                      }
                    }
                  }).catch((error) => {
                    console.error("开始游戏失败:", error);
                    const errorRoom = matchmaking.getRoom(roomCode);
                    if (errorRoom) {
                      for (const player of errorRoom.players) {
                        io.to(`user_${player.uid}`).emit("room_error", { error: "游戏开始失败" });
                      }
                    }
                  });
                }
              }
            }, 1000);

            (room as any).countdownTimer = countdownInterval;
          }
        }
      } else {
        // 还在队列中，发送队列状态
        const queueSize = matchmaking.getMatchmakingQueueSize();
        socket.emit("matchmaking_status", { inQueue: true, queueSize });
        // 广播队列人数更新给所有在队列中的玩家
        io.emit("matchmaking_queue_update", { queueSize });
      }
    });

    // 离开匹配队列
    socket.on("matchmaking_leave", () => {
      matchmaking.leaveMatchmaking(uid);
      socket.emit("matchmaking_status", { inQueue: false });
      // 广播队列人数更新
      const queueSize = matchmaking.getMatchmakingQueueSize();
      io.emit("matchmaking_queue_update", { queueSize });
    });

    // 获取匹配队列人数
    socket.on("matchmaking_get_queue_size", () => {
      const queueSize = matchmaking.getMatchmakingQueueSize();
      socket.emit("matchmaking_queue_update", { queueSize });
    });

    // 创建房间
    socket.on("room_create", async (data?: { maxRounds?: number }) => {
      const existingRoomCode = matchmaking.findUserActiveRoom(uid);
      if (existingRoomCode) {
        socket.emit("room_error", { error: "你有未销毁的房间，已为你返回原房间", existingRoomCode });
        socket.emit("room_redirect", { roomCode: existingRoomCode });
        return;
      }

      const userWithAvatar = db.prepare("SELECT username, avatar FROM users WHERE uid = ?").get(uid) as { username: string; avatar: string } | undefined;
      if (!userWithAvatar) {
        socket.emit("room_error", { error: "用户不存在" });
        return;
      }
      const roomCode = matchmaking.createRoom(uid, userWithAvatar.username, userWithAvatar.avatar, data?.maxRounds, false);
      const room = matchmaking.getRoom(roomCode);
      // 创建房间后，标记用户在该房间
      userRoomStatus.set(uid, roomCode);
      io.emit("online_count", { count: getPublicScreenOnlineCount() });

      socket.emit("room_created", {
        roomCode,
        players: [{ uid, username: userWithAvatar.username, avatar: userWithAvatar.avatar }],
        hostId: room?.hostId,
      });
    });

    // 房间内聊天（仅房间玩家）
    socket.on("room_chat_message", (data: { roomCode: string; message: string }) => {
      if (!data.message || !data.message.trim()) return;
      const room = matchmaking.getRoom(data.roomCode);
      if (!room) return;
      if (!room.players.some((p) => p.uid === uid)) return;

      const msg = {
        id: Date.now().toString(),
        userId: uid.toString(),
        username: user.username,
        message: data.message.trim(),
        timestamp: new Date().toISOString(),
      };

      for (const player of room.players) {
        io.to(`user_${player.uid}`).emit("room_chat_message", {
          type: "chat_message",
          message: msg,
        });
      }
    });

    // 加入房间
    socket.on("room_join", (data: { roomCode: string }) => {
      const existingRoomCode = matchmaking.findUserActiveRoom(uid);
      if (existingRoomCode && existingRoomCode !== data.roomCode) {
        socket.emit("room_error", { error: "你有未销毁的房间，已为你返回原房间", existingRoomCode });
        socket.emit("room_redirect", { roomCode: existingRoomCode });
        return;
      }

      const userWithAvatar = db.prepare("SELECT username, avatar FROM users WHERE uid = ?").get(uid) as { username: string; avatar: string } | undefined;
      if (!userWithAvatar) {
        socket.emit("room_error", { error: "用户不存在" });
        return;
      }
      const result = matchmaking.joinRoom(data.roomCode, uid, userWithAvatar.username, userWithAvatar.avatar);
      if (!result.success) {
        socket.emit("room_error", { error: result.error || "加入房间失败" });
        return;
      }

      const room = matchmaking.getRoom(data.roomCode);
      if (room) {
        if (room) {
          // 用户加入房间，从公屏移除（标记为在房间中）
          userRoomStatus.set(uid, data.roomCode);
          // 添加到房间在线用户
          room.onlineUsers.add(uid);
          const roomPlayersData = room.players.map((p) => ({ uid: p.uid, username: p.username, avatar: p.avatar }));

          // 更新公屏在线人数（排除房间中的用户）
          io.emit("online_count", { count: getPublicScreenOnlineCount() });

          // 如果游戏已开始，发送当前游戏状态
          if (room.status === "playing") {
            const question = matchmaking.getCurrentQuestion(data.roomCode);
            const scores = Array.from(room.playerScores.entries()).map(([puid, score]) => ({
              uid: puid,
              score,
            }));

            socket.emit("room_joined", {
              roomCode: data.roomCode,
              players: roomPlayersData,
              hostId: room.hostId,
              gameStarted: true,
              question,
              scores,
              currentRound: room.currentRound,
              publicOnline: getPublicScreenOnlineCount(),
              roomOnline: room.onlineUsers.size,
              maxRounds: room.maxRounds,
              autoStart: room.autoStart,
            });
          } else {
            // 游戏未开始，只发送房间信息
            socket.emit("room_joined", {
              roomCode: data.roomCode,
              players: roomPlayersData,
              hostId: room.hostId,
              gameStarted: false,
              publicOnline: getPublicScreenOnlineCount(),
              roomOnline: room.onlineUsers.size,
              maxRounds: room.maxRounds,
              autoStart: room.autoStart,
            });
          }

          // 然后通知房间内其他玩家
          for (const player of room.players) {
            if (player.uid !== uid) {
              io.to(`user_${player.uid}`).emit("room_joined", {
                roomCode: data.roomCode,
                players: roomPlayersData,
                hostId: room.hostId,
                maxRounds: room.maxRounds,
                autoStart: room.autoStart,
              });
              // 发送系统消息：有人加入
              const nowTs = Date.now();
              const dedupeKey = `join_${data.roomCode}_${uid}_${player.uid}`;
              const last = (global as any).__joinDedupe?.get?.(dedupeKey);
              if (!(global as any).__joinDedupe) {
                (global as any).__joinDedupe = new Map<string, number>();
              }
              const cache = (global as any).__joinDedupe as Map<string, number>;
              // collapse duplicate join messages within 500ms for the same recipient
              if (!last || nowTs - last > 500) {
                cache.set(dedupeKey, nowTs);
                io.to(`user_${player.uid}`).emit("room_chat_message", {
                  type: "system",
                  message: {
                    id: `join_${data.roomCode}_${uid}_${nowTs}`,
                    userId: "system",
                    username: "系统",
                    message: `${userWithAvatar.username} 加入了房间`,
                    timestamp: new Date().toISOString(),
                  },
                });
              }
              // 更新玩家列表和在线人数
              io.to(`user_${player.uid}`).emit("room_players_update", {
                roomCode: data.roomCode,
                players: roomPlayersData,
                onlineUids: Array.from(room.onlineUsers),
              });
              io.to(`user_${player.uid}`).emit("room_online_update", {
                roomCode: data.roomCode,
                publicOnline: getPublicScreenOnlineCount(),
                roomOnline: room.onlineUsers.size,
              });
            }
          }

          // 向加入的玩家发送系统消息（如果有其他玩家）
          if (room.players.length > 1) {
            socket.emit("room_chat_message", {
              type: "system",
              message: {
                id: `join_self_${Date.now()}`,
                userId: "system",
                username: "系统",
                message: `你加入了房间，当前有 ${room.players.length} 人在房间中`,
                timestamp: new Date().toISOString(),
              },
            });
          }

          // 如果房间有2个或更多玩家且游戏还没开始，启动倒计时（如果没有已存在的倒计时）
          if (room.autoStart && room.players.length >= 2 && room.status === "waiting" && !(room as any).countdownTimer) {
            let countdown = 5;
            // 通知所有玩家开始倒计时
            for (const player of room.players) {
              io.to(`user_${player.uid}`).emit("room_countdown_start", {
                roomCode: data.roomCode,
                countdown,
              });
            }

            // 每秒发送倒计时更新
            const countdownInterval = setInterval(() => {
              countdown--;
              const currentRoom = matchmaking.getRoom(data.roomCode);
              // 如果房间不存在或游戏已开始，停止倒计时（不退的人自己负责，人数少也继续倒计时）
              if (!currentRoom || currentRoom.status !== "waiting") {
                clearInterval(countdownInterval);
                if (currentRoom) {
                  delete (currentRoom as any).countdownTimer;
                }
                return;
              }

              // 如果房间空了，停止倒计时
              if (currentRoom.players.length === 0) {
                clearInterval(countdownInterval);
                delete (currentRoom as any).countdownTimer;
                return;
              }

              if (countdown > 0) {
                // 通知所有玩家（即使有人离开也继续通知剩余玩家）
                for (const player of currentRoom.players) {
                  io.to(`user_${player.uid}`).emit("room_countdown_update", {
                    roomCode: data.roomCode,
                    countdown,
                  });
                }
              } else {
                // 倒计时结束，开始游戏（即使有人离开，只要房间还有玩家且状态为waiting，就开始游戏）
                clearInterval(countdownInterval);
                delete (currentRoom as any).countdownTimer;

                // 如果房间还有玩家，就开始游戏
                if (currentRoom.players.length > 0) {
                  console.log(`[room] Countdown finished, starting game for room ${data.roomCode}`);
                  matchmaking.startGame(data.roomCode).then((result) => {
                    console.log(`[room] startGame result for ${data.roomCode}:`, result);
                    if (result.success) {
                      const question = matchmaking.getCurrentQuestion(data.roomCode);
                      const finalRoom = matchmaking.getRoom(data.roomCode);
                      console.log(`[room] Got question and room:`, { hasQuestion: !!question, hasRoom: !!finalRoom });
                      if (finalRoom && question) {
                        for (const player of finalRoom.players) {
                          console.log(`[room] Sending room_game_started to player ${player.uid}`);
                          io.to(`user_${player.uid}`).emit("room_game_started", {
                            roomCode: data.roomCode,
                            question,
                            players: finalRoom.players.map((p) => ({ uid: p.uid, username: p.username, avatar: p.avatar })),
                          });
                        }
                      } else {
                        console.error("[room] Failed to get question or room after startGame", { roomCode: data.roomCode, question, finalRoom });
                        // 如果失败，通知玩家
                        const errorRoom = matchmaking.getRoom(data.roomCode);
                        if (errorRoom) {
                          for (const player of errorRoom.players) {
                            io.to(`user_${player.uid}`).emit("room_error", { error: "游戏开始失败，请重试" });
                          }
                        }
                      }
                    } else {
                      console.error("[room] startGame failed", result.error);
                      // 如果失败，通知玩家
                      const errorRoom = matchmaking.getRoom(data.roomCode);
                      if (errorRoom) {
                        for (const player of errorRoom.players) {
                          io.to(`user_${player.uid}`).emit("room_error", { error: result.error || "游戏开始失败" });
                        }
                      }
                    }
                  }).catch((err) => {
                    console.error("[room] startGame exception", err);
                    const errorRoom = matchmaking.getRoom(data.roomCode);
                    if (errorRoom) {
                      for (const player of errorRoom.players) {
                        io.to(`user_${player.uid}`).emit("room_error", { error: "游戏开始失败：" + (err as Error).message });
                      }
                    }
                  });
                }
              }
            }, 1000);

            (room as any).countdownTimer = countdownInterval;
          }
        }
      } else {
        socket.emit("room_error", { error: result.error });
      }
    });

    // 开始游戏（自建房 5 秒倒计时）
    socket.on("room_start", async (data: { roomCode: string }) => {
      const room = matchmaking.getRoom(data.roomCode);
      if (!room || room.hostId !== uid) {
        socket.emit("room_error", { error: "只有房主可以开始游戏" });
        return;
      }
      // 自建房倒计时 5 秒
      if (!room.autoStart && room.status === "waiting" && !(room as any).countdownTimer) {
        let countdown = 5;
        for (const player of room.players) {
          io.to(`user_${player.uid}`).emit("room_countdown_start", { roomCode: data.roomCode, countdown });
        }
        const countdownInterval = setInterval(async () => {
          countdown--;
          const currentRoom = matchmaking.getRoom(data.roomCode);
          if (!currentRoom || currentRoom.status !== "waiting") {
            clearInterval(countdownInterval);
            if (currentRoom) delete (currentRoom as any).countdownTimer;
            return;
          }
          if (countdown > 0) {
            for (const player of currentRoom.players) {
              io.to(`user_${player.uid}`).emit("room_countdown_update", { roomCode: data.roomCode, countdown });
            }
          } else {
            clearInterval(countdownInterval);
            if (currentRoom) delete (currentRoom as any).countdownTimer;
            const result = await matchmaking.startGame(data.roomCode);
            if (result.success) {
              const question = matchmaking.getCurrentQuestion(data.roomCode);
              const startedRoom = matchmaking.getRoom(data.roomCode);
              if (startedRoom && question) {
                for (const player of startedRoom.players) {
                  io.to(`user_${player.uid}`).emit("room_game_started", {
                    roomCode: data.roomCode,
                    question,
                    players: startedRoom.players.map((p) => ({ uid: p.uid, username: p.username, avatar: p.avatar })),
                    maxRounds: startedRoom.maxRounds,
                    autoStart: startedRoom.autoStart,
                  });
                }
              }
            } else {
              socket.emit("room_error", { error: result.error });
            }
          }
        }, 1000);
        (room as any).countdownTimer = countdownInterval;
        return;
      }

      const result = await matchmaking.startGame(data.roomCode);
      if (result.success) {
        const question = matchmaking.getCurrentQuestion(data.roomCode);
        const startedRoom = matchmaking.getRoom(data.roomCode);
        if (startedRoom && question) {
          // 通知房间内所有玩家游戏开始
          for (const player of startedRoom.players) {
            io.to(`user_${player.uid}`).emit("room_game_started", {
              roomCode: data.roomCode,
              question,
              players: startedRoom.players.map((p) => ({ uid: p.uid, username: p.username, avatar: p.avatar })),
              maxRounds: startedRoom.maxRounds,
              autoStart: startedRoom.autoStart,
            });
          }
        }
      } else {
        socket.emit("room_error", { error: result.error });
      }
    });

    // 提交答案（1v1模式）
    socket.on("room_submit_answer", async (data: { roomCode: string; answer: string }) => {
      try {
        const result = await matchmaking.submitAnswer(data.roomCode, uid, data.answer);
        const room = matchmaking.getRoom(data.roomCode);
        if (!room) {
          socket.emit("room_error", { error: "房间不存在" });
          return;
        }

        const user = db.prepare("SELECT username, avatar FROM users WHERE uid = ?").get(uid) as { username: string; avatar: string } | undefined;
        if (!user) {
          socket.emit("room_error", { error: "用户不存在" });
          return;
        }

        // 发送提交结果给提交者
        socket.emit("room_answer_result", {
          correct: result.correct,
          verdict: result.verdict,
          data: result.data,
          currentScore: room.playerScores.get(uid) || 0,
        });

        // 通知房间内所有玩家提交历史更新
        for (const player of room.players) {
          io.to(`user_${player.uid}`).emit("room_submissions_update");
        }

        // 如果回答正确，通知所有玩家
        if (result.correct) {
          // 重新获取房间状态（因为 submitAnswer 可能已经更新了 currentRound）
          const updatedRoom = matchmaking.getRoom(data.roomCode);
          if (!updatedRoom) {
            socket.emit("room_error", { error: "房间不存在" });
            return;
          }

          for (const player of updatedRoom.players) {
            io.to(`user_${player.uid}`).emit("room_correct_answer", {
              uid,
              username: user.username,
              avatar: user.avatar,
              answer: result.data[2],
              author: result.data[1],
              poemTitle: result.data[0],
              scores: Array.from(updatedRoom.playerScores.entries()).map(([puid, score]) => ({
                uid: puid,
                score,
              })),
            });
          }

          // 检查是否游戏结束（currentRound 可能已经在 submitAnswer 中增加了）
          if (updatedRoom.currentRound > updatedRoom.maxRounds) {
            // 游戏结束，结算分数
            const finishResult = matchmaking.finishGame(data.roomCode);
            if (finishResult) {
              // 通知所有曾经加入的用户（包括已离开的）
              const allJoinedUsers = Array.from(updatedRoom.allJoinedUsers || []);
              for (const joinedUid of allJoinedUsers) {
                const userResult = finishResult.players.find((p) => p.uid === joinedUid);
                if (userResult) {
                  // 在房间中的玩家，发送完整结果
                  io.to(`user_${joinedUid}`).emit("room_game_finished", {
                    results: finishResult.players,
                  });
                  io.to(`user_${joinedUid}`).emit("score_update", { score: userResult.newTotalScore });
                } else {
                  // 已离开的玩家，只发送积分播报
                  const user = db.prepare("SELECT username FROM users WHERE uid = ?").get(joinedUid) as { username: string } | undefined;
                  if (user) {
                    // 构建积分播报消息
                    const scoreSummary = finishResult.players.map((p) => `${p.username}: 游戏得分 ${p.score}，${p.bonusScore > 0 ? `奖励 ${p.bonusScore}` : '无奖励'}，总积分 ${p.newTotalScore}`).join("；");
                    io.to(`user_${joinedUid}`).emit("chat_message", {
                      type: "system",
                      message: {
                        id: `room_finished_${Date.now()}_${data.roomCode}`,
                        userId: "system",
                        username: "系统",
                        message: `房间 ${data.roomCode} 游戏结束。${scoreSummary}`,
                        timestamp: new Date().toISOString(),
                      },
                    });
                  }
                }
              }

              // 游戏结束后立即销毁房间
              matchmaking.destroyRoom(data.roomCode);
              // 通知所有玩家房间已销毁
              for (const player of updatedRoom.players) {
                io.to(`user_${player.uid}`).emit("room_destroyed", {
                  roomCode: data.roomCode,
                  reason: "游戏结束",
                });
              }
            }
          } else {
            // 更新题目显示（可能还在同一题的下一个字符，或者已经进入下一题）
            const question = matchmaking.getCurrentQuestion(data.roomCode);
            if (question) {
              for (const player of updatedRoom.players) {
                io.to(`user_${player.uid}`).emit("room_question_update", {
                  question,
                  scores: Array.from(updatedRoom.playerScores.entries()).map(([puid, score]) => ({
                    uid: puid,
                    score,
                  })),
                });
              }
            }
          }
        }
      } catch (e) {
        socket.emit("room_error", { error: (e as Error).message });
      }
    });

    // 请求跳过（多人投票，10秒 >50%）
    socket.on("room_request_skip", (data: { roomCode: string }) => {
      const user = db.prepare("SELECT username, avatar FROM users WHERE uid = ?").get(uid) as { username: string; avatar: string } | undefined;
      if (!user) {
        socket.emit("room_error", { error: "用户不存在" });
        return;
      }

      const room = matchmaking.getRoom(data.roomCode);
      if (!room) {
        socket.emit("room_error", { error: "房间不存在" });
        return;
      }

      // 在调用 requestSkip 之前保存 initiator（如果已有投票在进行中）
      const existingInitiator = room.skipInitiator;

      const vote = matchmaking.requestSkip(data.roomCode, uid);
      if (!vote.success && vote.error) {
        socket.emit("room_error", { error: vote.error });
        return;
      }

      // 投票进行中（发起投票）
      if (vote.state === "pending") {
        const msg = `${user.username} 发起跳过投票，请在 10 秒内输入 skip 同意跳过或输入 reject 拒绝跳过。`;
        for (const player of room.players) {
          io.to(`user_${player.uid}`).emit("room_chat_message", {
            type: "system",
            message: {
              id: `skip_vote_start_${Date.now()}_${uid}`,
              userId: "system",
              username: "系统",
              message: msg,
              timestamp: new Date().toISOString(),
            },
          });
        }

        // 启动超时结算
        if (!skipVoteTimers.has(data.roomCode)) {
          // 在超时回调之前保存 initiator，因为 resolveSkipVote 会清空投票状态
          const initiator = room.skipInitiator;
          const t = setTimeout(() => {
            const res = matchmaking.resolveSkipVote(data.roomCode);
            skipVoteTimers.delete(data.roomCode);
            const roomFinal = matchmaking.getRoom(data.roomCode);
            if (roomFinal) {
              // 播报投票结果（统一处理）
              broadcastVoteResult(io, roomFinal, res, "skip");

              // 如果投票通过，处理跳过逻辑
              if (res.state === "applied") {
                const initiatorUser = roomFinal.players.find(p => p.uid === initiator);
                for (const player of roomFinal.players) {
                  io.to(`user_${player.uid}`).emit("room_correct_answer", {
                    uid: initiator,
                    username: initiatorUser?.username || "",
                    avatar: initiatorUser?.avatar || "",
                    answer: "",
                    author: "",
                    poemTitle: "",
                    scores: Array.from(roomFinal.playerScores.entries()).map(([puid, score]) => ({
                      uid: puid,
                      score,
                    })),
                    isSkip: true,
                  });
                }

                const updateQuestion = () => {
                  const updatedRoom = matchmaking.getRoom(data.roomCode);
                  if (!updatedRoom) return;
                  const question = matchmaking.getCurrentQuestion(data.roomCode);
                  if (question) {
                    for (const player of updatedRoom.players) {
                      io.to(`user_${player.uid}`).emit("room_question_update", {
                        question,
                        scores: Array.from(updatedRoom.playerScores.entries()).map(([puid, score]) => ({
                          uid: puid,
                          score,
                        })),
                      });
                    }
                  }
                };

                // 根据跳过结果决定下一步
                if (res.skipChar) {
                  setTimeout(updateQuestion, 3000);
                } else if (res.finished) {
                  handleGameFinish(io, db, data.roomCode, roomFinal);
                } else {
                  updateQuestion();
                }
              }
            }
          }, 10_000);
          skipVoteTimers.set(data.roomCode, t);
        }
        return;
      }

      // 投票立即完成（所有人已投票或直接通过）
      if (skipVoteTimers.has(data.roomCode)) {
        clearTimeout(skipVoteTimers.get(data.roomCode));
        skipVoteTimers.delete(data.roomCode);
      }

      // 播报投票结果（vote.state 此时应该是 "applied" 或 "failed"）
      broadcastVoteResult(io, room, vote as { state: "applied" | "failed"; accept?: number; reject?: number; needed?: number; voteStatus?: Array<{ uid: number; username: string; status: "accept" | "reject" | "timeout" }> }, "skip");

      if (vote.state !== "applied") return;

      // 跳过成功（使用 vote.initiator 或 existingInitiator 或 uid）
      const skipInitiator = vote.initiator || existingInitiator || uid;
      const initiatorUser = room.players.find(p => p.uid === skipInitiator);
      for (const player of room.players) {
        io.to(`user_${player.uid}`).emit("room_correct_answer", {
          uid: skipInitiator,
          username: initiatorUser?.username || user.username,
          avatar: initiatorUser?.avatar || user.avatar,
          answer: "",
          author: "",
          poemTitle: "",
          scores: Array.from(room.playerScores.entries()).map(([puid, score]) => ({
            uid: puid,
            score,
          })),
          isSkip: true,
        });
      }

      const updateQuestion = () => {
        const updatedRoom = matchmaking.getRoom(data.roomCode);
        if (!updatedRoom) return;
        const question = matchmaking.getCurrentQuestion(data.roomCode);
        if (question) {
          for (const player of updatedRoom.players) {
            io.to(`user_${player.uid}`).emit("room_question_update", {
              question,
              scores: Array.from(updatedRoom.playerScores.entries()).map(([puid, score]) => ({
                uid: puid,
                score,
              })),
            });
          }
        }
      };

      if (vote.skipChar) {
        setTimeout(updateQuestion, 3000);
      } else if (vote.finished) {
        handleGameFinish(io, db, data.roomCode, room);
      } else {
        updateQuestion();
      }
    });

    // 同意跳过（投票，10秒）
    socket.on("room_accept_skip", (data: { roomCode: string }) => {
      const user = db.prepare("SELECT username FROM users WHERE uid = ?").get(uid) as { username: string } | undefined;
      if (!user) {
        socket.emit("room_error", { error: "用户不存在" });
        return;
      }

      const room = matchmaking.getRoom(data.roomCode);
      if (!room) {
        socket.emit("room_error", { error: "房间不存在" });
        return;
      }

      // 在调用 acceptSkip 之前保存 initiator，因为 resolveSkipVote 会清空投票状态
      const initiator = room.skipInitiator;

      const result = matchmaking.acceptSkip(data.roomCode, uid);
      if (!result.success) {
        socket.emit("room_error", { error: result.error });
        return;
      }

      // 如果投票已完成，在 request 时已经处理，这里只需要处理进行中的情况
      if (result.state === "pending") {
        const msg = `${user.username} 同意跳过`;
        for (const player of room.players) {
          io.to(`user_${player.uid}`).emit("room_chat_message", {
            type: "system",
            message: {
              id: `skip_vote_accept_${Date.now()}_${uid}`,
              userId: "system",
              username: "系统",
              message: msg,
              timestamp: new Date().toISOString(),
            },
          });
        }
        return;
      }

      // 投票已完成，清除超时计时器
      if (skipVoteTimers.has(data.roomCode)) {
        clearTimeout(skipVoteTimers.get(data.roomCode)!);
        skipVoteTimers.delete(data.roomCode);
      }

      // 播报投票结果
      broadcastVoteResult(io, room, result as { state: "applied" | "failed"; accept?: number; reject?: number; needed?: number; voteStatus?: Array<{ uid: number; username: string; status: "accept" | "reject" | "timeout" }> }, "skip");

      // 如果投票通过，处理跳过逻辑
      if (result.state === "applied") {
        const initiatorUser = room.players.find(p => p.uid === initiator);
        for (const player of room.players) {
          io.to(`user_${player.uid}`).emit("room_correct_answer", {
            uid: initiator,
            username: initiatorUser?.username || "",
            avatar: initiatorUser?.avatar || "",
            answer: "",
            author: "",
            poemTitle: "",
            scores: Array.from(room.playerScores.entries()).map(([puid, score]) => ({
              uid: puid,
              score,
            })),
            isSkip: true,
          });
        }

        const updateQuestion = () => {
          const updatedRoom = matchmaking.getRoom(data.roomCode);
          if (!updatedRoom) return;
          const question = matchmaking.getCurrentQuestion(data.roomCode);
          if (question) {
            for (const player of updatedRoom.players) {
              io.to(`user_${player.uid}`).emit("room_question_update", {
                question,
                scores: Array.from(updatedRoom.playerScores.entries()).map(([puid, score]) => ({
                  uid: puid,
                  score,
                })),
              });
            }
          }
        };

        if (result.skipChar) {
          setTimeout(updateQuestion, 3000);
        } else if (result.finished) {
          handleGameFinish(io, db, data.roomCode, room);
        } else {
          updateQuestion();
        }
      }
    });

    // 拒绝跳过（投票，10秒）
    socket.on("room_reject_skip", (data: { roomCode: string }) => {
      const result = matchmaking.rejectSkip(data.roomCode, uid);
      if (!result.success) {
        socket.emit("room_error", { error: result.error });
        return;
      }

      const room = matchmaking.getRoom(data.roomCode);
      if (!room) {
        socket.emit("room_error", { error: "房间不存在" });
        return;
      }

      const user = db.prepare("SELECT username FROM users WHERE uid = ?").get(uid) as { username: string } | undefined;
      if (!user) {
        socket.emit("room_error", { error: "用户不存在" });
        return;
      }

      // 在调用 rejectSkip 之前保存 initiator，因为 resolveSkipVote 会清空投票状态
      const initiator = room.skipInitiator;

      // 投票进行中
      if (result.state === "pending") {
        const msg = `${user.username} 拒绝跳过`;
        for (const player of room.players) {
          io.to(`user_${player.uid}`).emit("room_chat_message", {
            type: "system",
            message: {
              id: `skip_vote_reject_${Date.now()}_${uid}`,
              userId: "system",
              username: "系统",
              message: msg,
              timestamp: new Date().toISOString(),
            },
          });
        }

        // 检查是否所有人都已投票，如果是则立即结算
        const otherPlayers = room.players.filter(p => p.uid !== initiator);
        const otherVotedCount = Array.from(room.skipVotes?.keys() || []).filter(uid => uid !== initiator).length;
        if (otherVotedCount >= otherPlayers.length) {
          if (skipVoteTimers.has(data.roomCode)) {
            clearTimeout(skipVoteTimers.get(data.roomCode)!);
            skipVoteTimers.delete(data.roomCode);
          }
          const res = matchmaking.resolveSkipVote(data.roomCode, false);
          broadcastVoteResult(io, room, res, "skip");

          if (res.state === "applied") {
            const initiatorUser = room.players.find(p => p.uid === initiator);
            for (const player of room.players) {
              io.to(`user_${player.uid}`).emit("room_correct_answer", {
                uid: initiator,
                username: initiatorUser?.username || "",
                avatar: initiatorUser?.avatar || "",
                answer: "",
                author: "",
                poemTitle: "",
                scores: Array.from(room.playerScores.entries()).map(([puid, score]) => ({
                  uid: puid,
                  score,
                })),
                isSkip: true,
              });
            }

            const updateQuestion = () => {
              const updatedRoom = matchmaking.getRoom(data.roomCode);
              if (!updatedRoom) return;
              const question = matchmaking.getCurrentQuestion(data.roomCode);
              if (question) {
                for (const player of updatedRoom.players) {
                  io.to(`user_${player.uid}`).emit("room_question_update", {
                    question,
                    scores: Array.from(updatedRoom.playerScores.entries()).map(([puid, score]) => ({
                      uid: puid,
                      score,
                    })),
                  });
                }
              }
            };

            if (res.skipChar) {
              setTimeout(updateQuestion, 3000);
            } else if (res.finished) {
              handleGameFinish(io, db, data.roomCode, room);
            } else {
              updateQuestion();
            }
          }
        }
        return;
      }

      // 投票已完成，清除超时计时器
      if (skipVoteTimers.has(data.roomCode)) {
        clearTimeout(skipVoteTimers.get(data.roomCode)!);
        skipVoteTimers.delete(data.roomCode);
      }

      // 播报投票结果
      broadcastVoteResult(io, room, result as { state: "applied" | "failed"; accept?: number; reject?: number; needed?: number; voteStatus?: Array<{ uid: number; username: string; status: "accept" | "reject" | "timeout" }> }, "skip");

      // 如果投票通过，处理跳过逻辑
      if (result.state === "applied") {
        const initiatorUser = room.players.find(p => p.uid === initiator);
        for (const player of room.players) {
          io.to(`user_${player.uid}`).emit("room_correct_answer", {
            uid: initiator,
            username: initiatorUser?.username || "",
            avatar: initiatorUser?.avatar || "",
            answer: "",
            author: "",
            poemTitle: "",
            scores: Array.from(room.playerScores.entries()).map(([puid, score]) => ({
              uid: puid,
              score,
            })),
            isSkip: true,
          });
        }

        const updateQuestion = () => {
          const updatedRoom = matchmaking.getRoom(data.roomCode);
          if (!updatedRoom) return;
          const question = matchmaking.getCurrentQuestion(data.roomCode);
          if (question) {
            for (const player of updatedRoom.players) {
              io.to(`user_${player.uid}`).emit("room_question_update", {
                question,
                scores: Array.from(updatedRoom.playerScores.entries()).map(([puid, score]) => ({
                  uid: puid,
                  score,
                })),
              });
            }
          }
        };

        if (result.skipChar) {
          setTimeout(updateQuestion, 3000);
        } else if (result.finished) {
          handleGameFinish(io, db, data.roomCode, room);
        } else {
          updateQuestion();
        }
      }
    });

    // 离开房间（游戏进行中也可以离开）
    socket.on("room_leave", (data: { roomCode: string }) => {
      const room = matchmaking.getRoom(data.roomCode);
      if (!room) {
        socket.emit("room_error", { error: "房间不存在" });
        return;
      }

      // 允许在游戏进行中离开
      const leavingUser = db.prepare("SELECT username FROM users WHERE uid = ?").get(uid) as { username: string } | undefined;
      matchmaking.leaveRoom(data.roomCode, uid);

      // 用户离开房间，标记为在公屏
      userRoomStatus.set(uid, null);

      const updatedRoom = matchmaking.getRoom(data.roomCode);
      if (updatedRoom) {
        // 从房间在线用户中移除
        updatedRoom.onlineUsers.delete(uid);

        // 更新公屏在线人数
        io.emit("online_count", { count: getPublicScreenOnlineCount() });

        // 通知房间内其他玩家有人离开
        for (const player of updatedRoom.players) {
          io.to(`user_${player.uid}`).emit("room_chat_message", {
            type: "system",
            message: {
              id: `leave_${Date.now()}_${uid}`,
              userId: "system",
              username: "系统",
              message: `${leavingUser?.username || "玩家"} 离开了房间`,
              timestamp: new Date().toISOString(),
            },
          });
          // 更新玩家列表和在线人数
          io.to(`user_${player.uid}`).emit("room_players_update", {
            roomCode: data.roomCode,
            players: updatedRoom.players.map((p) => ({ uid: p.uid, username: p.username, avatar: p.avatar })),
            onlineUids: Array.from(updatedRoom.onlineUsers),
          });
          io.to(`user_${player.uid}`).emit("room_online_update", {
            roomCode: data.roomCode,
            publicOnline: getPublicScreenOnlineCount(),
            roomOnline: updatedRoom.onlineUsers.size,
          });
        }
      }

      socket.emit("room_left", {
        roomCode: data.roomCode,
        playing: updatedRoom?.status === "playing",
        // 等待/倒计时阶段均允许返回：1v1 全员、自建房所有玩家（含房主）
        keepRoom: updatedRoom ? updatedRoom.status === "waiting" : false,
      });
      // 倒计时继续，不取消（即使有人离开）
    });

    // 请求平局（1v1模式）
    socket.on("room_request_draw", (data: { roomCode: string }) => {
      const result = matchmaking.requestDraw(data.roomCode, uid);
      if (!result.success) {
        socket.emit("room_error", { error: result.error });
        return;
      }

      const room = matchmaking.getRoom(data.roomCode);
      if (!room) {
        socket.emit("room_error", { error: "房间不存在" });
        return;
      }

      const user = db.prepare("SELECT username FROM users WHERE uid = ?").get(uid) as { username: string } | undefined;
      if (!user) {
        socket.emit("room_error", { error: "用户不存在" });
        return;
      }

      // 通知所有玩家有平局请求（在聊天框显示）
      for (const player of room.players) {
        io.to(`user_${player.uid}`).emit("room_chat_message", {
          type: "system",
          message: {
            id: `draw_request_${Date.now()}_${player.uid}`,
            userId: "system",
            username: "系统",
            message: `${user.username} 请求平局`,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // 只通知对方显示平局请求提示（UI提示）
      const otherPlayer = room.players.find((p) => p.uid !== uid);
      if (otherPlayer) {
        io.to(`user_${otherPlayer.uid}`).emit("room_draw_requested", {
          uid,
          username: user.username,
        });
      }
    });

    // 同意平局（1v1模式）
    socket.on("room_accept_draw", (data: { roomCode: string }) => {
      try {
        const result = matchmaking.acceptDraw(data.roomCode, uid);
        if (!result.success) {
          socket.emit("room_error", { error: result.error });
          return;
        }

        const room = matchmaking.getRoom(data.roomCode);
        if (!room) {
          socket.emit("room_error", { error: "房间不存在" });
          return;
        }

        // 如果双方都同意，acceptDraw 已经调用了 finishGame
        if (result.finished && result.finishResult) {
          // 使用 acceptDraw 返回的结果，避免重复调用 finishGame
          // 通知所有曾经加入的用户（包括已离开的）
          const allJoinedUsers = Array.from(room.allJoinedUsers || []);
          for (const joinedUid of allJoinedUsers) {
            const userResult = result.finishResult.players.find((p) => p.uid === joinedUid);
            if (userResult) {
              // 在房间中的玩家，发送完整结果
              io.to(`user_${joinedUid}`).emit("room_game_finished", {
                results: result.finishResult.players,
              });
              io.to(`user_${joinedUid}`).emit("score_update", { score: userResult.newTotalScore });
            } else {
              // 已离开的玩家，只发送积分播报
              const user = db.prepare("SELECT username FROM users WHERE uid = ?").get(joinedUid) as { username: string } | undefined;
              if (user) {
                // 构建积分播报消息
                const scoreSummary = result.finishResult.players.map((p) => `${p.username}: 游戏得分 ${p.score}，${p.bonusScore > 0 ? `奖励 ${p.bonusScore}` : '无奖励'}，总积分 ${p.newTotalScore}`).join("；");
                io.to(`user_${joinedUid}`).emit("chat_message", {
                  type: "system",
                  message: {
                    id: `room_finished_${Date.now()}_${data.roomCode}`,
                    userId: "system",
                    username: "系统",
                    message: `房间 ${data.roomCode} 游戏结束（平局）。${scoreSummary}`,
                    timestamp: new Date().toISOString(),
                  },
                });
              }
            }
          }

          // 平局后立即销毁房间
          matchmaking.destroyRoom(data.roomCode);
          // 通知所有玩家房间已销毁
          for (const player of room.players) {
            io.to(`user_${player.uid}`).emit("room_destroyed", {
              roomCode: data.roomCode,
              reason: "平局结束",
            });
          }
        } else {
          // 通知对方已同意
          const otherPlayer = room.players.find((p) => p.uid !== uid);
          if (otherPlayer) {
            io.to(`user_${otherPlayer.uid}`).emit("room_chat_message", {
              type: "system",
              message: {
                id: `draw_accepted_${Date.now()}`,
                userId: "system",
                username: "系统",
                message: `对方已同意平局`,
                timestamp: new Date().toISOString(),
              },
            });
          }
        }
      } catch (error) {
        console.error("同意平局错误:", error);
        socket.emit("room_error", { error: "处理平局请求时出错" });
      }
    });

    // 结束房间（发起投票，>50%）
    socket.on("room_end", (data: { roomCode: string }) => {
      const user = db.prepare("SELECT username FROM users WHERE uid = ?").get(uid) as { username: string } | undefined;
      if (!user) {
        socket.emit("room_error", { error: "用户不存在" });
        return;
      }

      const room = matchmaking.getRoom(data.roomCode);
      if (!room) {
        socket.emit("room_error", { error: "房间不存在" });
        return;
      }

      const vote = matchmaking.requestEnd(data.roomCode, uid);
      if (!vote.success && vote.error) {
        socket.emit("room_error", { error: vote.error });
        return;
      }

      // 如果直接结束（只有1人等特殊情况），处理结束逻辑
      if (vote.state === "applied") {
        // 直接结束的情况
        let finishResult: { players: Array<{ uid: number; username: string; score: number; bonusScore: number; newTotalScore: number }> } | null = null;
        if (room.status === "playing") {
          finishResult = matchmaking.finishGame(data.roomCode);
        }

        if (finishResult) {
          const allJoinedUsers = Array.from(room.allJoinedUsers || []);
          for (const joinedUid of allJoinedUsers) {
            const userResult = finishResult.players.find((p) => p.uid === joinedUid);
            if (userResult) {
              io.to(`user_${joinedUid}`).emit("room_game_finished", {
                results: finishResult.players,
              });
              io.to(`user_${joinedUid}`).emit("score_update", { score: userResult.newTotalScore });
            } else {
              const userInfo = db.prepare("SELECT username FROM users WHERE uid = ?").get(joinedUid) as { username: string } | undefined;
              if (userInfo) {
                const scoreSummary = finishResult.players.map((p) => `${p.username}: 游戏得分 ${p.score}，${p.bonusScore > 0 ? `奖励 ${p.bonusScore}` : '无奖励'}，总积分 ${p.newTotalScore}`).join("；");
                io.to(`user_${joinedUid}`).emit("room_chat_message", {
                  type: "system",
                  message: {
                    id: `room_finished_${Date.now()}_${data.roomCode}`,
                    userId: "system",
                    username: "系统",
                    message: `房间 ${data.roomCode} 游戏结束。${scoreSummary}`,
                    timestamp: new Date().toISOString(),
                  },
                });
              }
            }
          }
        }

        matchmaking.destroyRoom(data.roomCode);
        for (const player of room.players) {
          io.to(`user_${player.uid}`).emit("room_destroyed", {
            roomCode: data.roomCode,
            reason: "房间已结束",
          });
        }
        return;
      }

      // 投票进行中（发起投票）
      if (vote.state === "pending") {
        const msg = `${user.username} 发起结束房间投票，请在 10 秒内投票`;
        for (const player of room.players) {
          io.to(`user_${player.uid}`).emit("room_chat_message", {
            type: "system",
            message: {
              id: `end_vote_start_${Date.now()}_${uid}`,
              userId: "system",
              username: "系统",
              message: msg,
              timestamp: new Date().toISOString(),
            },
          });
          io.to(`user_${player.uid}`).emit("room_end_vote_pending", {
            roomCode: data.roomCode,
            accept: vote.accept,
            reject: vote.reject,
            needed: vote.needed,
            by: user.username,
            expiresIn: 10,
          });
        }

        // 启动超时结算
        if (!endVoteTimers.has(data.roomCode)) {
          // 在超时回调之前保存 initiator，因为 resolveEndVote 会清空投票状态
          const initiator = room.endInitiator;
          const t = setTimeout(() => {
            const res = matchmaking.resolveEndVote(data.roomCode);
            endVoteTimers.delete(data.roomCode);
            const roomFinal = matchmaking.getRoom(data.roomCode);
            if (roomFinal) {
              // 播报投票结果（统一处理）
              broadcastVoteResult(io, roomFinal, res, "end");

              // 如果投票通过，结束房间
              if (res.state === "applied") {
                if (roomFinal.status === "playing") {
                  handleGameFinish(io, db, data.roomCode, roomFinal);
                } else {
                  matchmaking.destroyRoom(data.roomCode);
                  for (const player of roomFinal.players) {
                    io.to(`user_${player.uid}`).emit("room_destroyed", {
                      roomCode: data.roomCode,
                      reason: "房间已结束",
                    });
                  }
                }
              }
            }
          }, 10_000);
          endVoteTimers.set(data.roomCode, t);
        }
        return;
      }
    });

    // 同意结束房间
    socket.on("room_accept_end", (data: { roomCode: string }) => {
      const user = db.prepare("SELECT username FROM users WHERE uid = ?").get(uid) as { username: string } | undefined;
      if (!user) {
        socket.emit("room_error", { error: "用户不存在" });
        return;
      }

      const room = matchmaking.getRoom(data.roomCode);
      if (!room) {
        socket.emit("room_error", { error: "房间不存在" });
        return;
      }

      const vote = matchmaking.acceptEnd(data.roomCode, uid);
      if (!vote.success) {
        socket.emit("room_error", { error: vote.error });
        return;
      }

      // 投票进行中
      if (vote.state === "pending") {
        const msg = `${user.username} 同意结束房间`;
        for (const player of room.players) {
          io.to(`user_${player.uid}`).emit("room_chat_message", {
            type: "system",
            message: {
              id: `end_vote_accept_${Date.now()}_${uid}`,
              userId: "system",
              username: "系统",
              message: msg,
              timestamp: new Date().toISOString(),
            },
          });
        }
        return;
      }

      // 投票已完成，清除超时计时器，结果已在 request 时处理
      if (endVoteTimers.has(data.roomCode)) {
        clearTimeout(endVoteTimers.get(data.roomCode)!);
        endVoteTimers.delete(data.roomCode);
      }

      // 如果投票通过，处理结束逻辑
      if (vote.state === "applied") {
        if (room.status === "playing") {
          handleGameFinish(io, db, data.roomCode, room);
        } else {
          matchmaking.destroyRoom(data.roomCode);
          for (const player of room.players) {
            io.to(`user_${player.uid}`).emit("room_destroyed", {
              roomCode: data.roomCode,
              reason: "房间已结束",
            });
          }
        }
      }
    });

    // 拒绝结束房间（投票，自建房）
    socket.on("room_reject_end", (data: { roomCode: string }) => {
      const user = db.prepare("SELECT username FROM users WHERE uid = ?").get(uid) as { username: string } | undefined;
      if (!user) {
        socket.emit("room_error", { error: "用户不存在" });
        return;
      }

      const room = matchmaking.getRoom(data.roomCode);
      if (!room) {
        socket.emit("room_error", { error: "房间不存在" });
        return;
      }

      const rejectVote = matchmaking.rejectEnd(data.roomCode, uid);
      if (!rejectVote.success && rejectVote.error) {
        socket.emit("room_error", { error: rejectVote.error });
        return;
      }

      // 投票进行中
      if (rejectVote.state === "pending") {
        const msg = `${user.username} 拒绝结束房间`;
        for (const player of room.players) {
          io.to(`user_${player.uid}`).emit("room_chat_message", {
            type: "system",
            message: {
              id: `end_vote_reject_${Date.now()}_${uid}`,
              userId: "system",
              username: "系统",
              message: msg,
              timestamp: new Date().toISOString(),
            },
          });
        }

        // 检查是否所有人都已投票，如果是则立即结算
        const initiator = room.endInitiator;
        const otherPlayers = room.players.filter(p => p.uid !== initiator);
        const otherVotedCount = Array.from(room.endVotes?.keys() || []).filter(uid => uid !== initiator).length;
        if (otherVotedCount >= otherPlayers.length) {
          if (endVoteTimers.has(data.roomCode)) {
            clearTimeout(endVoteTimers.get(data.roomCode)!);
            endVoteTimers.delete(data.roomCode);
          }
          const res = matchmaking.resolveEndVote(data.roomCode, false);
          broadcastVoteResult(io, room, res, "end");

          if (res.state === "applied") {
            if (room.status === "playing") {
              handleGameFinish(io, db, data.roomCode, room);
            } else {
              matchmaking.destroyRoom(data.roomCode);
              for (const player of room.players) {
                io.to(`user_${player.uid}`).emit("room_destroyed", {
                  roomCode: data.roomCode,
                  reason: "房间已结束",
                });
              }
            }
          }
        }
        return;
      }

      // 投票已完成，清除超时计时器
      if (endVoteTimers.has(data.roomCode)) {
        clearTimeout(endVoteTimers.get(data.roomCode)!);
        endVoteTimers.delete(data.roomCode);
      }
    });

    // 拒绝平局（1v1模式）
    socket.on("room_reject_draw", (data: { roomCode: string }) => {
      const result = matchmaking.rejectDraw(data.roomCode, uid);
      if (!result.success) {
        socket.emit("room_error", { error: result.error });
        return;
      }

      const room = matchmaking.getRoom(data.roomCode);
      if (!room) {
        socket.emit("room_error", { error: "房间不存在" });
        return;
      }

      const user = db.prepare("SELECT username FROM users WHERE uid = ?").get(uid) as { username: string } | undefined;
      if (!user) {
        socket.emit("room_error", { error: "用户不存在" });
        return;
      }

      // 找到请求平局的人
      const drawRequester = room.players.find((p) => p.uid !== uid);
      if (drawRequester) {
        // 通知请求平局的人，对方拒绝了（在聊天框显示）
        io.to(`user_${drawRequester.uid}`).emit("room_chat_message", {
          type: "system",
          message: {
            id: `draw_rejected_${Date.now()}`,
            userId: "system",
            username: "系统",
            message: `${user.username} 拒绝平局`,
            timestamp: new Date().toISOString(),
          },
        });
        // 清除平局请求提示
        io.to(`user_${drawRequester.uid}`).emit("room_draw_requested", {
          uid: 0,
          username: "",
        });
      }

      // 通知当前用户（在聊天框显示）
      socket.emit("room_chat_message", {
        type: "system",
        message: {
          id: `draw_rejected_self_${Date.now()}`,
          userId: "system",
          username: "系统",
          message: `你拒绝了平局请求`,
          timestamp: new Date().toISOString(),
        },
      });

      // 通知当前用户清除提示
      socket.emit("room_draw_requested", {
        uid: 0,
        username: "",
      });
    });

    // 将socket加入用户专属房间，方便发送消息
    socket.join(`user_${uid}`);

    socket.on("disconnect", () => {
      onlineUsers.delete(uid);
      gameOnlineUsers.delete(uid);
      userRoomStatus.delete(uid);
      // 只清理匹配队列，不清理房间（用户可能只是切换页面）
      matchmaking.leaveMatchmaking(uid);
      io.emit("online_count", { count: getPublicScreenOnlineCount() });
    });
  });
}

