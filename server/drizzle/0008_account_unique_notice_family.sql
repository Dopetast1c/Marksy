ALTER TABLE "notifications" ADD COLUMN "family_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "diary_accounts_external_user_key" ON "diary_accounts" USING btree ("provider_id","external_user_id");--> statement-breakpoint
CREATE INDEX "notifications_family_idx" ON "notifications" USING btree ("family_id");