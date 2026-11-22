ALTER TABLE "provider_memo" ADD COLUMN "student_id" uuid;--> statement-breakpoint
ALTER TABLE "provider_memo" ADD CONSTRAINT "provider_memo_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
