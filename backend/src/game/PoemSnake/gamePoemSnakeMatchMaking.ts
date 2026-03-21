import { checkPoem } from './gamePoemSnake';
// 匹配和房间系统
import { getDb } from "../../db";
import { getPoem } from "../gameApi";
import { searchPoem, clearMark, VERDICT, VERDICT_TEXT, extractSentence } from "../gameApi";
import crypto from "crypto";

const PUNCTUATION = ["，", "？", "。", "！", "：", "、", "；"];


const matchmakingQueue: number[] = [];

// 房间提交记录
interface RoomSubmission {
  id: string;
  userId: number;
  username: string;
  answer: string;
  author?: string;
  poemTitle?: string;
  isCorrect: boolean;
  verdictText?: string;
  submittedAt: string;
}

// 房间数据结构
interface Room {
  id: string; // 邀请码
  hostId: number; // 房主ID
  players: { uid: number; username: string; avatar: string; score: number }[];
  status: "waiting" | "playing" | "finished";
  currentRound: number;
  maxRounds: number;
  poems: Array<{ content: string; origin: string; author: string; pos: number }>;
  currentPos: number; // 当前题目的字符位置（用于 skip）
  playerScores: Map<number, number>; // 玩家UID -> 得分
  startPlayerCount?: number; // 开始游戏时的人数（用于投票基数）
  skipRequests: Set<number>; // 跳过投票（同意集合）
  skipVotes?: Map<number, "accept" | "reject">; // 跳过投票记录
  skipTimer?: NodeJS.Timeout; // 跳过投票计时器
  skipInitiator?: number; // 跳过投票发起者UID
  skipVoteOnlineCount?: number; // 发起跳过投票时的在线人数
  drawPending?: boolean; // 平局请求中的标记
  drawTimer?: NodeJS.Timeout; // 平局请求超时定时器
  submissions: RoomSubmission[]; // 房间内的提交历史
  createdAt: number; // 房间创建时间戳
  lastActivity: number; // 最后活动时间戳
  drawRequests?: Set<number>; // 平局请求
  endRequests?: Set<number>; // 结束房间请求（投票，同意列表）
  endVotes?: Map<number, "accept" | "reject">; // 结束房间投票记录
  endInitiator?: number; // 发起人UID（默认同意）
  endVoteTimer?: NodeJS.Timeout; // 结束房间计时器
  endVoteOnlineCount?: number; // 发起结束房间投票时的在线人数
  allJoinedUsers: Set<number>; // 所有曾经加入过房间的用户UID（用于结束时通知）
  onlineUsers: Set<number>; // 房间内在线用户UID（包括在公屏的用户）
  autoStart: boolean; // 是否自动开局（匹配房=true，自建房=false）
}

const rooms = new Map<string, Room>();
const MAX_ROOM_PLAYERS = 50;
const SKIP_VOTE_WINDOW = 10_000; // 10秒
const MIN_ROUNDS = 5;
const MAX_ROUNDS = 100;

// 生成6位邀请码
function generateRoomCode(): string {
  return crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 6);
}

// 创建房间
export function createRoom(hostId: number, username: string, avatar: string, maxRounds: number = MIN_ROUNDS, autoStart = true): string {
  const rounds = Math.min(Math.max(maxRounds, MIN_ROUNDS), MAX_ROUNDS);
  const code = generateRoomCode();
  const db = getDb();
  const user = db.prepare("SELECT score FROM users WHERE uid = ?").get(hostId) as { score: number } | undefined;
  const score = user?.score || 0;

  const now = Date.now();
  const room: Room = {
    id: code,
    hostId,
    players: [{ uid: hostId, username, avatar, score }],
    status: "waiting",
    currentRound: 0,
    maxRounds: rounds,
    poems: [],
    currentPos: 0,
    playerScores: new Map([[hostId, 0]]),
    skipRequests: new Set(),
    endRequests: new Set(),
    submissions: [],
    createdAt: now,
    lastActivity: now,
    allJoinedUsers: new Set([hostId]),
    onlineUsers: new Set([hostId]),
    autoStart,
  };

  rooms.set(code, room);
  return code;
}

