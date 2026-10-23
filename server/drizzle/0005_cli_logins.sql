CREATE TABLE "cli_logins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" text NOT NULL,
	"diary_account_id" uuid,
	"login_hash" text NOT NULL,
	"command" text NOT NULL,
	"runner" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cli_logins" ADD CONSTRAINT "cli_logins_diary_account_id_diary_accounts_id_fk" FOREIGN KEY ("diary_account_id") REFERENCES "public"."diary_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cli_logins_login_at_idx" ON "cli_logins" USING btree ("provider_id","login_hash","at");