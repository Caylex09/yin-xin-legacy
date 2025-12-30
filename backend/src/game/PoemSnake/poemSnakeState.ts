// PoemSnake 游戏状态管理
import { Server } from "socket.io";
import { newGame } from "./gamePoemSnake";
import * as matchmaking from "./gamePoemSnakeMatchMaking";
import { setupPoemSnakeSocket } from "./poemSnakeSocket";
import { onlineUsers, startOnlineUserCleanup } from "../../onlineApi";

// 游戏内在线用户（只统计连接到游戏Socket的用户）
export const gameOnlineUsers = new Map<number, { username?: string; last: number }>();
// 用户在房间中的状态：uid -> roomCode（null 表示在公屏）
export const userRoomStatus = new Map<number, string | null>();
// 跳过投票超时计时器
export const skipVoteTimers = new Map<string, NodeJS.Timeout>();
// 结束房间投票超时计时器
export const endVoteTimers = new Map<string, NodeJS.Timeout>();
const ONLINE_TTL = 5 * 60 * 1000;

// 计算公屏在线人数（排除所有在房间中的用户）
export function getPublicScreenOnlineCount(): number {
  let count = 0;
  for (const [uid] of gameOnlineUsers.entries()) {
    const roomCode = userRoomStatus.get(uid);
    if (roomCode === null || roomCode === undefined) {
      // 用户在公屏（不在任何房间）
      count++;
    }
  }
  return count;
}

// 清理过期用户
setInterval(() => {
  const now = Date.now();
  for (const [uid, info] of gameOnlineUsers.entries()) {
    if (now - info.last > ONLINE_TTL) gameOnlineUsers.delete(uid);
  }
}, 60 * 1000);

// 初始化 PoemSnake 游戏
export async function initializePoemSnake(io: Server) {
  // 启动在线用户清理
  startOnlineUserCleanup();

  // WebSocket连接处理
  setupPoemSnakeSocket(io, onlineUsers);

  // 初始化游戏
  await newGame();
  console.log("游戏初始化完成");

  // 启动房间清理定时器（必须在 io 初始化后）
  matchmaking.startRoomCleanup(io);
}

