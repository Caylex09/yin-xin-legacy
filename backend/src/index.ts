import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { MeiliSearch } from "meilisearch";
import { createPoemSnakeApiRouter } from "./game/PoemSnake/poemSnakeApi";
import { initializePoemSnake } from "./game/PoemSnake/poemSnakeState";
import { createAuthApiRouter } from "./authApi";
import { createUserApiRouter } from "./userApi";
import { createOnlineApiRouter } from "./onlineApi";
import { createAdminApiRouter } from "./adminApi";
import { createSearchApiRouter } from "./searchApi";
import { createAnnouncementApiRouter } from "./announcementApi";
import { createWikiApiRouter } from "./wikiApi";
import { createDiscussionApiRouter } from "./discussionApi";
import { createTicketApiRouter } from "./ticketApi";

const MEILI_HOST = process.env.MEILI_HOST || "http://127.0.0.1:7700";
const MEILI_API_KEY = process.env.MEILI_API_KEY || "";
const PORT = Number(process.env.PORT || 3000);

const client = new MeiliSearch({
  host: MEILI_HOST,
  apiKey: MEILI_API_KEY,
});

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// 健康检查和统计
app.get("/api/health", async (_req, res) => {
  try {
    const stats = await client.getStats();
    res.json({ status: "ok", stats });
  } catch (e) {
    res.status(500).json({ status: "error", error: (e as Error).message });
  }
});

app.get("/api/stats/summary", async (_req, res) => {
  try {
    const stats = await client.getStats();
    const poetryCount = stats.indexes?.poetry?.numberOfDocuments ?? 0;
    const poetCount = stats.indexes?.poets?.numberOfDocuments ?? 0;
    res.json({ poetryCount, poetCount });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// API 路由
app.use(createAuthApiRouter());
app.use(createUserApiRouter());
app.use(createOnlineApiRouter());
app.use(createAdminApiRouter());
app.use(createSearchApiRouter());
app.use(createAnnouncementApiRouter());
app.use(createWikiApiRouter());
app.use(createDiscussionApiRouter());
app.use(createTicketApiRouter());
app.use(createPoemSnakeApiRouter());

app.use((_, res) => {
  res.status(404).json({ error: "Not Found" });
});

// 初始化 PoemSnake 游戏（包括 WebSocket、游戏状态、房间清理等）
initializePoemSnake(io);

httpServer.listen(PORT, () => {
  console.log(`API listening on http://127.0.0.1:${PORT}`);
  console.log(`WebSocket server ready`);
});
