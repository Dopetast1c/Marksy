CREATE TABLE "family_students" (
	"family_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"linked_by" uuid,
	CONSTRAINT "family_students_family_id_student_id_pk" PRIMARY KEY("family_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_user_id_family_id_pk" PRIMARY KEY("user_id","family_id")
);
--> statement-breakpoint
CREATE TABLE "student_sources" (
	"student_id" uuid NOT NULL,
	"diary_account_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"active" boolean DEFAULT false NOT NULL,
	CONSTRAINT "student_sources_student_id_diary_account_id_pk" PRIMARY KEY("student_id","diary_account_id")
);
--> statement-breakpoint
CREATE TABLE "bell_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"label" text,
	"days" integer[] NOT NULL,
	"periods" jsonb NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "week_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"term_id" uuid,
	"cycle_weeks" integer DEFAULT 1 NOT NULL,
	"entries" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "school_label" text;--> statement-breakpoint
ALTER TABLE "user_student_access" ADD COLUMN "family_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "short_name" text;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "teacher_external_id" text;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "group_label" text;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "level_label" text;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "lessons_per_week" real;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "room" text;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "group_label" text;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "template_ref" text;--> statement-breakpoint
ALTER TABLE "family_students" ADD CONSTRAINT "family_students_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_students" ADD CONSTRAINT "family_students_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_students" ADD CONSTRAINT "family_students_linked_by_users_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sources" ADD CONSTRAINT "student_sources_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sources" ADD CONSTRAINT "student_sources_diary_account_id_diary_accounts_id_fk" FOREIGN KEY ("diary_account_id") REFERENCES "public"."diary_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bell_schedules" ADD CONSTRAINT "bell_schedules_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bell_schedules" ADD CONSTRAINT "bell_schedules_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_templates" ADD CONSTRAINT "week_templates_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_templates" ADD CONSTRAINT "week_templates_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_students_student_idx" ON "family_students" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "memberships_family_idx" ON "memberships" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "student_sources_account_idx" ON "student_sources" USING btree ("diary_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_sources_one_active" ON "student_sources" USING btree ("student_id") WHERE "student_sources"."active";--> statement-breakpoint
CREATE INDEX "bell_schedules_student_idx" ON "bell_schedules" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "week_templates_student_idx" ON "week_templates" USING btree ("student_id");--> statement-breakpoint
ALTER TABLE "user_student_access" ADD CONSTRAINT "user_student_access_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Carry the existing rows over to the child / family split (docs/design.md 7.1). The migrator applies every pending
-- migration in one transaction, so with 0003 (which drops the old columns) this either all lands or nothing changes.
-- Each user gets one membership with their role; each child one active link to their family, with the family's number
-- rules moved to the link; each child read through an account one active source.
INSERT INTO "memberships" ("user_id", "family_id", "role", "created_at")
  SELECT "id", "family_id", "role", "created_at" FROM "users";--> statement-breakpoint
INSERT INTO "family_students" ("family_id", "student_id", "status", "settings", "linked_at")
  SELECT s."family_id", s."id", 'active',
         jsonb_strip_nulls(jsonb_build_object('low_mark', f."settings"->'low_mark', 'drop_step', f."settings"->'drop_step')),
         s."created_at"
  FROM "students" s JOIN "families" f ON f."id" = s."family_id";--> statement-breakpoint
INSERT INTO "student_sources" ("student_id", "diary_account_id", "external_id", "active")
  SELECT "id", "diary_account_id", "external_id", true FROM "students" WHERE "diary_account_id" IS NOT NULL;--> statement-breakpoint
UPDATE "user_student_access" a SET "family_id" = u."family_id" FROM "users" u WHERE u."id" = a."user_id";--> statement-breakpoint
UPDATE "families" SET "settings" = "settings" - 'sync_window' - 'low_mark' - 'drop_step';
