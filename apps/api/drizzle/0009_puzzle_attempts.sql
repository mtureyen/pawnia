CREATE TABLE "puzzle_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"puzzle_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"solved_first_try" boolean NOT NULL,
	"repeat" boolean NOT NULL,
	"puzzle_rating" integer NOT NULL,
	"rating_before" integer NOT NULL,
	"rating_after" integer NOT NULL,
	"themes" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "puzzle_progress" (
	"puzzle_id" text PRIMARY KEY NOT NULL,
	"misses" integer NOT NULL,
	"due_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "puzzle_attempts_at" ON "puzzle_attempts" USING btree ("at");