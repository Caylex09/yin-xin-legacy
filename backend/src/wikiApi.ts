import { Router } from "express";
import { MeiliSearch } from "meilisearch";
import { requireWikiAdmin } from "./middleware";

const MEILI_HOST = process.env.MEILI_HOST || "http://127.0.0.1:7700";
const MEILI_API_KEY = process.env.MEILI_API_KEY || "";

const client = new MeiliSearch({
  host: MEILI_HOST,
  apiKey: MEILI_API_KEY,
});

export function createWikiApiRouter(): Router {
  const router = Router();

  router.put("/api/wiki/poets/:id", requireWikiAdmin, async (req, res) => {
    try {
      const id = req.params.id;
      const payload = req.body || {};
      const result = await client.index("poets").updateDocuments([{ id, ...payload }]);
      res.json({ taskUid: result.taskUid });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.put("/api/wiki/poetry/:id", requireWikiAdmin, async (req, res) => {
    try {
      const id = req.params.id;
      const payload = req.body || {};
      const result = await client.index("poetry").updateDocuments([{ id, ...payload }]);
      res.json({ taskUid: result.taskUid });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post("/api/wiki/poets", requireWikiAdmin, async (req, res) => {
    try {
      const payload = req.body || {};
      if (!payload.avatar) payload.avatar = "avatar/yinxin.png";
      if (!payload.id) return res.status(400).json({ error: "缺少 id" });
      const result = await client.index("poets").addDocuments([payload]);
      res.json({ taskUid: result.taskUid });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post("/api/wiki/poetry", requireWikiAdmin, async (req, res) => {
    try {
      const payload = req.body || {};
      if (!payload.id) return res.status(400).json({ error: "缺少 id" });
      const result = await client.index("poetry").addDocuments([payload]);
      res.json({ taskUid: result.taskUid });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}

