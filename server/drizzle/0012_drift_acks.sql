CREATE TABLE "api_drift_acks" (
	"family_id" uuid NOT NULL,
	"drift_event_id" uuid NOT NULL,
	"acknowledged_at" timestamp with time zone NOT NULL,
	CONSTRAINT "api_drift_acks_family_id_drift_event_id_pk" PRIMARY KEY("family_id","drift_event_id")
);
--> statement-breakpoint
ALTER TABLE "api_drift_acks" ADD CONSTRAINT "api_drift_acks_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_drift_acks" ADD CONSTRAINT "api_drift_acks_drift_event_id_api_drift_events_id_fk" FOREIGN KEY ("drift_event_id") REFERENCES "public"."api_drift_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- an event acknowledged before acknowledgements were per family stays hidden for every family that uses its provider
INSERT INTO "api_drift_acks" ("family_id", "drift_event_id", "acknowledged_at")
SELECT DISTINCT a."family_id", e."id", e."acknowledged_at"
FROM "api_drift_events" e JOIN "diary_accounts" a ON a."provider_id" = e."provider_id"
WHERE e."acknowledged_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "api_drift_events" DROP COLUMN "acknowledged_at";