// 加入房间
export function joinRoom(roomCode: string, uid: number, username: string, avatar: string): { success: boolean; error?: string } {
  const room = rooms.get(roomCode);
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
    if (room.players.length >= MAX_ROOM_PLAYERS) {
      return { success: false, error: "房间已满" };
    }
    // 允许重新加入游戏进行中的房间
    const db = getDb();
    const user = db.prepare("SELECT score FROM users WHERE uid = ?").get(uid) as { score: number } | undefined;
    const score = user?.score || 0;

    // 如果玩家之前在游戏中，恢复他的分数；否则初始化为0
    const previousScore = room.playerScores.get(uid) ?? 0;

    room.players.push({ uid, username, avatar, score });
    room.playerScores.set(uid, previousScore);
    room.allJoinedUsers.add(uid);

    return { success: true };
  }

  // 游戏未开始时，检查房间是否已满
  if (room.players.length >= MAX_ROOM_PLAYERS) {
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

// 获取匹配队列大小
export function getMatchmakingQueueSize(): number {
  return matchmakingQueue.length;
}

// 加入匹配队列
export function joinMatchmaking(uid: number): void {
  if (!matchmakingQueue.includes(uid)) {
    matchmakingQueue.push(uid);
  }
}

// 离开匹配队列
export function leaveMatchmaking(uid: number): void {
  const index = matchmakingQueue.indexOf(uid);
  if (index > -1) {
    matchmakingQueue.splice(index, 1);
  }
}

// 尝试匹配
export function tryMatch(): { matched: boolean; roomCode?: string; players?: Array<{ uid: number; username: string }> } {
  if (matchmakingQueue.length >= 2) {
    const player1 = matchmakingQueue.shift()!;
    const player2 = matchmakingQueue.shift()!;

    // 创建房间
    const db = getDb();
    const user1 = db.prepare("SELECT username, avatar FROM users WHERE uid = ?").get(player1) as { username: string; avatar: string } | undefined;
    const user2 = db.prepare("SELECT username, avatar FROM users WHERE uid = ?").get(player2) as { username: string; avatar: string } | undefined;

    if (!user1 || !user2) {
      return { matched: false };
    }

    const code = createRoom(player1, user1.username, user1.avatar);
    const joinResult = joinRoom(code, player2, user2.username, user2.avatar);

    if (joinResult.success) {
      return { matched: true, roomCode: code, players: [{ uid: player1, username: user1.username }, { uid: player2, username: user2.username }] };
    }
  }
  return { matched: false };
}

// 开始游戏（生成5首诗）
export async function startGame(roomCode: string): Promise<{ success: boolean; error?: string }> {
  const room = rooms.get(roomCode);
  if (!room) {
    return { success: false, error: "房间不存在" };
  }
  if (room.players.length === 0) {
    return { success: false, error: "房间为空" };
  }
  if (room.status !== "waiting") {
    return { success: false, error: "游戏已开始" };
  }

  // 清除倒计时（如果存在）
  if ((room as any).countdownTimer) {
    clearInterval((room as any).countdownTimer);
    delete (room as any).countdownTimer;
  }

  const now = Date.now();
  room.status = "playing";
  room.currentRound = 1;
  room.poems = [];
  room.currentPos = 0;
  room.playerScores.clear();
  room.startPlayerCount = room.players.length;
  room.skipRequests.clear();
  room.submissions = []; // 清空提交历史
  room.lastActivity = now;

  // 为每个玩家初始化分数
  for (const player of room.players) {
    room.playerScores.set(player.uid, 0);
  }

  // 生成5首诗
  try {
    for (let i = 0; i < room.maxRounds; i++) {
      const poem = await getPoem();
      if (!poem || !poem.content) {
        console.error(`[startGame] Failed to get poem ${i + 1}`);
        return { success: false, error: `获取第${i + 1}首诗失败` };
      }
      // 需要找到第一个非标点字符的位置
      const PUNCTUATION = ["，", "？", "。", "！", "：", "、", "；"];
      let pos = 0;
      while (pos < poem.content.length && PUNCTUATION.includes(poem.content[pos])) {
        pos++;
      }
      if (pos >= poem.content.length) {
        pos = 0;
      }
      room.poems.push({ ...poem, pos });
    }
    // 初始化当前字符位置为第一首诗的初始位置
    if (room.poems.length > 0) {
      room.currentPos = room.poems[0].pos;
    }
  } catch (error) {
    console.error("[startGame] Error generating poems:", error);
    room.status = "waiting"; // 恢复状态
    return { success: false, error: "生成题目失败：" + (error as Error).message };
  }

  return { success: true };
}

// 获取当前题目
export function getCurrentQuestion(roomCode: string): { content: string; highlightedChar: string; author: string; poemTitle: string; round: number } | null {
  const room = rooms.get(roomCode);
  if (!room || room.status !== "playing") {
    return null;
  }
  if (room.currentRound > room.maxRounds || room.currentRound < 1) {
    return null;
  }

  const poem = room.poems[room.currentRound - 1];
  // 使用当前字符位置，而不是初始位置
  const currentCharPos = room.currentPos;
  if (currentCharPos >= poem.content.length) {
    return null;
  }

  return {
    content: poem.content,
    highlightedChar: poem.content[currentCharPos] || "",
    author: poem.author,
    poemTitle: poem.origin,
    round: room.currentRound,
  };
}

// 提交答案
export async function submitAnswer(roomCode: string, uid: number, answer: string): Promise<{ verdict: number; correct: boolean; data: string[] }> {
  const room = rooms.get(roomCode);
  if (!room || room.status !== "playing") {
    throw new Error("房间不存在或游戏未开始");
  }
  if (!room.players.some((p) => p.uid === uid)) {
    throw new Error("你不是该房间的玩家");
  }

  const poem = room.poems[room.currentRound - 1];
  // 使用当前字符位置进行匹配
  const result = await checkPoem(answer, poem.content, room.currentPos);

  // 更新最后活动时间
  room.lastActivity = Date.now();

  // 如果回答正确，增加分数并移动到下一个字符
  if (result.verdict === VERDICT.CORRECT) {
    const currentScore = room.playerScores.get(uid) || 0;
    room.playerScores.set(uid, currentScore + 5);

    // 清除所有 skip 请求（因为已经有人回答正确了）
    if (room.skipRequests) {
      room.skipRequests.clear();
    }
    if (room.skipVotes) {
      room.skipVotes.clear();
    }
    room.skipInitiator = undefined;

    // 移动到下一个字符（跳过标点符号）
    const PUNCTUATION = ["，", "？", "。", "！", "：", "、", "；"];
    room.currentPos++;
    while (room.currentPos < poem.content.length && PUNCTUATION.includes(poem.content[room.currentPos])) {
      room.currentPos++;
    }

    // 如果已经到达诗句末尾，进入下一题
    if (room.currentPos >= poem.content.length) {
      room.currentRound++;
      if (room.currentRound <= room.maxRounds) {
        // 初始化下一题的字符位置
        room.currentPos = room.poems[room.currentRound - 1].pos;
      }
    }
  }

  // 记录提交历史
  const player = room.players.find((p) => p.uid === uid);
  const submission: RoomSubmission = {
    id: `${roomCode}_${Date.now()}_${uid}`,
    userId: uid,
    username: player?.username || "",
    answer: result.data[2] || answer,
    author: result.data[1] || "",
    poemTitle: result.data[0] || "",
    isCorrect: result.verdict === VERDICT.CORRECT,
    verdictText: VERDICT_TEXT[result.verdict],
    submittedAt: new Date().toISOString(),
  };
  room.submissions.push(submission);

  return {
    verdict: result.verdict,
    correct: result.verdict === VERDICT.CORRECT,
    data: result.data,
  };
}

// ==================== 投票系统公共函数 ====================

// 计算投票结果（通用函数）
function calculateVoteResult(
  room: Room,
  initiator: number | undefined,
  requests: Set<number> | undefined,
  votes: Map<number, "accept" | "reject"> | undefined,
  totalPlayers: number
): {
  accept: number;
  reject: number;
  otherAcceptCount: number;
  otherRejectCount: number;
  timeoutCount: number;
  voteStatus: Array<{ uid: number; username: string; status: "accept" | "reject" | "timeout" }>;
} {
  if (!initiator) {
    return {
      accept: 0,
      reject: 0,
      otherAcceptCount: 0,
      otherRejectCount: 0,
      timeoutCount: 0,
      voteStatus: [],
    };
  }

  const otherPlayers = room.players.filter(p => p.uid !== initiator);
  const totalVoted = votes?.size || 0;

  // 计算其他玩家（不包括发起者）的投票数
  // 如果 votes 中包含发起者，需要减去；如果不包含，说明发起者没有在 votes 中记录
  const hasInitiatorInVotes = votes?.has(initiator) || false;
  const otherVotedCount = hasInitiatorInVotes ? totalVoted - 1 : totalVoted;

  // 计算其他玩家（不包括发起者）的同意数
  let otherAcceptCount = 0;
  if (requests && requests.size > 0) {
    // 从 requests 中排除发起者，计算其他玩家的同意数
    otherAcceptCount = Array.from(requests).filter(uid => uid !== initiator).length;
  }
  // accept = 发起者的同意票(1) + 其他玩家的同意数
  // 发起者始终算作 1 票同意，无论 requests 中是否包含发起者
  const accept = 1 + otherAcceptCount;

  // 计算其他玩家的拒绝数（不包括发起者）
  const otherRejectCount = otherVotedCount - otherAcceptCount;
  // 计算未投票的其他玩家数（超时算作拒绝）
  const timeoutCount = otherPlayers.length - otherVotedCount;
  const reject = otherRejectCount + timeoutCount;

  // 构建投票状态列表
  const voteStatus: Array<{ uid: number; username: string; status: "accept" | "reject" | "timeout" }> = [];
  for (const player of otherPlayers) {
    const vote = votes?.get(player.uid);
    if (vote === "accept") {
      voteStatus.push({ uid: player.uid, username: player.username, status: "accept" });
    } else if (vote === "reject") {
      voteStatus.push({ uid: player.uid, username: player.username, status: "reject" });
    } else {
      voteStatus.push({ uid: player.uid, username: player.username, status: "timeout" });
    }
  }

  return {
    accept,
    reject,
    otherAcceptCount,
    otherRejectCount,
    timeoutCount,
    voteStatus,
  };
}

// 清空跳过投票
function clearSkipVote(room: Room) {
  // 注意：room.skipTimer 已不再使用，超时计时器由 socket 代码管理
  // if (room.skipTimer) {
  //   clearTimeout(room.skipTimer);
  //   room.skipTimer = undefined;
  // }
  if (room.skipRequests) room.skipRequests.clear();
  else room.skipRequests = new Set<number>();

  if (room.skipVotes) room.skipVotes.clear();
  else room.skipVotes = new Map<number, "accept" | "reject">();

  room.skipInitiator = undefined;
  room.skipVoteOnlineCount = undefined;
}

// 清空结束房间投票
function clearEndVote(room: Room) {
  // 注意：room.endVoteTimer 已不再使用，超时计时器由 socket 代码管理
  // if (room.endVoteTimer) {
  //   clearTimeout(room.endVoteTimer);
  //   room.endVoteTimer = undefined;
  // }
  if (room.endRequests) room.endRequests.clear();
  if (room.endVotes) room.endVotes.clear();
  room.endInitiator = undefined;
  room.endVoteOnlineCount = undefined;
  room.lastActivity = Date.now();
}

// 请求跳过
function applySkip(room: Room): { skipChar: boolean; finished: boolean } {
  const poem = room.poems[room.currentRound - 1];
  const PUNCTUATION = ["，", "？", "。", "！", "：", "、", "；"];

  room.currentPos++;
  while (room.currentPos < poem.content.length && PUNCTUATION.includes(poem.content[room.currentPos])) {
    room.currentPos++;
  }

  if (room.currentPos >= poem.content.length) {
    room.currentRound++;
    if (room.currentRound <= room.maxRounds) {
      room.currentPos = room.poems[room.currentRound - 1].pos;
    }
    return { skipChar: false, finished: room.currentRound > room.maxRounds };
  }

  return { skipChar: true, finished: false };
}

export function requestSkip(roomCode: string, uid: number): {
  success: boolean;
  state: "pending" | "applied" | "failed";
  skipChar?: boolean;
  finished?: boolean;
  needed?: number;
  current?: number;
  accept?: number;
  reject?: number;
  error?: string;
  initiator?: number;
} {
  const room = rooms.get(roomCode);
  if (!room || room.status !== "playing") {
    return { success: false, state: "failed", skipChar: false, error: "房间不存在或游戏未开始" };
  }
  if (!room.players.some((p) => p.uid === uid)) {
    return { success: false, state: "failed", skipChar: false, error: "你不是该房间的玩家" };
  }

  // 如果已有投票在进行中，拒绝新的 skip 请求，提示用户输入 accept 或 reject
  if (room.skipInitiator !== undefined) {
    return { success: false, state: "failed", error: "当前已有跳过投票在进行中，请输入 accept 同意或 reject 拒绝" };
  }

  // 只有一个人，直接跳过
  if (room.players.length === 1) {
    const res = applySkip(room);
    return { success: true, state: "applied", skipChar: res.skipChar, finished: res.finished, accept: 1, reject: 0 };
  }

  // 初始化投票系统，记录发起者，并自动添加发起者的同意票
  if (!room.skipVotes) room.skipVotes = new Map<number, "accept" | "reject">();
  if (!room.skipRequests) room.skipRequests = new Set<number>();
  room.skipInitiator = uid; // 记录发起者
  // 记录发起投票时的在线人数（基于 onlineUsers，如果没有则使用 players.length）
  room.skipVoteOnlineCount = room.onlineUsers?.size || room.players.length;
  // 发起者自动算作一个同意票
  room.skipVotes.set(uid, "accept");
  room.skipRequests.add(uid);
  room.lastActivity = Date.now();

  // 注意：超时计时器由 socket 代码管理，这里不再设置 room.skipTimer
  // room.skipTimer 已被 socket 代码中的 skipVoteTimers 替代
  // 这样可以避免定时器冲突

  const needed = Math.floor(room.skipVoteOnlineCount / 2) + 1;
  return { success: true, state: "pending", needed, current: 1, accept: 1, reject: 0, initiator: uid };
}

export function resolveSkipVote(
  roomCode: string,
  forceApply: boolean = false
): {
  success: boolean;
  state: "applied" | "failed";
  skipChar?: boolean;
  finished?: boolean;
  needed?: number;
  current?: number;
  accept?: number;
  reject?: number;
  voteStatus?: Array<{ uid: number; username: string; status: "accept" | "reject" | "timeout" }>;
} {
  const room = rooms.get(roomCode);
  if (!room || room.status !== "playing") {
    // 即使房间状态不对，也要清空投票状态
    if (room) {
      // 使用发起投票时记录的在线人数，如果没有则使用当前在线人数或玩家数
      const voteOnlineCount = room.skipVoteOnlineCount ?? (room.onlineUsers?.size || room.players.length);
      const needed = Math.floor(voteOnlineCount / 2) + 1;
      clearSkipVote(room);
      return { success: false, state: "failed", needed, accept: 0, reject: 0 };
    }
    return { success: false, state: "failed", needed: 0, accept: 0, reject: 0 };
  }

  // 使用发起投票时记录的在线人数，如果没有则使用当前在线人数或玩家数
  const voteOnlineCount = room.skipVoteOnlineCount ?? (room.onlineUsers?.size || room.players.length);
  const needed = Math.floor(voteOnlineCount / 2) + 1;
  const initiator = room.skipInitiator;

  if (!initiator) {
    // 如果没有 initiator，说明投票状态已经被清空或从未初始化
    // 这种情况下，我们无法计算投票结果，返回失败
    clearSkipVote(room);
    // 但是，如果房间有玩家，至少应该显示 needed 值
    return { success: false, state: "failed", needed, accept: 0, reject: 0 };
  }

  // 使用公共函数计算投票结果
  // 注意：即使 skipRequests 和 skipVotes 为空，发起者也算作 1 票同意
  // 使用发起投票时的在线人数作为总数
  const result = calculateVoteResult(room, initiator, room.skipRequests, room.skipVotes, voteOnlineCount);
  const { accept, reject, voteStatus } = result;

  // 清空投票状态（必须在计算完成后清空）
  clearSkipVote(room);

  if (forceApply || accept >= needed) {
    const res = applySkip(room);
    return { success: true, state: "applied", skipChar: res.skipChar, finished: res.finished, needed, current: accept, accept, reject, voteStatus };
  }

  return { success: true, state: "failed", needed, current: accept, accept, reject, voteStatus };
}

// 请求结束房间（投票 >50%）
export function requestEnd(
  roomCode: string,
  uid: number
): {
  success: boolean;
  state: "pending" | "applied" | "failed";
  needed: number;
  current: number;
  accept: number;
  reject: number;
  decidedAll?: boolean;
  error?: string;
  initiator?: number;
} {
  const room = rooms.get(roomCode);
  if (!room) {
    return { success: false, state: "pending", needed: 0, current: 0, accept: 0, reject: 0, error: "房间不存在" };
  }
  if (!room.players.some((p) => p.uid === uid)) {
    return { success: false, state: "pending", needed: 0, current: 0, accept: 0, reject: 0, error: "你不是该房间的玩家" };
  }

  // 未开始时也允许发起投票（但需要等待投票结果）
  if (room.status !== "playing") {
    // 如果房间只有1人，直接结束
    if (room.players.length <= 1) {
      clearEndVote(room);
      return { success: true, state: "applied", needed: 1, current: 1, accept: 1, reject: 0, decidedAll: true };
    }
    // 多人时走投票流程
  }

  // 1v1 匹配房：仅剩一人在线时可结束（无投票）
  // 注意：游戏进行中玩家离开不会从 players 移除，但会从 onlineUsers 移除
  const onlineCount = room.onlineUsers.size;
  if (room.autoStart && onlineCount > 1) {
    return { success: false, state: "pending", needed: 0, current: 0, accept: 0, reject: 0, error: "1v1 仅剩一人时才能结束" };
  }
  // 如果1v1只剩一人在线，允许直接结束
  if (room.autoStart && onlineCount <= 1) {
    clearEndVote(room);
    return { success: true, state: "applied", needed: 1, current: 1, accept: 1, reject: 0, decidedAll: true };
  }

  // 自建房：游戏中不允许房主"强制结束"，必须走投票（>50%）。
  // 仅当房间只剩 1 人时可直接结束。
  if (!room.autoStart && room.players.length <= 1) {
    clearEndVote(room);
    return { success: true, state: "applied", needed: 1, current: 1, accept: 1, reject: 0, decidedAll: true };
  }

  // 如果已有投票在进行中，不允许重复发起
  if (room.endInitiator !== undefined) {
    return { success: false, state: "pending", needed: 0, current: 0, accept: 0, reject: 0, error: "已有结束房间投票在进行中" };
  }

  // 初始化投票系统，记录发起者，并自动添加发起者的同意票
  if (!room.endRequests) room.endRequests = new Set<number>();
  if (!room.endVotes) room.endVotes = new Map<number, "accept" | "reject">();
  room.endInitiator = uid;
  // 记录发起投票时的在线人数（基于 onlineUsers，如果没有则使用 players.length）
  room.endVoteOnlineCount = room.onlineUsers?.size || room.players.length;
  // 发起者自动算作一个同意票
  room.endVotes.set(uid, "accept");
  room.endRequests.add(uid);
  room.lastActivity = Date.now();

  // 注意：超时计时器由 socket 代码管理，这里不再设置 room.endVoteTimer
  // room.endVoteTimer 已被 socket 代码中的 endVoteTimers 替代
  // 这样可以避免定时器冲突

  const needed = Math.floor(room.endVoteOnlineCount / 2) + 1;
  return { success: true, state: "pending", needed, current: 1, accept: 1, reject: 0, initiator: uid };
}

// 通用的投票处理函数（用于结束房间投票）
function handleEndVote(
  roomCode: string,
  uid: number,
  voteType: "accept" | "reject"
): {
  success: boolean;
  state: "pending" | "applied" | "failed";
  needed: number;
  current: number;
  accept: number;
  reject: number;
  decidedAll?: boolean;
  error?: string;
} {
  const room = rooms.get(roomCode);
  if (!room) {
    return { success: false, state: "failed", needed: 0, current: 0, accept: 0, reject: 0, error: "房间不存在" };
  }
  if (!room.players.some((p) => p.uid === uid)) {
    return { success: false, state: "failed", needed: 0, current: 0, accept: 0, reject: 0, error: "你不是该房间的玩家" };
  }

  const initiator = room.endInitiator;
  if (!initiator) {
    return { success: false, state: "failed", needed: 0, current: 0, accept: 0, reject: 0, error: "没有进行中的结束房间投票" };
  }

  if (!room.endRequests) room.endRequests = new Set<number>();
  if (!room.endVotes) room.endVotes = new Map<number, "accept" | "reject">();

  // 记录投票
  room.endVotes.set(uid, voteType);
  if (voteType === "accept") {
    room.endRequests.add(uid);
  } else {
    room.endRequests.delete(uid);
  }
  room.lastActivity = Date.now();

  // 使用发起投票时记录的在线人数，如果没有则使用当前在线人数或玩家数
  const voteOnlineCount = room.endVoteOnlineCount ?? (room.onlineUsers?.size || room.players.length);
  const needed = Math.floor(voteOnlineCount / 2) + 1;
  const otherPlayers = room.players.filter(p => p.uid !== initiator);
  const otherVotedCount = Array.from(room.endVotes.keys()).filter(uid => uid !== initiator).length;

  // 使用公共函数计算投票结果（与 resolveEndVote 保持一致）
  // 使用发起投票时的在线人数作为总数
  const result = calculateVoteResult(room, initiator, room.endRequests, room.endVotes, voteOnlineCount);
  const { accept, reject } = result;

  // 检查是否所有人都已投票（除了发起者）
  if (otherVotedCount >= otherPlayers.length) {
    const pass = accept >= needed;
    clearEndVote(room);
    return { success: true, state: pass ? "applied" : "failed", needed, current: accept, accept, reject, decidedAll: true };
  }

  return { success: true, state: "pending", needed, current: accept, accept, reject };
}

// 同意结束房间
export function acceptEnd(roomCode: string, uid: number) {
  return handleEndVote(roomCode, uid, "accept");
}

// 拒绝结束房间
export function rejectEnd(roomCode: string, uid: number) {
  return handleEndVote(roomCode, uid, "reject");
}

export function resolveEndVote(
  roomCode: string,
  forceApply: boolean = false
): {
  success: boolean;
  state: "applied" | "failed";
  needed?: number;
  current?: number;
  accept?: number;
  reject?: number;
  voteStatus?: Array<{ uid: number; username: string; status: "accept" | "reject" | "timeout" }>;
} {
  const room = rooms.get(roomCode);
  if (!room) return { success: false, state: "failed", needed: 0, accept: 0, reject: 0 };

  // 使用发起投票时记录的在线人数，如果没有则使用当前在线人数或玩家数
  const voteOnlineCount = room.endVoteOnlineCount ?? (room.onlineUsers?.size || room.players.length);
  const needed = Math.floor(voteOnlineCount / 2) + 1;
  const initiator = room.endInitiator;

  if (!initiator) {
    // 如果没有 initiator，说明投票状态已经被清空或从未初始化
    // 这种情况下，我们无法计算投票结果，返回失败
    clearEndVote(room);
    // 但是，如果房间有玩家，至少应该显示 needed 值
    return { success: false, state: "failed", needed, accept: 0, reject: 0 };
  }

  // 使用公共函数计算投票结果
  // 注意：即使 endRequests 和 endVotes 为空，发起者也算作 1 票同意
  // 使用发起投票时的在线人数作为总数
  const result = calculateVoteResult(room, initiator, room.endRequests, room.endVotes, voteOnlineCount);
  const { accept, reject, voteStatus } = result;

  // 清空投票状态（必须在计算完成后清空）
  clearEndVote(room);

  if (forceApply || accept >= needed) {
    return { success: true, state: "applied", needed, current: accept, accept, reject, voteStatus };
  }
  return { success: true, state: "failed", needed, current: accept, accept, reject, voteStatus };
}

// 通用的投票处理函数（用于 skip 投票）
function handleSkipVote(
  roomCode: string,
  uid: number,
  voteType: "accept" | "reject"
): {
  success: boolean;
  state: "pending" | "applied" | "failed";
  skipChar?: boolean;
  finished?: boolean;
  accept?: number;
  reject?: number;
  needed?: number;
  current?: number;
  error?: string;
} {
  const room = rooms.get(roomCode);
  if (!room || room.status !== "playing") {
    return { success: false, state: "failed", error: "房间不存在或游戏未开始" };
  }
  if (!room.players.some((p) => p.uid === uid)) {
    return { success: false, state: "failed", error: "你不是该房间的玩家" };
  }

  const initiator = room.skipInitiator;
  if (!initiator) {
    return { success: false, state: "failed", error: "没有进行中的跳过投票" };
  }

  if (uid === initiator) {
    return { success: false, state: "failed", error: "发起者已自动同意，无需再次投票" };
  }

  if (!room.skipVotes) room.skipVotes = new Map<number, "accept" | "reject">();
  if (!room.skipRequests) room.skipRequests = new Set<number>();

  // 记录投票
  room.skipVotes.set(uid, voteType);
  if (voteType === "accept") {
    room.skipRequests.add(uid);
  } else {
    room.skipRequests.delete(uid);
  }
  room.lastActivity = Date.now();

  // 使用发起投票时记录的在线人数，如果没有则使用当前在线人数或玩家数
  const voteOnlineCount = room.skipVoteOnlineCount ?? (room.onlineUsers?.size || room.players.length);
  const needed = Math.floor(voteOnlineCount / 2) + 1;
  const otherPlayers = room.players.filter(p => p.uid !== initiator);
  const otherVotedCount = Array.from(room.skipVotes.keys()).filter(uid => uid !== initiator).length;

  // 计算当前投票状态（发起者算作1票同意）
  const accept = Math.max(1, room.skipRequests.size);
  const reject = room.skipVotes.size - accept;
  const current = accept;

  // 检查是否所有人都已投票（除了发起者）
  if (otherVotedCount >= otherPlayers.length) {
    const pass = voteType === "accept" && accept >= needed;
    return resolveSkipVote(roomCode, pass);
  }

  return { success: true, state: "pending", accept, reject, needed, current };
}

// 同意跳过
export function acceptSkip(roomCode: string, uid: number) {
  return handleSkipVote(roomCode, uid, "accept");
}

// 拒绝跳过
export function rejectSkip(roomCode: string, uid: number) {
  return handleSkipVote(roomCode, uid, "reject");
}

// 进入下一题
export function nextRound(roomCode: string): { finished: boolean } {
  const room = rooms.get(roomCode);
  if (!room) {
    return { finished: true };
  }

  room.currentRound++;
  room.skipRequests.clear();
  room.lastActivity = Date.now();

  // 初始化下一题的字符位置
  if (room.currentRound <= room.maxRounds && room.poems[room.currentRound - 1]) {
    room.currentPos = room.poems[room.currentRound - 1].pos;
  }

  if (room.currentRound > room.maxRounds) {
    room.status = "finished";
    return { finished: true };
  }

  return { finished: false };
}

// 结束游戏并结算分数
export function finishGame(roomCode: string): { players: Array<{ uid: number; username: string; score: number; bonusScore: number; newTotalScore: number }> } | null {
  const room = rooms.get(roomCode);
  if (!room) {
    return null;
  }
  if (room.endRequests) {
    room.endRequests.clear();
  }
  if (room.drawRequests) {
    room.drawRequests.clear();
  }

  const results = room.players.map((player) => {
    const gameScore = room.playerScores.get(player.uid) || 0;
    return {
      uid: player.uid,
      username: player.username,
      score: gameScore,
      bonusScore: 0, // 将在调用后计算
      newTotalScore: 0, // 将在调用后计算
    };
  });

  // 确定胜负
  const winner = results.reduce((prev, curr) => (curr.score > prev.score ? curr : prev));
  const isTie = results.every((r) => r.score === winner.score);

  // 自建房不结算积分
  if (!room.autoStart) {
    // 自建房：只返回结果，不更新数据库积分
    for (const result of results) {
      result.bonusScore = 0;
      // 获取当前积分但不更新
      const db = getDb();
      const currentUser = db.prepare("SELECT score FROM users WHERE uid = ?").get(result.uid) as { score: number } | undefined;
      result.newTotalScore = currentUser?.score || 0;
    }
  } else {
    // 1v1匹配房：正常结算积分
    // 更新数据库中的积分
    const db = getDb();

    // 计算最终分数
    // 检查是否是平局请求（双方都请求平局）
    const isDrawRequest = room.drawRequests && room.drawRequests.size >= 2;

    for (const result of results) {
      let bonusScore = 0;
      if (isDrawRequest || isTie) {
        // 平局或同分：全部按失败计算，败者 5 分
        bonusScore = 5;
      } else if (result.uid === winner.uid) {
        // 胜者：额外 20 分
        bonusScore = 20;
      } else {
        // 败者：额外 5 分
        bonusScore = 5;
      }
      result.bonusScore = bonusScore;

      // 更新数据库
      const currentUser = db.prepare("SELECT score FROM users WHERE uid = ?").get(result.uid) as { score: number } | undefined;
      const currentScore = currentUser?.score || 0;
      const newScore = currentScore + result.score + bonusScore;
      db.prepare("UPDATE users SET score = ? WHERE uid = ?").run(newScore, result.uid);
      result.newTotalScore = newScore;

      // 记录积分历史
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

  // 将房间状态设置为已完成
  room.status = "finished";
  room.lastActivity = Date.now();

  return { players: results };
}

// 获取房间信息
export function getRoom(roomCode: string): Room | null {
  return rooms.get(roomCode) || null;
}

// 查询用户是否有尚未销毁的房间（包含已离开但房间仍存在的情况）
export function findUserActiveRoom(uid: number): string | null {
  for (const [code, room] of rooms.entries()) {
    // 只要当前仍在房间名单中，认为有活跃房间
    if (room.players.some((p) => p.uid === uid)) {
      return code;
    }
    // 仅对已开始的房间允许曾加入过的玩家返回
    if (room.status === "playing" && room.allJoinedUsers.has(uid)) {
      return code;
    }
  }
  return null;
}

// 获取房间提交历史
export function getRoomSubmissions(roomCode: string, uid?: number): RoomSubmission[] {
  const room = rooms.get(roomCode);
  if (!room) return [];
  if (!room.submissions) return [];
  if (uid !== undefined) {
    // 只返回该用户的提交
    return room.submissions.filter((s) => s.userId === uid);
  }
  // 返回所有提交
  return room.submissions;
}

// 离开房间
export function leaveRoom(roomCode: string, uid: number): void {
  const room = rooms.get(roomCode);
  if (!room) return;

  // 1v1 匹配房等待阶段：保留玩家记录，允许回来，倒计时继续
  // 游戏进行中：保留玩家记录（用于投票基数），仅标记不在线
  const keepPlayerInWaitingMatch = room.autoStart && room.status === "waiting";
  const keepDuringPlaying = room.status === "playing";
  if (!keepPlayerInWaitingMatch && !keepDuringPlaying) {
    room.players = room.players.filter((p) => p.uid !== uid);
    // 未开始时删除分数
    room.playerScores.delete(uid);
  }
  if (room.skipRequests) {
    room.skipRequests.delete(uid);
  }
  if (room.endRequests) {
    room.endRequests.delete(uid);
  }
  leaveMatchmaking(uid);

  // 不退的人自己负责，倒计时继续（不因为人数少而清除倒计时）

  // 如果房间空了，暂时保留房间（不立即删除，以便玩家可以返回）
  // 房间会在清理任务中自动删除（如果长时间无人）
  if (!keepPlayerInWaitingMatch && !keepDuringPlaying && room.players.length === 0) {
    // 房间空了才清除倒计时
    if ((room as any).countdownTimer) {
      clearInterval((room as any).countdownTimer);
      delete (room as any).countdownTimer;
    }
    // 不立即删除房间，保留以便玩家返回
  }
}

// 断开连接时清理用户
export function cleanupUser(uid: number): void {
  leaveMatchmaking(uid);
  // 查找并清理用户所在的所有房间
  const roomsToClean: string[] = [];
  for (const [code, room] of rooms.entries()) {
    if (room.players.some((p) => p.uid === uid)) {
      leaveRoom(code, uid);
    }
  }
}

// 销毁房间（供外部调用，会通知玩家）
export function destroyRoom(roomCode: string): Room | null {
  const room = rooms.get(roomCode);
  if (room) {
    rooms.delete(roomCode);
    console.log(`[matchmaking] 房间 ${roomCode} 已销毁`);
  }
  return room || null;
}

// 请求平局
export function requestDraw(roomCode: string, uid: number): { success: boolean; error?: string } {
  const room = rooms.get(roomCode);
  if (!room || room.status !== "playing") {
    return { success: false, error: "房间不存在或游戏未开始" };
  }
  if (!room.players.some((p) => p.uid === uid)) {
    return { success: false, error: "你不是该房间的玩家" };
  }

  if (room.drawPending) {
    return { success: false, error: "已有平局请求处理中" };
  }

  // 如果还没有平局请求，添加请求
  if (!room.drawRequests) {
    room.drawRequests = new Set<number>();
  }

  room.drawRequests.add(uid);
  room.drawPending = true;
  room.lastActivity = Date.now();

  // 10秒超时自动视为拒绝
  if (room.drawTimer) {
    clearTimeout(room.drawTimer);
  }
  room.drawTimer = setTimeout(() => {
    rejectDraw(roomCode, uid);
  }, SKIP_VOTE_WINDOW);

  return { success: true };
}

// 同意平局
export function acceptDraw(roomCode: string, uid: number): { success: boolean; error?: string; finished?: boolean; finishResult?: { players: Array<{ uid: number; username: string; score: number; bonusScore: number; newTotalScore: number }> } } {
  const room = rooms.get(roomCode);
  if (!room || room.status !== "playing") {
    return { success: false, error: "房间不存在或游戏未开始" };
  }
  if (!room.players.some((p) => p.uid === uid)) {
    return { success: false, error: "你不是该房间的玩家" };
  }

  if (!room.drawRequests) {
    room.drawRequests = new Set<number>();
  }

  room.drawRequests.add(uid);
  room.lastActivity = Date.now();

  if (room.drawTimer) {
    clearTimeout(room.drawTimer);
    room.drawTimer = undefined;
  }
  room.drawPending = false;

  // 检查是否双方都同意平局
  if (room.drawRequests.size >= 2) {
    // 双方都同意，结束游戏并结算（平局）
    // finishGame 会检查 drawRequests 并处理平局结算，同时设置房间状态为 finished
    const finishResult = finishGame(roomCode);
    if (finishResult) {
      return { success: true, finished: true, finishResult };
    }
    return { success: false, error: "结算失败" };
  }

  return { success: true, finished: false };
}

// 拒绝平局
export function rejectDraw(roomCode: string, uid: number): { success: boolean; error?: string } {
  const room = rooms.get(roomCode);
  if (!room || room.status !== "playing") {
    return { success: false, error: "房间不存在或游戏未开始" };
  }
  if (!room.players.some((p) => p.uid === uid)) {
    return { success: false, error: "你不是该房间的玩家" };
  }

  // 清除所有平局请求
  if (room.drawRequests) {
    room.drawRequests.clear();
  }
  room.lastActivity = Date.now();
  if (room.drawTimer) {
    clearTimeout(room.drawTimer);
    room.drawTimer = undefined;
  }
  room.drawPending = false;

  return { success: true };
}

// 清理过期的房间（30分钟无活动自动销毁）
const ROOM_TIMEOUT = 30 * 60 * 1000; // 30分钟
let cleanupInterval: NodeJS.Timeout | null = null;

export function startRoomCleanup(io: any) {
  if (cleanupInterval) return; // 已经启动
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    const roomsToDelete: Array<{ code: string; room: Room }> = [];

    for (const [code, room] of rooms.entries()) {
      // 如果房间超过30分钟没有活动，销毁房间
      if (now - room.lastActivity > ROOM_TIMEOUT) {
        roomsToDelete.push({ code, room });
      }
      // 如果房间已完成且超过1小时，也删除
      else if (room.status === "finished" && now - room.createdAt > 60 * 60 * 1000) {
        roomsToDelete.push({ code, room });
      }
    }

    // 删除过期的房间并通知玩家
    for (const { code, room } of roomsToDelete) {
      // 如果房间正在游戏中，需要结算分数
      if (room.status === "playing") {
        const finishResult = finishGame(code);
        if (finishResult) {
          for (const player of room.players) {
            io.to(`user_${player.uid}`).emit("room_game_finished", {
              results: finishResult.players,
            });
            // 更新积分
            const finalResult = finishResult.players.find((p) => p.uid === player.uid);
            if (finalResult) {
              io.to(`user_${player.uid}`).emit("score_update", { score: finalResult.newTotalScore });
            }
          }
        }
      }

      // 通知房间内所有玩家房间已销毁
      for (const player of room.players) {
        io.to(`user_${player.uid}`).emit("room_destroyed", {
          roomCode: code,
          reason: "房间超时",
        });
      }
      rooms.delete(code);
      console.log(`[matchmaking] 房间 ${code} 已超时销毁`);
    }
  }, 60 * 1000); // 每分钟检查一次
}

