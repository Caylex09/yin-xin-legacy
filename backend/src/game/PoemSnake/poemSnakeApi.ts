// PoemSnake 游戏相关的 HTTP API 路由
import { Request, Response, Router } from "express";
import { getDb } from "../../db";
import { verifyToken } from "../../auth";
import { publicRoomManager } from "./PoemSnakePublicManager";
import { poemSnakeRoomManager as matchmaking } from "./PoemSnakeGameManager";

// 辅助函数：验证 token 并获取 uid
function getUidFromRequest(req: Request): number | null {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return null;
    const payload = verifyToken(token) as { sub: number; tokenVersion?: number };
    return payload.sub;
  } catch {
    return null;
  }
}

// 中间件：要求登录
function requireLogin(req: Request, res: Response, next: () => void) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return res.status(401).json({ error: "缺少 token" });
    const payload = verifyToken(token) as { sub: number; tokenVersion?: number };

    // 验证 token 是否有效
    const db = getDb();
    const row = db
      .prepare("SELECT token_version, role FROM users WHERE uid = ?")
      .get(payload.sub) as { token_version: number; role: number } | undefined;
    if (!row) throw new Error("用户不存在");
    if (row.token_version !== payload.tokenVersion) throw new Error("token 失效，请重新登录");
    if (row.role < 0) throw new Error("账号已封禁");

    (req as any).uid = payload.sub;
    next();
  } catch (e) {
    res.status(401).json({ error: (e as Error).message });
  }
}

// 创建路由
export function createPoemSnakeApiRouter() {
  const router = Router();

  // 获取公屏游戏状态
  router.get("/api/game/poem-snake/state", (_req, res) => {
    try {
      const publicRoom = publicRoomManager.getPublicScreenRoom();
      if (!publicRoom) return res.status(500).json({ error: "公屏未初始化" });
      const currentPoem = publicRoom.state.poems[publicRoom.currentRound - 1];
      if (!currentPoem) return res.status(500).json({ error: "公屏加载中" });

      res.json({
        currentPoem: currentPoem.content,
        highlightedChar: currentPoem.content[publicRoom.state.currentPos] || "",
        author: currentPoem.author,
        authorName: currentPoem.author,
        poemTitle: currentPoem.origin,
        round: 1,
        isActive: true,
        pos: publicRoom.state.currentPos,
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 获取提交历史
  router.get("/api/game/poem-snake/submissions", (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const db = getDb();
      const rows = db
        .prepare(
          "SELECT * FROM poem_snake_submissions WHERE verdict = 0 ORDER BY timestamp DESC LIMIT ? OFFSET ?"
        )
        .all(limit, offset) as Array<{
          id: number;
          username: string;
          content: string;
          author: string;
          origin: string;
          timestamp: string;
        }>;
      res.json(rows.map((r) => ({
        id: r.id.toString(),
        userId: "0",
        username: r.username,
        answer: r.content,
        author: r.author,
        authorName: r.author,
        poemTitle: r.origin,
        isCorrect: true,
        score: 0,
        submittedAt: r.timestamp,
      })));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 获取个人提交历史
  router.get("/api/game/poem-snake/my-submissions", requireLogin, (req, res) => {
    try {
      const uid = (req as any).uid;
      const db = getDb();
      const user = db.prepare("SELECT username FROM users WHERE uid = ?").get(uid) as { username: string } | undefined;
      if (!user) return res.status(404).json({ error: "用户不存在" });

      const rows = db
        .prepare(
          "SELECT * FROM poem_snake_submissions WHERE username = ? ORDER BY timestamp DESC LIMIT 10"
        )
        .all(user.username) as Array<{
          id: number;
          username: string;
          content: string;
          verdict: number;
          verdictCN: string;
          timestamp: string;
        }>;
      res.json(rows.map((r) => ({
        id: r.id.toString(),
        userId: uid.toString(),
        username: r.username,
        answer: r.content,
        isCorrect: r.verdict === 0,
        verdictText: r.verdictCN,
        score: 0,
        submittedAt: r.timestamp,
      })));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 检查房间是否存在且用户可以加入（房间存在且状态为waiting，或者用户在房间中）
  router.get("/api/game/poem-snake/room/:roomCode/check", requireLogin, (req, res) => {
    try {
      const uid = (req as any).uid;
      if (!uid) {
        return res.status(401).json({ error: "未登录" });
      }
      const { roomCode } = req.params;

      const room = matchmaking.getRoom(roomCode);
      if (!room) {
        return res.json({ exists: false, inRoom: false, canJoin: false });
      }

      const inRoom = room.players.some((p: any) => p.uid === uid);
      // 只要房间存在（游戏未开始或正在游戏中），都可以返回
      const canJoin = room.status === "waiting" || room.status === "playing";

      return res.json({ exists: true, inRoom, canJoin, status: room.status });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 获取房间提交历史
  router.get("/api/game/poem-snake/room/:roomCode/submissions", requireLogin, (req, res) => {
    try {
      const uid = (req as any).uid;
      if (!uid) {
        return res.status(401).json({ error: "未登录" });
      }
      const { roomCode } = req.params;
      const onlyMine = req.query.mine === "true";

      const room = matchmaking.getRoom(roomCode);
      if (!room) {
        return res.status(404).json({ error: "房间不存在" });
      }

      // 检查用户是否在房间中
      if (!room.players.some((p: any) => p.uid === uid)) {
        return res.status(403).json({ error: "你不是该房间的玩家" });
      }

      const submissions = matchmaking.getRoomSubmissions(roomCode, onlyMine ? uid : undefined);
      res.json(submissions || []);
    } catch (e) {
      console.error("[API] Error in room submissions:", e);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}

