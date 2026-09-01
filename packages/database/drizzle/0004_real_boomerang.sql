CREATE TYPE "public"."file_status" AS ENUM('pending', 'ready', 'deleted');--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "status" "file_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "files_user_idx" ON "files" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "files_org_idx" ON "files" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "files_status_idx" ON "files" USING btree ("status");