CREATE TYPE "public"."friend_request_status" AS ENUM('PENDING', 'ACCEPTED', 'DECLINED');--> statement-breakpoint
CREATE TABLE "author_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"author_id" uuid NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"goodreads_id" text,
	"gator_author_id" text,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authors_gator_author_id_unique" UNIQUE("gator_author_id")
);
--> statement-breakpoint
CREATE TABLE "friend_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" text NOT NULL,
	"receiver_id" text NOT NULL,
	"status" "friend_request_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_userId_users_id_fk";
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "is_public" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "spoiler_tags" text[];--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "streak_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "longest_streak" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_notifications" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "grace_until" timestamp (6) with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "discriminator" text;--> statement-breakpoint
ALTER TABLE "author_follows" ADD CONSTRAINT "author_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_follows" ADD CONSTRAINT "author_follows_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "author_follows_pair_idx" ON "author_follows" USING btree ("user_id","author_id");--> statement-breakpoint
CREATE INDEX "author_follows_user_idx" ON "author_follows" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "friend_requests_pair_idx" ON "friend_requests" USING btree ("sender_id","receiver_id");--> statement-breakpoint
CREATE INDEX "friend_requests_receiver_idx" ON "friend_requests" USING btree ("receiver_id");--> statement-breakpoint
CREATE INDEX "friend_requests_sender_idx" ON "friend_requests" USING btree ("sender_id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journal_entries_feed_idx" ON "journal_entries" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_display_name_discriminator_idx" ON "users" USING btree ("display_name","discriminator");--> statement-breakpoint
ALTER TABLE "journal_entries" DROP COLUMN "isPublic";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "userId";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "emailVerified";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "streakCount";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "longestStreak";