CREATE TABLE "background_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"cursor" jsonb,
	"done" integer DEFAULT 0 NOT NULL,
	"total" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
