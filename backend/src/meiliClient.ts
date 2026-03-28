import { MeiliSearch } from "meilisearch";
import * as dotenv from 'dotenv';
dotenv.config();

const MEILI_HOST = process.env.MEILI_HOST || "http://127.0.0.1:7700";
const MEILI_API_KEY = process.env.MEILI_API_KEY || "";

export const searchClient = new MeiliSearch({
    host: MEILI_HOST,
    apiKey: MEILI_API_KEY,
});
