import { Router } from "express";
import { MeiliSearch } from "meilisearch";
import { requireWikiAdmin } from "./middleware";
import { getDb } from "./db";

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

      if (payload.wiki) {
        getDb().prepare("INSERT OR REPLACE INTO wiki_items (target_type, target_id, title, description, attributes) VALUES (?, ?, ?, ?, ?)").run(
          'poet', id, payload.name || payload.title || '', payload.dynasty || payload.description || '', JSON.stringify(payload.wiki_attributes || {})
        );
      } else {
        getDb().prepare("DELETE FROM wiki_items WHERE target_type = ? AND target_id = ?").run('poet', id);
      }
        const mp2={...payload,id};
        delete mp2.wiki;
        delete mp2.wiki_attributes;
        await client.index('poets').updateDocuments([mp2]);


      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.put("/api/wiki/poetry/:id", requireWikiAdmin, async (req, res) => {
    try {
      const id = req.params.id;
      const payload = req.body || {};

      if (payload.wiki) {
        getDb().prepare("INSERT OR REPLACE INTO wiki_items (target_type, target_id, title, description, attributes) VALUES (?, ?, ?, ?, ?)").run(
          'poetry', id, payload.title || payload.name || '', payload.author || payload.description || '', JSON.stringify(payload.wiki_attributes || {})
        );
      } else {
        getDb().prepare("DELETE FROM wiki_items WHERE target_type = ? AND target_id = ?").run('poetry', id);
      }
        const mp={...payload,id};
        delete mp.wiki;
        delete mp.wiki_attributes;
        await client.index('poetry').updateDocuments([mp]);


      res.json({ success: true });
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

  router.get("/api/popular", async (req, res) => {
    try {
      const poetRows = getDb().prepare("SELECT * FROM wiki_items WHERE target_type = 'poet'").all() as any[];
      const poetryRows = getDb().prepare("SELECT * FROM wiki_items WHERE target_type = 'poetry'").all() as any[];

      const mapToResponse = (rows: any[]) => rows.map(r => ({
        id: r.target_id,
        title: r.title,
        name: r.title,
        description: r.description,
        author: r.description,
        dynasty: r.description,
        wiki: true,
        wiki_attributes: JSON.parse(r.attributes || '{}')
      }));

      res.json({
        poets: mapToResponse(poetRows),
        poetry: mapToResponse(poetryRows)
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get("/api/wiki/attributes", async (req, res) => {
    try {
      const rows = getDb().prepare("SELECT * FROM wiki_attributes").all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post("/api/wiki/attributes", requireWikiAdmin, async (req, res) => {
    try {
      const { target_type, key, name, options } = req.body;
      if (!target_type || !key || !name || !options) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const existing = getDb().prepare("SELECT * FROM wiki_attributes WHERE target_type = ? AND key = ?").get(target_type, key);
      if (existing) {
        return res.status(400).json({ error: "属性 Key 已存在" });
      }
      const result = getDb().prepare("INSERT INTO wiki_attributes (target_type, key, name, options) VALUES (?, ?, ?, ?)").run(target_type, key, name, options);
      res.json({ id: result.lastInsertRowid });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.delete("/api/wiki/attributes/:id", requireWikiAdmin, async (req, res) => {
    try {
      getDb().prepare("DELETE FROM wiki_attributes WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.put("/api/wiki/batch_poets", requireWikiAdmin, async (req, res) => {
    try {
      const payload = req.body;
      if (!Array.isArray(payload)) return res.status(400).json({ error: "Expected array" });
      const db = getDb();
      db.transaction(() => {
        for (const item of payload) {
          if (item.wiki) {
            db.prepare("INSERT OR REPLACE INTO wiki_items (target_type, target_id, title, description, attributes) VALUES (?, ?, ?, ?, ?)").run(
              'poet', item.id, item.name || item.title || '', item.dynasty || item.description || '', JSON.stringify(item.wiki_attributes || {})
            );
          } else {
            db.prepare("DELETE FROM wiki_items WHERE target_type = ? AND target_id = ?").run('poet', item.id);
          }
        }
      })();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.put("/api/wiki/batch_poetry", requireWikiAdmin, async (req, res) => {
    try {
      const payload = req.body;
      if (!Array.isArray(payload)) return res.status(400).json({ error: "Expected array" });
      const db = getDb();
      db.transaction(() => {
        for (const item of payload) {
          if (item.wiki) {
            db.prepare("INSERT OR REPLACE INTO wiki_items (target_type, target_id, title, description, attributes) VALUES (?, ?, ?, ?, ?)").run(
              'poetry', item.id, item.title || item.name || '', item.author || item.description || '', JSON.stringify(item.wiki_attributes || {})
            );
          } else {
            db.prepare("DELETE FROM wiki_items WHERE target_type = ? AND target_id = ?").run('poetry', item.id);
          }
        }
      })();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
