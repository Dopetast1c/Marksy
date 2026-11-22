CREATE TABLE "provider_memo" (
	"diary_account_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"value" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "provider_memo_diary_account_id_key_pk" PRIMARY KEY("diary_account_id","key")
);
--> statement-breakpoint
CREATE TABLE "sync_reads" (
	"student_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sync_reads_student_id_kind_pk" PRIMARY KEY("student_id","kind")
);
--> statement-breakpoint
ALTER TABLE "provider_memo" ADD CONSTRAINT "provider_memo_diary_account_id_diary_accounts_id_fk" FOREIGN KEY ("diary_account_id") REFERENCES "public"."diary_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_reads" ADD CONSTRAINT "sync_reads_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;