ALTER TABLE "notifications" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "category" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD COLUMN "invalidated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifs_user_read_created_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "notifs_org_idx" ON "notifications" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "push_tokens_device_idx" ON "push_tokens" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "push_tokens_user_active_idx" ON "push_tokens" USING btree ("user_id","invalidated_at");