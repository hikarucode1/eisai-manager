CREATE TYPE "public"."shift_submission_status" AS ENUM('draft', 'submitted', 'frozen');--> statement-breakpoint
ALTER TABLE "fixed_shift_submissions" ADD COLUMN "status" "shift_submission_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "fixed_shift_submissions" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fixed_shift_submissions" ADD COLUMN "last_status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fixed_shift_submissions" ADD COLUMN "last_status_changed_by" uuid;--> statement-breakpoint
ALTER TABLE "fixed_shift_submissions" ADD CONSTRAINT "fixed_shift_submissions_last_status_changed_by_profiles_id_fk" FOREIGN KEY ("last_status_changed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_shift_submissions" ADD CONSTRAINT "fixed_shift_submissions_status_submitted_at_chk" CHECK (("fixed_shift_submissions"."status" = 'submitted' AND "fixed_shift_submissions"."submitted_at" IS NOT NULL)
        OR ("fixed_shift_submissions"."status" = 'draft' AND "fixed_shift_submissions"."submitted_at" IS NULL)
        OR ("fixed_shift_submissions"."status" = 'frozen'));