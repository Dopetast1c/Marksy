CREATE TABLE "backup_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"file" text,
	"version" text NOT NULL,
	"to_version" text,
	"size_bytes" bigint,
	"status" text NOT NULL,
	"error" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instance_state" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"sync_note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_state_one_row" CHECK ("instance_state"."id" = 1)
);
--> statement-breakpoint
CREATE INDEX "backup_runs_started_idx" ON "backup_runs" USING btree ("started_at");--> statement-breakpoint
-- the one row of switches: the collector is on unless a restore or a command turned it off
INSERT INTO "instance_state" ("id") VALUES (1) ON CONFLICT DO NOTHING;
