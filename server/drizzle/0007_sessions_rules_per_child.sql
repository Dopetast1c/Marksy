ALTER TABLE "sessions" ADD COLUMN "token_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "family_id" uuid;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD COLUMN "family_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD COLUMN "student_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD COLUMN "preset_key" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_rules_preset_key" ON "alert_rules" USING btree ("user_id","family_id","student_id","preset_key");--> statement-breakpoint
CREATE INDEX "alert_rules_student_idx" ON "alert_rules" USING btree ("student_id");