import { Router, Request, Response } from 'express';
import { getDb } from '../../db';
import { searchClient } from '../../meiliClient';
import crypto from 'crypto';
import { PUNCTUATION } from './gamePoemle';
import { verifyToken } from '../../auth';

export const poemleRouter = Router();

// Cache daily poems in memory
let cachedDailyPoems: any = null;
let lastSeedStr = '';

function getDailySeedStr(): string {
    const d = new Date();
    // Adjust for China Standard Time (UTC+8)
    d.setUTCHours(d.getUTCHours() + 8);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function selectPoemsByTag(items: any[], tag: string): any[] {
    let filtered = items;
    if (tag) {
        filtered = items.filter(t => {
            try {
                const attrs = JSON.parse(t.attributes || '{}');
                const tags = attrs.tags || [];
                return tags.some((t: string) => t.includes(tag));
            } catch (e) {
                return false;
            }
        });
    }
    if (filtered.length === 0) filtered = items;
    return filtered;
}

// Fisher-Yates shuffle with seed
function shuffleArray(array: any[], seed: number) {
    let m = array.length, t, i;
    while (m) {
        // Simple pseudo-random number generator
        seed = (seed * 9301 + 49297) % 233280;
        i = Math.floor((seed / 233280) * m--);
        t = array[m];
        array[m] = array[i];
        array[i] = t;
    }
    return array;
}

async function generateDailyPoems() {
    const seedStr = getDailySeedStr();
    if (cachedDailyPoems && lastSeedStr === seedStr) {
        return cachedDailyPoems;
    }

    // Generate an integer seed for the day
    const hash = crypto.createHash('md5').update(seedStr).digest('hex');
    const seed = parseInt(hash.substring(0, 8), 16);

    const db = getDb();
    const poems = db.prepare("SELECT * FROM wiki_items WHERE target_type = 'poetry'").all() as any[];

    // Select candidate lists
    const qiyanItems = shuffleArray([...selectPoemsByTag(poems, "七言")], seed + 1);
    const wuyanItems = shuffleArray([...selectPoemsByTag(poems, "五言")], seed + 2);
    const freeItems = shuffleArray([...selectPoemsByTag(poems, "")], seed + 3);

    async function resolvePoemLine(items: any[], type: string, s: number) {
        if (!items || items.length === 0) return { id: '', line: '', title: '', author: '', authorName: '', dynasty: '未知' };

        let fallbackLine = '';
        let fallbackItem = items[0];
        let fallbackDoc: any;

        // Try up to 100 different poems to find one that guarantees the format
        for (let i = 0; i < Math.min(items.length, 100); i++) {
            const item = items[i];
            try {
                const doc = await searchClient.index("poetry").getDocument(item.target_id);
                const sentences: string[] = [];
                const iterate = (arr: any) => {
                    if (Array.isArray(arr)) {
                        for (const a of arr) iterate(a);
                    } else if (typeof arr === 'string') {
                        sentences.push(arr);
                    }
                }
                iterate(doc.content || []);

                const chunks = sentences.flatMap(str => str.match(/[^。！？；]+[。！？；]?/g) || []);
                let eligible = chunks.filter(chunk => {
                    const parts = chunk.split(/[，、,]/).map(x => Array.from(x).filter(c => !PUNCTUATION.has(c as string)).join('')).filter(x => x.length > 0);
                    if (parts.length !== 2) return false;
                    const len = parts[0].length + parts[1].length;
                    if (type === '七言') return parts[0].length === 7 && parts[1].length === 7;
                    if (type === '五言') return parts[0].length === 5 && parts[1].length === 5;
                    if (type === '自由') return len <= 20 && parts[0].length <= 10 && parts[1].length <= 10;
                    return true;
                });

                if (eligible.length > 0) {
                    const chosenLine = eligible[(s + i) % eligible.length] || '';
                    let authorName = doc.author || '';
                    let dynasty = '未知';
                    if (doc.author) {
                        try {
                            const poet = await searchClient.index('poets').getDocument(doc.author);
                            authorName = poet.name;
                            dynasty = poet.dynasty || dynasty;
                        } catch (e) { }
                    }

                    return {
                        id: item.target_id,
                        title: doc.title || '',
                        author: doc.author || '', authorName: authorName, dynasty: dynasty,
                        line: chosenLine
                    };
                }

                // If not eligible, maybe save as fallback
                if (i === 0 && chunks.length > 0) {
                    fallbackLine = chunks[s % chunks.length] || '';
                    fallbackItem = item;
                    fallbackDoc = doc;
                }
            } catch (e) {
                // Ignore and try next
            }
        }

        // If strict match fails for '五言' or '七言', return empty
        if (type === '五言' || type === '七言') {
            return { id: '', line: '', title: '', author: '', authorName: '', dynasty: '未知' };
        }

        // If we strictly cannot find any matching poem in our search limit, fall back to whatever we got
        let authorName = fallbackDoc?.author || '';
        let dynasty = '未知';
        if (fallbackDoc?.author) {
            try {
                const poet = await searchClient.index('poets').getDocument(fallbackDoc.author);
                authorName = poet.name;
                dynasty = poet.dynasty || dynasty;
            } catch (e) { }
        }

        return {
            id: fallbackItem.target_id,
            title: fallbackDoc?.title || '',
            author: fallbackDoc?.author || '',
            authorName: authorName,
            dynasty: dynasty,
            line: fallbackLine
        };
    }

    cachedDailyPoems = {
        qiyan: await resolvePoemLine(qiyanItems, '七言', seed + 1),
        wuyan: await resolvePoemLine(wuyanItems, '五言', seed + 2),
        free: await resolvePoemLine(freeItems, '自由', seed + 3),
        date: seedStr
    };
    lastSeedStr = seedStr;

    return cachedDailyPoems;
}

poemleRouter.get('/api/game/poemle/daily', async (req: Request, res: Response) => {
    try {
        const daily = await generateDailyPoems();
        res.json({ success: true, daily });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

let cachedCharFreqs: { char: string, count: number }[] | null = null;

poemleRouter.get('/api/game/poemle/chars', async (req: Request, res: Response) => {
    try {
        if (cachedCharFreqs) {
            return res.json({ success: true, chars: cachedCharFreqs });
        }

        const freq: Record<string, number> = {};
        const db = getDb();
        const poems = db.prepare("SELECT target_id FROM wiki_items WHERE target_type = 'poetry'").all() as any[];

        const promises = poems.map(p => searchClient.index("poetry").getDocument(p.target_id).catch(() => null));
        const docs = await Promise.all(promises);

        for (const doc of docs) {
            if (!doc) continue;
            const content = doc.content || [];
            const iterate = (arr: any) => {
                if (Array.isArray(arr)) {
                    for (const a of arr) iterate(a);
                } else if (typeof arr === 'string') {
                    for (const ch of arr) {
                        if (!PUNCTUATION.has(ch) && ch.trim()) {
                            freq[ch] = (freq[ch] || 0) + 1;
                        }
                    }
                }
            }
            iterate(content);
        }

        const sorted = Object.entries(freq).map(([char, count]) => ({ char, count })).sort((a, b) => b.count - a.count);
        // take top 300
        cachedCharFreqs = sorted.slice(0, 500);

        res.json({ success: true, chars: cachedCharFreqs });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

poemleRouter.post('/api/game/poemle/daily_complete', async (req: Request, res: Response) => {
    try {
        const auth = req.headers.authorization || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) return res.json({ success: false, error: "未登录" });

        let payload;
        try {
            payload = verifyToken(token) as { sub: number };
        } catch (e) {
            return res.json({ success: false, error: "无效的 token" });
        }
        const uid = payload.sub;

        const { type, date } = req.body;
        if (!['daily', 'daily5', 'daily7'].includes(type) || !date || typeof date !== 'string') {
            return res.json({ success: false, error: "参数错误" });
        }

        const reason = `Poemle每日挑战-${type}-${date}`;
        const db = getDb();

        const existing = db.prepare("SELECT 1 FROM score_history WHERE uid = ? AND reason = ?").get(uid, reason);
        if (existing) {
            return res.json({ success: true, claimed: false });
        }

        const update = db.transaction(() => {
            db.prepare("UPDATE users SET score = score + 50 WHERE uid = ?").run(uid);
            db.prepare("INSERT INTO score_history (uid, change_amount, reason, created_at) VALUES (?, ?, ?, ?)").run(uid, 50, reason, new Date().toISOString());
        });
        update();

        res.json({ success: true, claimed: true });
    } catch (e: any) {
        res.json({ success: false, error: e.message || "请求失败" });
    }
});

poemleRouter.post('/api/game/poemle/verify', async (req: Request, res: Response) => {
    try {
        const { guess, type } = req.body;
        if (!guess || typeof guess !== 'string') {
            return res.json({ success: false, error: 'Invalid guess' });
        }

        // Fast search using MeiliSearch
        const searchRes = await searchClient.index("poetry").search(guess, {
            limit: 20
        });

        const suggestions: string[] = [];

        for (const hit of searchRes.hits) {
            const sentences: string[] = [];
            const iterate = (arr: any) => {
                if (Array.isArray(arr)) {
                    for (const a of arr) iterate(a);
                } else if (typeof arr === 'string') {
                    sentences.push(arr);
                }
            }
            iterate(hit.content || []);

            const chunks = sentences.flatMap(str => str.match(/[^。！？；]+[。！？；]?/g) || []);
            for (const chunk of chunks) {
                const parts = chunk.split(/[，、,]/).map(x => Array.from(x).filter(c => !PUNCTUATION.has(c as string)).join('')).filter(x => x.length > 0);
                if (parts.length === 2) {
                    const cleanChunk = parts.join('');
                    if (cleanChunk === guess) {
                        if (type === '五言' && (parts[0].length !== 5 || parts[1].length !== 5)) continue;
                        if (type === '七言' && (parts[0].length !== 7 || parts[1].length !== 7)) continue;
                        if (type === '自由' && (parts[0].length > 10 || parts[1].length > 10)) continue;
                        return res.json({ success: true, valid: true, structure: [parts[0].length, parts[1].length] });
                    }
                    if (suggestions.length < 3 && cleanChunk.includes(guess)) {
                        if (type === '五言' && parts[0].length === 5 && parts[1].length === 5) {
                            suggestions.push(chunk);
                        } else if (type === '七言' && parts[0].length === 7 && parts[1].length === 7) {
                            suggestions.push(chunk);
                        } else if (type === '自由') {
                            suggestions.push(chunk);
                        }
                    }
                }
            }
        }

        res.json({
            success: true,
            valid: false,
            suggestions: Array.from(new Set(suggestions)).slice(0, 3)
        });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export function createPoemleApiRouter() {
    return poemleRouter;
}