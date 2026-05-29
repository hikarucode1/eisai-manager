CREATE TABLE "monthly_submission_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_month" date NOT NULL,
	"submission_opens_at" timestamp with time zone NOT NULL,
	"submission_due_at" timestamp with time zone NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_submission_periods_target_month_unique" UNIQUE("target_month")
);
--> statement-breakpoint
ALTER TABLE "fixed_shift_submissions" ADD COLUMN "period_id" uuid;--> statement-breakpoint
ALTER TABLE "monthly_submission_periods" ADD CONSTRAINT "monthly_submission_periods_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_shift_submissions" ADD CONSTRAINT "fixed_shift_submissions_period_id_monthly_submission_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."monthly_submission_periods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fixed_shift_submissions_period_idx" ON "fixed_shift_submissions" USING btree ("period_id");--> statement-breakpoint

-- RLS lockdown for the new table (Issue #11 policy, see 0007_rls.sql)
ALTER TABLE "monthly_submission_periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "monthly_submission_periods" FROM anon, authenticated;