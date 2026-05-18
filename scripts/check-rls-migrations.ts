/**
 * 静的 RLS ガード (CI 用・DB 非接続)。
 *
 * drizzle/*.sql を全部読み、`CREATE TABLE` された各 public テーブルに
 * 対して、いずれかの migration で
 *   - ENABLE ROW LEVEL SECURITY
 *   - REVOKE ALL ... FROM anon, authenticated
 * が宣言されているかを検証する。1つでも欠ければ exit 1。
 *
 * 新規 public テーブルを RLS 無しで追加した PR を CI で落とすのが目的
 * (Supabase の default privileges で anon に再付与され PII 漏洩するため)。
 *
 * Usage: tsx scripts/check-rls-migrations.ts
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "drizzle";

function loadSql(): string {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return files.map((f) => readFileSync(join(DIR, f), "utf8")).join("\n");
}

function matchAll(re: RegExp, s: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out.push(m[1]);
  return out;
}

function main() {
  const sql = loadSql();

  // CREATE TABLE "x" ( ... )  — schema 無し(public)のみ対象
  const created = new Set(
    matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?"([a-z0-9_]+)"/gi, sql),
  );
  // DROP TABLE は本プロジェクトでは未使用だが、将来用に除外
  for (const t of matchAll(/drop\s+table\s+(?:if\s+exists\s+)?"([a-z0-9_]+)"/gi, sql)) {
    created.delete(t);
  }

  const rlsEnabled = new Set(
    matchAll(
      /alter\s+table\s+"([a-z0-9_]+)"\s+enable\s+row\s+level\s+security/gi,
      sql,
    ),
  );
  const revoked = new Set(
    matchAll(
      /revoke\s+all\s+on\s+"([a-z0-9_]+)"\s+from\s+anon\s*,\s*authenticated/gi,
      sql,
    ),
  );

  const missingRls: string[] = [];
  const missingRevoke: string[] = [];
  for (const t of [...created].sort()) {
    if (!rlsEnabled.has(t)) missingRls.push(t);
    if (!revoked.has(t)) missingRevoke.push(t);
  }

  console.log(`public tables created: ${created.size}`);
  console.log(`  RLS enabled : ${rlsEnabled.size}`);
  console.log(`  anon/auth REVOKEd: ${revoked.size}`);

  if (missingRls.length === 0 && missingRevoke.length === 0) {
    console.log("✓ 全 public テーブルに RLS + REVOKE が宣言済み");
    process.exit(0);
  }

  if (missingRls.length > 0) {
    console.error(
      `✗ RLS 未有効: ${missingRls.join(", ")}\n` +
        `  → migration に ALTER TABLE "<t>" ENABLE ROW LEVEL SECURITY; を追加`,
    );
  }
  if (missingRevoke.length > 0) {
    console.error(
      `✗ anon/authenticated 未 REVOKE: ${missingRevoke.join(", ")}\n` +
        `  → migration に REVOKE ALL ON "<t>" FROM anon, authenticated; を追加`,
    );
  }
  process.exit(1);
}

main();
