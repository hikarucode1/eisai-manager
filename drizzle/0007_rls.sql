-- RLS lockdown (Issue #11)
--
-- 全データアクセスは postgres ロール (rolbypassrls=true) 経由のサーバー仲介。
-- anon / authenticated は GoTrue 認証専用で、public テーブルを JWT で直接
-- 参照しない。よって全 public テーブルで RLS を有効化し、anon/authenticated の
-- テーブル権限を REVOKE して PostgREST 経由の直接アクセスを完全に遮断する。
-- (postgres は BYPASSRLS かつ owner のため、アプリ側クエリは影響を受けない)
--
-- 細粒度の JWT ポリシー (講師は自分の行のみ 等) は、クライアント直 DB
-- アクセスを導入するまで dead code になるため意図的に見送り。

ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "slot_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fixed_shifts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "training_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "training_period_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shift_uploads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "weekly_shifts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shift_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "absence_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "swap_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "swap_applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

REVOKE ALL ON "profiles" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "slot_definitions" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "periods" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "fixed_shifts" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "training_preferences" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "training_period_notes" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "shift_uploads" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "weekly_shifts" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "students" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "shift_assignments" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "absence_requests" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "swap_requests" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "swap_applications" FROM anon, authenticated;
