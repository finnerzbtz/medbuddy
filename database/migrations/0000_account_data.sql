CREATE TABLE "reminduh_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"settings" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reminduh_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reminduh_check_ins" (
	"user_id" uuid NOT NULL,
	"id" text NOT NULL,
	"medication_id" text NOT NULL,
	"status" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"details" jsonb NOT NULL,
	CONSTRAINT "reminduh_check_ins_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
ALTER TABLE "reminduh_check_ins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reminduh_medications" (
	"user_id" uuid NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"details" jsonb NOT NULL,
	CONSTRAINT "reminduh_medications_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
ALTER TABLE "reminduh_medications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reminduh_check_ins" ADD CONSTRAINT "reminduh_check_ins_user_id_medication_id_reminduh_medications_user_id_id_fk" FOREIGN KEY ("user_id","medication_id") REFERENCES "public"."reminduh_medications"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminduh_medications" ADD CONSTRAINT "reminduh_medications_user_id_reminduh_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."reminduh_accounts"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "check_ins_user_date" ON "reminduh_check_ins" USING btree ("user_id","recorded_at");--> statement-breakpoint
CREATE POLICY "account_owner_read" ON "reminduh_accounts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("reminduh_accounts"."user_id" = (select auth.user_id())::uuid);--> statement-breakpoint
CREATE POLICY "check_in_owner_read" ON "reminduh_check_ins" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("reminduh_check_ins"."user_id" = (select auth.user_id())::uuid);--> statement-breakpoint
CREATE POLICY "medication_owner_read" ON "reminduh_medications" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("reminduh_medications"."user_id" = (select auth.user_id())::uuid);