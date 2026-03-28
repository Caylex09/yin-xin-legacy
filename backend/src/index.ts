import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
// ... removed MeiliSearch
import { createPoemSnakeApiRouter } from "./game/PoemSnake/poemSnakeApi";
import { initializePoemSnake } from "./game/PoemSnake/poemSnakeState";
import { setupPoemleSocket } from "./game/Poemle/poemleSocket";
import { onlineUsers } from "./onlineApi";
import { createAuthApiRouter } from "./authApi";
import { createUserApiRouter } from "./userApi";
import { createOnlineApiRouter } from "./onlineApi";
import { createAdminApiRouter } from "./adminApi";
import { createSearchApiRouter } from "./searchApi";
import { createAnnouncementApiRouter } from "./announcementApi";
import { createWikiApiRouter } from "./wikiApi";
import { createDiscussionApiRouter } from "./discussionApi";
import { createTicketApiRouter } from "./ticketApi";
import { createPoemleApiRouter } from "./game/Poemle/poemleApi";
import { searchClient as client } from "./meiliClient";

const PORT = Number(process.env.PORT || 3000);

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

app.get("/api/github/commits", async (req, res) => {
  try {
    const repo = process.env.GITHUB_REPO || "Caylex09/yin-xin";
    const pat = process.env.GITHUB_PAT;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const headers: Record<string, string> = {
      "User-Agent": "YinXin-App",
      "Accept": "application/vnd.github.v3+json",
    };
    if (pat) {
      headers["Authorization"] = `token ${pat}`;
    }
    const resp = await fetch(`https://api.github.com/repos/${repo}/commits?page=${page}&per_page=${limit}`, { headers });
    if (!resp.ok) {
      throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`);
    }
    const data = await resp.json();

    // GitHub API headers often have "link" headers to inform us about total pages, 
    // but extracting that might be brittle. We can just send items back.
    // However, to keep it consistent with the frontend, let's wrap it.
    // A simple heuristic for GitHub: If data length equals limit, there's likely a next page.
    let totalPages = page;
    const linkHeader = resp.headers.get("Link");
    if (linkHeader) {
      // e.g. <https://api.github.com/repositories/123/commits?page=5>; rel="last"
      const match = linkHeader.match(/page=(\d+)[^>]*>;\s*rel="last"/);
      if (match) {
        totalPages = parseInt(match[1]);
      } else if (linkHeader.includes('rel="next"')) {
        totalPages = page + 1;
      }
    } else if (data.length === limit) {
      totalPages = page + 1;
    }

    res.json({
      items: data,
      page,
      totalPages,
      total: totalPages * limit // rough estimate
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to fetch commits" });
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
app.use(createPoemleApiRouter());

app.use((_, res) => {
  res.status(404).json({ error: "Not Found" });
});

// 配置 MeiliSearch 索引的 filterable attributes
async function configureMeiliSearchIndexes() {
  try {
    // 配置 poetry 索引的 filterable attributes
    const poetryIndex = client.index("poetry");
    await poetryIndex.updateFilterableAttributes(["author", "dynasty", "tags"]);
    console.log("✓ Configured filterable attributes for 'poetry' index: author, dynasty, tags");
  } catch (e: any) {
    // 如果索引不存在或已配置，忽略错误
    if (!e.message?.includes("index_not_found") && !e.message?.includes("already")) {
      console.warn("Warning: Could not configure poetry index filterable attributes:", e.message);
    }
  }

  try {
    // 配置 poets 索引的 filterable attributes
    const poetsIndex = client.index("poets");
    await poetsIndex.updateFilterableAttributes(["dynasty"]);
    console.log("✓ Configured filterable attributes for 'poets' index: dynasty");
  } catch (e: any) {
    // 如果索引不存在或已配置，忽略错误
    if (!e.message?.includes("index_not_found") && !e.message?.includes("already")) {
      console.warn("Warning: Could not configure poets index filterable attributes:", e.message);
    }
  }
}

// 初始化 PoemSnake 游戏（包括 WebSocket、游戏状态、房间清理等）
initializePoemSnake(io);

// 初始化 Poemle 寻花令游戏
setupPoemleSocket(io, onlineUsers);

// 配置 MeiliSearch 索引
configureMeiliSearchIndexes().catch((e) => {
  console.error("Error configuring MeiliSearch indexes:", e);
});

httpServer.listen(PORT, () => {
  console.log(`API listening on http://127.0.0.1:${PORT}`);
  console.log(`WebSocket server ready`);
});
