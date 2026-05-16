import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Next.js は .env.local を自動で読むが、tsx スクリプトや Drizzle CLI から
// 直接 import されたときのフォールバック。
// 注意: dotenv は既存の env を上書きしないため、.env.local → .env の順で読む
// （.env.local を優先したい）。
if (!process.env.DATABASE_URL) {
  config({ path: ".env.local" });
  config({ path: ".env" });
}

const connectionString = process.env.DATABASE_URL!;

// Supabase の pooler(ポート 6543)経由のセッションは prepare を無効化
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
export type Database = typeof db;
