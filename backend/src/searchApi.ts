import { Router, Request, Response } from "express";
import { MeiliSearch } from "meilisearch";

const MEILI_HOST = process.env.MEILI_HOST || "http://127.0.0.1:7700";
const MEILI_API_KEY = process.env.MEILI_API_KEY || "";

const client = new MeiliSearch({
  host: MEILI_HOST,
  apiKey: MEILI_API_KEY,
});

type PoetrySearchBody = {
  q?: string;
  limit?: number;
  offset?: number;
  dynasty?: string;
  tags?: string[] | string;
  authorId?: string;
};

type PoetSearchBody = {
  q?: string;
  limit?: number;
  offset?: number;
  dynasty?: string;
};

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

export function createSearchApiRouter(): Router {
  const router = Router();

  // 在路由创建时配置索引（异步执行，不阻塞）
  configureMeiliSearchIndexes().catch((e) => {
    console.error("Error configuring MeiliSearch indexes:", e);
  });

  router.post("/api/search/poetry", async (req: Request, res: Response) => {
    const {
      q = "",
      limit = 10,
      offset = 0,
      dynasty,
      tags,
      authorId,
    } = req.body as PoetrySearchBody;

    const filter: string[] = [];
    if (dynasty) filter.push(`dynasty = "${dynasty}"`);
    const tagList = Array.isArray(tags) ? tags : tags ? [tags] : [];
    for (const tag of tagList) filter.push(`tags = "${tag}"`);
    if (authorId) filter.push(`author = "${authorId}"`);

    try {
      const result = await client.index("poetry").search(q, {
        limit: Number(limit) || 10,
        offset: Number(offset) || 0,
        filter: filter.length ? filter : undefined,
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get("/api/poetry/random", async (_req, res) => {
    try {
      const idx = client.index("poetry");
      const stats: any = await idx.getStats();
      const total = stats.numberOfDocuments || 0;
      if (!total) return res.status(404).json({ error: "no poetry data" });
      const offset = Math.floor(Math.random() * total);
      const docs = await idx.getDocuments({ limit: 1, offset, fields: ["id", "title", "author", "dynasty", "content", "translation", "appreciation", "tags"] });
      if (!docs.results || !docs.results.length) return res.status(404).json({ error: "not found" });
      res.json(docs.results[0]);
    } catch (e: any) {
      res.status(500).json({ error: (e as Error).message || "unknown error" });
    }
  });

  router.get("/api/poetry/random-line", async (_req, res) => {
    try {
      const idx = client.index("poetry");
      const stats: any = await idx.getStats();
      const total = stats.numberOfDocuments || 0;
      if (!total) return res.status(404).json({ error: "no poetry data" });
      const offset = Math.floor(Math.random() * total);
      const docs = await idx.getDocuments({
        limit: 1,
        offset,
        fields: ["id", "title", "author", "dynasty", "content"],
      });
      if (!docs.results || !docs.results.length) return res.status(404).json({ error: "not found" });
      const doc = docs.results[0] as any;
      const sentences: string[] = [];
      if (Array.isArray(doc.content)) {
        for (const seg of doc.content) {
          if (Array.isArray(seg)) {
            for (const s of seg) {
              if (s) sentences.push(String(s));
            }
          } else if (seg) {
            sentences.push(String(seg));
          }
        }
      } else if (doc.content) {
        sentences.push(String(doc.content));
      }
      if (!sentences.length) sentences.push(doc.title || ""); // 兜底
      const sentence = sentences[Math.floor(Math.random() * sentences.length)] || "";
      res.json({
        id: doc.id,
        title: doc.title,
        author: doc.author,
        dynasty: doc.dynasty,
        sentence,
      });
    } catch (e: any) {
      res.status(500).json({ error: (e as Error).message || "unknown error" });
    }
  });

  router.get("/api/poetry/:id", async (req, res) => {
    try {
      if (req.params.id === "random") {
        return res.redirect(302, "/api/poetry/random");
      }
      const doc = await client.index("poetry").getDocument(req.params.id);
      res.json(doc);
    } catch (e: any) {
      const msg = (e as any)?.message || "";
      if (msg.includes("document not found") || (e as any)?.code === "document_not_found") {
        return res.status(404).json({ error: "poetry not found" });
      }
      res.status(500).json({ error: msg || "unknown error" });
    }
  });

  router.get("/api/poets/:id", async (req, res) => {
    try {
      const doc = await client.index("poets").getDocument(req.params.id);
      res.json(doc);
    } catch (e: any) {
      const msg = (e as any)?.message || "";
      if (msg.includes("document not found") || (e as any)?.code === "document_not_found") {
        return res.status(404).json({ error: "poet not found" });
      }
      res.status(500).json({ error: msg || "unknown error" });
    }
  });

  router.post("/api/search/poets", async (req: Request, res: Response) => {
    const { q = "", limit = 10, offset = 0, dynasty } = req.body as PoetSearchBody;

    const filter: string[] = [];
    if (dynasty) filter.push(`dynasty = "${dynasty}"`);

    try {
      const result = await client.index("poets").search(q, {
        limit: Number(limit) || 10,
        offset: Number(offset) || 0,
        filter: filter.length ? filter : undefined,
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}

