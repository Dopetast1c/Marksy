CREATE TABLE "diary_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"tenant" jsonb,
	"role" text NOT NULL,
	"label" text NOT NULL,
	"credentials_enc" "bytea",
	"external_user_id" text,
	"status" text DEFAULT 'ok' NOT NULL,
	"last_ok_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"paused_until" timestamp with time zone,
	"pause_hours" integer,
	"requires_action" text,
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"alerted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consent_version" text,
	"consent_at" timestamp with time zone,
	"consent_by" uuid
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"code" text PRIMARY KEY NOT NULL,
	"family_id" uuid NOT NULL,
	"created_by" uuid,
	"role" text NOT NULL,
	"student_ids" uuid[] DEFAULT '{}' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_by" uuid,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"from_user_id" uuid,
	"diary_account_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "student_identities" (
	"provider_id" text NOT NULL,
	"external_id" text NOT NULL,
	"student_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	CONSTRAINT "student_identities_provider_id_external_id_student_id_pk" PRIMARY KEY("provider_id","external_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"diary_account_id" uuid,
	"provider_id" text NOT NULL,
	"external_id" text NOT NULL,
	"full_name" text NOT NULL,
	"given_name" text,
	"family_name" text,
	"display_name" text,
	"school_id" text,
	"class_external_id" text,
	"class_label" text,
	"grade" integer,
	"grade_label" text,
	"grading_scale_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"avatar" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_family_provider_external_key" UNIQUE("family_id","provider_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "user_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_student_access" (
	"user_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	CONSTRAINT "user_student_access_user_id_student_id_pk" PRIMARY KEY("user_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"role" text NOT NULL,
	"login" text NOT NULL,
	"display_name" text NOT NULL,
	"locale" text DEFAULT 'ru' NOT NULL,
	"ui_mode" text DEFAULT 'full' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"avatar" jsonb,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_year_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	CONSTRAINT "holidays_year_range_key" UNIQUE("school_year_id","start_date","end_date")
);
--> statement-breakpoint
CREATE TABLE "school_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"external_id" text NOT NULL,
	"label" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"source" text DEFAULT 'api' NOT NULL,
	CONSTRAINT "school_years_student_external_key" UNIQUE("student_id","provider_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "student_years" (
	"student_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"class_label" text,
	"grade" integer,
	"grading_scale_id" text,
	CONSTRAINT "student_years_student_id_school_year_id_pk" PRIMARY KEY("student_id","school_year_id")
);
--> statement-breakpoint
CREATE TABLE "subject_colors" (
	"student_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"color" text,
	"set_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subject_colors_student_id_subject_id_pk" PRIMARY KEY("student_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "subject_goals" (
	"student_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"term_goal" text,
	"set_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subject_goals_student_id_subject_id_pk" PRIMARY KEY("student_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "subject_links" (
	"student_id" uuid NOT NULL,
	"from_subject_id" uuid NOT NULL,
	"to_subject_id" uuid NOT NULL,
	CONSTRAINT "subject_links_from_subject_id_to_subject_id_pk" PRIMARY KEY("from_subject_id","to_subject_id")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"name_norm" text NOT NULL,
	"teacher_name" text,
	"level" text,
	"credits" real,
	"grading_scheme" jsonb,
	CONSTRAINT "subjects_student_year_external_key" UNIQUE("student_id","school_year_id","provider_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_year_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"kind" text NOT NULL,
	"index" integer NOT NULL,
	"label" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	CONSTRAINT "terms_year_external_key" UNIQUE("school_year_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"external_id" text NOT NULL,
	"date" date NOT NULL,
	"lesson_id" uuid,
	"subject_id" uuid,
	"status" text NOT NULL,
	"excused" boolean,
	"code" text,
	"minutes" integer,
	"reason" text,
	"source" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "attendance_student_external_key" UNIQUE("student_id","provider_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "behaviour_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"external_id" text NOT NULL,
	"date" date NOT NULL,
	"points" real,
	"polarity" text NOT NULL,
	"category" text,
	"comment" text,
	"subject_id" uuid,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "behaviour_events_student_external_key" UNIQUE("student_id","provider_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "final_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"subject_id" uuid,
	"subject_name" text NOT NULL,
	"period_id" uuid,
	"role" text DEFAULT 'final' NOT NULL,
	"criterion" text,
	"label" text,
	"date" date,
	"raw" text NOT NULL,
	"mark" double precision,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"entered_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "final_marks_student_year_subject_period_key" UNIQUE NULLS NOT DISTINCT("student_id","school_year_id","subject_name","period_id")
);
--> statement-breakpoint
CREATE TABLE "final_marks_raw" (
	"student_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"raw_json" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "final_marks_raw_student_id_school_year_id_pk" PRIMARY KEY("student_id","school_year_id")
);
--> statement-breakpoint
CREATE TABLE "homework_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"provider_id" text,
	"external_id" text,
	"subject_id" uuid,
	"lesson_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"set_date" date,
	"due_date" date,
	"source" text NOT NULL,
	"created_by" uuid,
	"mark_id" uuid,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"external_id" text NOT NULL,
	"date" date NOT NULL,
	"slot" integer,
	"start_time" text,
	"end_time" text,
	"subject_id" uuid NOT NULL,
	"subject_name" text NOT NULL,
	"teacher_external_id" text,
	"teacher_name" text,
	"lesson_type" text,
	"topic" text,
	"homework" text,
	"homework_due_date" date,
	"has_attachments" boolean DEFAULT false NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "lessons_student_external_key" UNIQUE("student_id","provider_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "mark_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"mark_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"diff" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mark_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mark_id" uuid NOT NULL,
	"seen_at" timestamp with time zone NOT NULL,
	"raw_mark" text NOT NULL,
	"kind" text NOT NULL,
	"work_type" text,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"external_id" text NOT NULL,
	"lesson_id" uuid,
	"date" date NOT NULL,
	"posted_at" date,
	"subject_id" uuid NOT NULL,
	"raw" text NOT NULL,
	"kind" text NOT NULL,
	"values" double precision[] DEFAULT '{}' NOT NULL,
	"scale_id" text,
	"work_type" text,
	"work_type_raw" text,
	"title" text,
	"assessment_type" text,
	"dimension" text,
	"criterion" text,
	"weight" real,
	"max_points" real,
	"modifier" text,
	"status" text,
	"cohort" jsonb,
	"comment" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marks_student_external_key" UNIQUE("student_id","provider_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_overrides" (
	"student_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"cancelled" boolean NOT NULL,
	"set_by" uuid,
	"set_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lesson_overrides_student_id_lesson_id_pk" PRIMARY KEY("student_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_prep" (
	"student_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"done_at" timestamp with time zone NOT NULL,
	"done_by" uuid,
	CONSTRAINT "lesson_prep_student_id_lesson_id_pk" PRIMARY KEY("student_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_prep_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"by" uuid,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_session_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"subject_id" uuid,
	"lesson_id" uuid,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"active_sec" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"note" text,
	"inferred_from" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_drift_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_run_id" uuid,
	"provider_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"kind" text NOT NULL,
	"path" text NOT NULL,
	"sample" jsonb,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"acknowledged_at" timestamp with time zone,
	CONSTRAINT "api_drift_events_key" UNIQUE("provider_id","endpoint","kind","path")
);
--> statement-breakpoint
CREATE TABLE "raw_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_run_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" integer NOT NULL,
	"body" jsonb,
	"student_id" uuid,
	"week_start" date,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_coverage" (
	"student_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"run_id" uuid,
	"status" text NOT NULL,
	CONSTRAINT "sync_coverage_student_id_week_start_pk" PRIMARY KEY("student_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "sync_daily" (
	"diary_account_id" uuid NOT NULL,
	"date" date NOT NULL,
	"runs" integer NOT NULL,
	"failures" integer NOT NULL,
	"requests" integer NOT NULL,
	CONSTRAINT "sync_daily_diary_account_id_date_pk" PRIMARY KEY("diary_account_id","date")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"diary_account_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"kind" text NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"error_class" text,
	"error" text,
	"requests" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "term_rescans" (
	"term_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"last_full_rescan_at" timestamp with time zone,
	"post_term_rescan_done" boolean DEFAULT false NOT NULL,
	CONSTRAINT "term_rescans_term_id_student_id_pk" PRIMARY KEY("term_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event" text NOT NULL,
	"condition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"when" text DEFAULT 'now' NOT NULL,
	"channel" text DEFAULT 'all' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"student_id" uuid,
	"rule_id" uuid,
	"event_key" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"params" jsonb,
	"link" text,
	"channels" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "telegram_link_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_seen" (
	"user_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_seen_user_id_student_id_pk" PRIMARY KEY("user_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_tag_hits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"source_lesson_id" uuid,
	"due_lesson_id" uuid NOT NULL,
	"due_date" date NOT NULL,
	"field" text NOT NULL,
	"snippet" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "lesson_tag_hits_tag_due_key" UNIQUE("tag_id","due_lesson_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"icon" text,
	"tone" text DEFAULT 'normal' NOT NULL,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"fields" text[] DEFAULT '{"topic","homework"}' NOT NULL,
	"lesson_types" text[],
	"subject_names" text[] DEFAULT '{}' NOT NULL,
	"student_ids" uuid[],
	"prep_days" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"preset_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diary_accounts" ADD CONSTRAINT "diary_accounts_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_diary_account_id_diary_accounts_id_fk" FOREIGN KEY ("diary_account_id") REFERENCES "public"."diary_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_identities" ADD CONSTRAINT "student_identities_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_identities" ADD CONSTRAINT "student_identities_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_diary_account_id_diary_accounts_id_fk" FOREIGN KEY ("diary_account_id") REFERENCES "public"."diary_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_files" ADD CONSTRAINT "user_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_student_access" ADD CONSTRAINT "user_student_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_student_access" ADD CONSTRAINT "user_student_access_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_years" ADD CONSTRAINT "school_years_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_years" ADD CONSTRAINT "student_years_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_years" ADD CONSTRAINT "student_years_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_colors" ADD CONSTRAINT "subject_colors_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_colors" ADD CONSTRAINT "subject_colors_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_colors" ADD CONSTRAINT "subject_colors_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_goals" ADD CONSTRAINT "subject_goals_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_goals" ADD CONSTRAINT "subject_goals_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_goals" ADD CONSTRAINT "subject_goals_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_links" ADD CONSTRAINT "subject_links_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_links" ADD CONSTRAINT "subject_links_from_subject_id_subjects_id_fk" FOREIGN KEY ("from_subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_links" ADD CONSTRAINT "subject_links_to_subject_id_subjects_id_fk" FOREIGN KEY ("to_subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behaviour_events" ADD CONSTRAINT "behaviour_events_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behaviour_events" ADD CONSTRAINT "behaviour_events_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behaviour_events" ADD CONSTRAINT "behaviour_events_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_marks" ADD CONSTRAINT "final_marks_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_marks" ADD CONSTRAINT "final_marks_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_marks" ADD CONSTRAINT "final_marks_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_marks" ADD CONSTRAINT "final_marks_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_marks" ADD CONSTRAINT "final_marks_period_id_terms_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_marks" ADD CONSTRAINT "final_marks_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_marks_raw" ADD CONSTRAINT "final_marks_raw_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_marks_raw" ADD CONSTRAINT "final_marks_raw_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_marks_raw" ADD CONSTRAINT "final_marks_raw_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_items" ADD CONSTRAINT "homework_items_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_items" ADD CONSTRAINT "homework_items_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_items" ADD CONSTRAINT "homework_items_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_items" ADD CONSTRAINT "homework_items_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_items" ADD CONSTRAINT "homework_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_items" ADD CONSTRAINT "homework_items_mark_id_marks_id_fk" FOREIGN KEY ("mark_id") REFERENCES "public"."marks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mark_events" ADD CONSTRAINT "mark_events_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mark_events" ADD CONSTRAINT "mark_events_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mark_events" ADD CONSTRAINT "mark_events_mark_id_marks_id_fk" FOREIGN KEY ("mark_id") REFERENCES "public"."marks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mark_history" ADD CONSTRAINT "mark_history_mark_id_marks_id_fk" FOREIGN KEY ("mark_id") REFERENCES "public"."marks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_overrides" ADD CONSTRAINT "lesson_overrides_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_overrides" ADD CONSTRAINT "lesson_overrides_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_overrides" ADD CONSTRAINT "lesson_overrides_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_prep" ADD CONSTRAINT "lesson_prep_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_prep" ADD CONSTRAINT "lesson_prep_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_prep" ADD CONSTRAINT "lesson_prep_done_by_users_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_prep_events" ADD CONSTRAINT "lesson_prep_events_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_prep_events" ADD CONSTRAINT "lesson_prep_events_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_prep_events" ADD CONSTRAINT "lesson_prep_events_by_users_id_fk" FOREIGN KEY ("by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_session_events" ADD CONSTRAINT "study_session_events_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_drift_events" ADD CONSTRAINT "api_drift_events_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_responses" ADD CONSTRAINT "raw_responses_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_responses" ADD CONSTRAINT "raw_responses_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_coverage" ADD CONSTRAINT "sync_coverage_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_coverage" ADD CONSTRAINT "sync_coverage_run_id_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."sync_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_daily" ADD CONSTRAINT "sync_daily_diary_account_id_diary_accounts_id_fk" FOREIGN KEY ("diary_account_id") REFERENCES "public"."diary_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_diary_account_id_diary_accounts_id_fk" FOREIGN KEY ("diary_account_id") REFERENCES "public"."diary_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_rescans" ADD CONSTRAINT "term_rescans_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_rescans" ADD CONSTRAINT "term_rescans_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_seen" ADD CONSTRAINT "user_seen_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_seen" ADD CONSTRAINT "user_seen_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_tag_hits" ADD CONSTRAINT "lesson_tag_hits_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_tag_hits" ADD CONSTRAINT "lesson_tag_hits_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_tag_hits" ADD CONSTRAINT "lesson_tag_hits_tag_id_lesson_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."lesson_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_tag_hits" ADD CONSTRAINT "lesson_tag_hits_source_lesson_id_lessons_id_fk" FOREIGN KEY ("source_lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_tag_hits" ADD CONSTRAINT "lesson_tag_hits_due_lesson_id_lessons_id_fk" FOREIGN KEY ("due_lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_tags" ADD CONSTRAINT "lesson_tags_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_tags" ADD CONSTRAINT "lesson_tags_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diary_accounts_family_idx" ON "diary_accounts" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "students_account_idx" ON "students" USING btree ("diary_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_login_key" ON "users" USING btree (lower("login"));--> statement-breakpoint
CREATE INDEX "users_family_idx" ON "users" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "student_years_year_idx" ON "student_years" USING btree ("school_year_id");--> statement-breakpoint
CREATE INDEX "attendance_student_date_idx" ON "attendance" USING btree ("student_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "homework_items_student_external_key" ON "homework_items" USING btree ("student_id","provider_id","external_id") WHERE "homework_items"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "homework_items_student_due_idx" ON "homework_items" USING btree ("student_id","due_date");--> statement-breakpoint
CREATE INDEX "lessons_student_date_idx" ON "lessons" USING btree ("student_id","date");--> statement-breakpoint
CREATE INDEX "lessons_family_idx" ON "lessons" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "mark_events_student_created_idx" ON "mark_events" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "mark_events_created_idx" ON "mark_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "mark_history_mark_idx" ON "mark_history" USING btree ("mark_id");--> statement-breakpoint
CREATE INDEX "marks_student_date_idx" ON "marks" USING btree ("student_id","date");--> statement-breakpoint
CREATE INDEX "marks_lesson_idx" ON "marks" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "marks_family_idx" ON "marks" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "lesson_prep_events_student_at_idx" ON "lesson_prep_events" USING btree ("student_id","at");--> statement-breakpoint
CREATE INDEX "lesson_prep_events_at_idx" ON "lesson_prep_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "study_session_events_session_idx" ON "study_session_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "study_session_events_at_idx" ON "study_session_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "study_sessions_student_started_idx" ON "study_sessions" USING btree ("student_id","started_at");--> statement-breakpoint
CREATE INDEX "raw_responses_fetched_idx" ON "raw_responses" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "raw_responses_student_week_idx" ON "raw_responses" USING btree ("student_id","week_start");--> statement-breakpoint
CREATE INDEX "sync_runs_account_started_idx" ON "sync_runs" USING btree ("diary_account_id","started_at");--> statement-breakpoint
CREATE INDEX "sync_runs_started_idx" ON "sync_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_event_idx" ON "notifications" USING btree ("user_id","event_key");--> statement-breakpoint
CREATE INDEX "lesson_tag_hits_student_due_idx" ON "lesson_tag_hits" USING btree ("student_id","due_date");--> statement-breakpoint
CREATE INDEX "lesson_tags_family_idx" ON "lesson_tags" USING btree ("family_id");