-- β #72: 旧 monthly_submission_periods 参照を regular_shift_periods 参照に切替。
-- 旧 period_id は新テーブルに存在しないため、新 FK 追加前に NULL リセット
-- (実験段階で再関連付けは新規提出時に行う前提)。
UPDATE "fixed_shift_submissions" SET "period_id" = NULL WHERE "period_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "fixed_shift_submissions" DROP CONSTRAINT "fixed_shift_submissions_period_id_monthly_submission_periods_id_fk";
--> statement-breakpoint
ALTER TABLE "fixed_shift_submissions" ADD CONSTRAINT "fixed_shift_submissions_period_id_regular_shift_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."regular_shift_periods"("id") ON DELETE set null ON UPDATE no action;