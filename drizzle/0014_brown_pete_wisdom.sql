CREATE TYPE "public"."shift_submission_status" AS ENUM('draft', 'submitted', 'frozen');--> statement-breakpoint
ALTER TABLE "fixed_shift_submissions" ADD COLUMN "status" "shift_submission_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "fixed_shift_submissions" ADD COLUMN "submitted_at" timestamp with time zone;