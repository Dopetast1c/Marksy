ALTER TABLE "behaviour_events" ADD COLUMN "lesson_id" uuid;--> statement-breakpoint
ALTER TABLE "behaviour_events" ADD COLUMN "author_external_id" text;--> statement-breakpoint
ALTER TABLE "behaviour_events" ADD CONSTRAINT "behaviour_events_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "behaviour_events_student_date_idx" ON "behaviour_events" USING btree ("student_id","date");