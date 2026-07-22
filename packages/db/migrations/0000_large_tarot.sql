CREATE TYPE "public"."account_state" AS ENUM('roster-only', 'pending', 'active', 'rejected', 'suspended', 'deactivated', 'soft-deleted');--> statement-breakpoint
CREATE TYPE "public"."session_assurance" AS ENUM('password', 'mfa');--> statement-breakpoint
CREATE TYPE "public"."graduate_badge" AS ENUM('two-year', 'four-year', 'spouse');--> statement-breakpoint
CREATE TYPE "public"."login_outcome" AS ENUM('success', 'invalid', 'locked', 'pending', 'suspended', 'mfa-required', 'recovery-used');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'processing', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('member', 'super-admin');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"subject_user_id" uuid,
	"action" text NOT NULL,
	"reason" text,
	"before" jsonb,
	"after" jsonb,
	"request_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"bucket" text NOT NULL,
	"key_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"blocked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_rate_limits_pk" PRIMARY KEY("bucket","key_hash")
);
--> statement-breakpoint
CREATE TABLE "class_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"class_year" integer NOT NULL,
	"assigned_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_assignments_year_ck" CHECK ("class_assignments"."class_year" between 2001 and 2026)
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"recipient" text NOT NULL,
	"template" text NOT NULL,
	"public_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"encrypted_payload" text,
	"encryption_iv" text,
	"encryption_tag" text,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_outbox_encryption_ck" CHECK (("email_outbox"."encrypted_payload" is null and "email_outbox"."encryption_iv" is null and "email_outbox"."encryption_tag" is null) or ("email_outbox"."encrypted_payload" is not null and "email_outbox"."encryption_iv" is not null and "email_outbox"."encryption_tag" is not null))
);
--> statement-breakpoint
CREATE TABLE "login_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"identity_hash" text NOT NULL,
	"outcome" "login_outcome" NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_hash_length_ck" CHECK (length("password_reset_tokens"."token_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE "recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recovery_codes_hash_length_ck" CHECK (length("recovery_codes"."code_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE "registration_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "registration_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"reviewer_user_id" uuid,
	"decision_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_requests_decision_ck" CHECK (("registration_requests"."status" = 'pending' and "registration_requests"."decided_at" is null and "registration_requests"."reviewer_user_id" is null and "registration_requests"."decision_reason" is null) or ("registration_requests"."status" in ('approved', 'rejected') and "registration_requests"."decided_at" is not null and "registration_requests"."reviewer_user_id" is not null and length(trim("registration_requests"."decision_reason")) >= 3))
);
--> statement-breakpoint
CREATE TABLE "roster_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"normalized_full_name" text NOT NULL,
	"email" text NOT NULL,
	"normalized_email" text NOT NULL,
	"badge" "graduate_badge" NOT NULL,
	"graduation_year" integer,
	"source_batch_id" uuid NOT NULL,
	"imported_by_user_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roster_entries_badge_year_ck" CHECK (("roster_entries"."badge" = 'spouse' and "roster_entries"."graduation_year" is null) or ("roster_entries"."badge" in ('two-year', 'four-year') and "roster_entries"."graduation_year" between 2001 and 2026))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"assurance" "session_assurance" DEFAULT 'password' NOT NULL,
	"totp_verified_at" timestamp with time zone,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_length_ck" CHECK (length("sessions"."token_hash") = 64),
	CONSTRAINT "sessions_expiry_order_ck" CHECK ("sessions"."idle_expires_at" <= "sessions"."absolute_expires_at")
);
--> statement-breakpoint
CREATE TABLE "totp_factors" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"encrypted_secret" text NOT NULL,
	"encryption_iv" text NOT NULL,
	"encryption_tag" text NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"roster_entry_id" uuid,
	"display_name" text NOT NULL,
	"normalized_full_name" text NOT NULL,
	"email" text NOT NULL,
	"normalized_email" text NOT NULL,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"state" "account_state" NOT NULL,
	"badge" "graduate_badge",
	"graduation_year" integer,
	"is_registration_reviewer" boolean DEFAULT false NOT NULL,
	"approved_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_badge_year_ck" CHECK ("users"."badge" is null or ("users"."badge" = 'spouse' and "users"."graduation_year" is null) or ("users"."badge" in ('two-year', 'four-year') and "users"."graduation_year" between 2001 and 2026)),
	CONSTRAINT "users_active_profile_ck" CHECK ("users"."state" <> 'active' or "users"."badge" is not null)
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "totp_factors" ADD CONSTRAINT "totp_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_roster_entry_id_roster_entries_id_fk" FOREIGN KEY ("roster_entry_id") REFERENCES "public"."roster_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_actor_occurred_idx" ON "audit_events" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_subject_occurred_idx" ON "audit_events" USING btree ("subject_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_action_occurred_idx" ON "audit_events" USING btree ("action","occurred_at");--> statement-breakpoint
CREATE INDEX "auth_rate_limits_blocked_idx" ON "auth_rate_limits" USING btree ("blocked_until");--> statement-breakpoint
CREATE UNIQUE INDEX "class_assignments_user_year_uq" ON "class_assignments" USING btree ("user_id","class_year");--> statement-breakpoint
CREATE INDEX "class_assignments_year_idx" ON "class_assignments" USING btree ("class_year");--> statement-breakpoint
CREATE INDEX "email_outbox_status_available_idx" ON "email_outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "login_history_user_occurred_idx" ON "login_history" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_hash_uq" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_codes_hash_uq" ON "recovery_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "recovery_codes_user_idx" ON "recovery_codes" USING btree ("user_id","used_at");--> statement-breakpoint
CREATE UNIQUE INDEX "registration_requests_one_pending_per_user_uq" ON "registration_requests" USING btree ("user_id") WHERE "registration_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "registration_requests_status_submitted_idx" ON "registration_requests" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "registration_requests_user_idx" ON "registration_requests" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_entries_normalized_email_active_uq" ON "roster_entries" USING btree ("normalized_email") WHERE "roster_entries"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "roster_entries_match_idx" ON "roster_entries" USING btree ("normalized_full_name","normalized_email");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_active_idx" ON "sessions" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_roster_entry_uq" ON "users" USING btree ("roster_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_normalized_email_uq" ON "users" USING btree ("normalized_email");--> statement-breakpoint
CREATE INDEX "users_state_idx" ON "users" USING btree ("state");--> statement-breakpoint
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_imported_by_user_id_users_id_fk" FOREIGN KEY ("imported_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_audit_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are append-only';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER audit_events_no_update_or_delete
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();
