ALTER TABLE "students" DROP CONSTRAINT "students_family_provider_external_key";--> statement-breakpoint
ALTER TABLE "student_identities" DROP CONSTRAINT "student_identities_family_id_families_id_fk";
--> statement-breakpoint
ALTER TABLE "students" DROP CONSTRAINT "students_family_id_families_id_fk";
--> statement-breakpoint
ALTER TABLE "students" DROP CONSTRAINT "students_diary_account_id_diary_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_family_id_families_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance" DROP CONSTRAINT "attendance_family_id_families_id_fk";
--> statement-breakpoint
ALTER TABLE "behaviour_events" DROP CONSTRAINT "behaviour_events_family_id_families_id_fk";
--> statement-breakpoint
ALTER TABLE "final_marks" DROP CONSTRAINT "final_marks_family_id_families_id_fk";
--> statement-breakpoint
ALTER TABLE "final_marks_raw" DROP CONSTRAINT "final_marks_raw_family_id_families_id_fk";
--> statement-breakpoint
ALTER TABLE "homework_items" DROP CONSTRAINT "homework_items_family_id_families_id_fk";
--> statement-breakpoint
ALTER TABLE "lessons" DROP CONSTRAINT "lessons_family_id_families_id_fk";
--> statement-breakpoint
ALTER TABLE "mark_events" DROP CONSTRAINT "mark_events_family_id_families_id_fk";
--> statement-breakpoint
ALTER TABLE "marks" DROP CONSTRAINT "marks_family_id_families_id_fk";
--> statement-breakpoint
ALTER TABLE "study_sessions" DROP CONSTRAINT "study_sessions_family_id_families_id_fk";
--> statement-breakpoint
DROP INDEX "students_account_idx";--> statement-breakpoint
DROP INDEX "users_family_idx";--> statement-breakpoint
DROP INDEX "lessons_family_idx";--> statement-breakpoint
DROP INDEX "marks_family_idx";--> statement-breakpoint
ALTER TABLE "user_student_access" DROP CONSTRAINT "user_student_access_user_id_student_id_pk";--> statement-breakpoint
ALTER TABLE "user_student_access" ALTER COLUMN "family_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_student_access" ADD CONSTRAINT "user_student_access_user_id_family_id_student_id_pk" PRIMARY KEY("user_id","family_id","student_id");--> statement-breakpoint
ALTER TABLE "student_identities" DROP COLUMN "family_id";--> statement-breakpoint
ALTER TABLE "students" DROP COLUMN "family_id";--> statement-breakpoint
ALTER TABLE "students" DROP COLUMN "diary_account_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "family_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "attendance" DROP COLUMN "family_id";--> statement-breakpoint
ALTER TABLE "behaviour_events" DROP COLUMN "family_id";--> statement-breakpoint
ALTER TABLE "final_marks" DROP COLUMN "family_id";--> statement-breakpoint
ALTER TABLE "final_marks_raw" DROP COLUMN "family_id";--> statement-breakpoint
ALTER TABLE "homework_items" DROP COLUMN "family_id";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN "family_id";--> statement-breakpoint
ALTER TABLE "mark_events" DROP COLUMN "family_id";--> statement-breakpoint
ALTER TABLE "marks" DROP COLUMN "family_id";--> statement-breakpoint
ALTER TABLE "study_sessions" DROP COLUMN "family_id";--> statement-breakpoint
ALTER TABLE "student_identities" ADD CONSTRAINT "student_identities_provider_external_key" UNIQUE("provider_id","external_id");--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_provider_external_key" UNIQUE("provider_id","external_id");