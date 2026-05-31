CREATE TABLE "regular_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"tutor_id" uuid NOT NULL,
	"weekday" "weekday" NOT NULL,
	"slot_number" smallint NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"confirmed_by" uuid NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regular_assignments_weekday_not_sun_chk" CHECK ("regular_assignments"."weekday" <> 'sun'),
	CONSTRAINT "regular_assignments_slot_range_chk" CHECK ("regular_assignments"."slot_number" BETWEEN 1 AND 20),
	CONSTRAINT "regular_assignments_date_range_chk" CHECK ("regular_assignments"."effective_to" IS NULL OR "regular_assignments"."effective_from" <= "regular_assignments"."effective_to")
);
--> statement-breakpoint
ALTER TABLE "regular_assignments" ADD CONSTRAINT "regular_assignments_period_id_regular_shift_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."regular_shift_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regular_assignments" ADD CONSTRAINT "regular_assignments_tutor_id_profiles_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regular_assignments" ADD CONSTRAINT "regular_assignments_confirmed_by_profiles_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "regular_assignments_tutor_period_idx" ON "regular_assignments" USING btree ("tutor_id","period_id");--> statement-breakpoint
CREATE INDEX "regular_assignments_period_idx" ON "regular_assignments" USING btree ("period_id");--> statement-breakpoint

-- RLS lockdown for the new table (Issue #11 policy, see 0007_rls.sql)
ALTER TABLE "regular_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "regular_assignments" FROM anon, authenticated;--> statement-breakpoint

-- Issue #74 (δ): 旧 monthly_regular_assignments を破棄。
-- 実験段階のため既存データは破棄方針 (ユーザー承認済)。
-- 新確定は regular_assignments に effective_from/to で記録し、月境界での
-- 期途中変更も将来サポートする。
DROP TABLE "monthly_regular_assignments";