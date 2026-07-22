import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

export const accountStateEnum = pgEnum("account_state", ["roster-only", "pending", "active", "rejected", "suspended", "deactivated", "soft-deleted"]);
export const roleEnum = pgEnum("user_role", ["member", "super-admin"]);
export const badgeEnum = pgEnum("graduate_badge", ["two-year", "four-year", "spouse"]);
export const registrationStatusEnum = pgEnum("registration_status", ["pending", "approved", "rejected"]);
export const assuranceEnum = pgEnum("session_assurance", ["password", "mfa"]);
export const loginOutcomeEnum = pgEnum("login_outcome", ["success", "invalid", "locked", "pending", "suspended", "mfa-required", "recovery-used"]);
export const outboxStatusEnum = pgEnum("outbox_status", ["pending", "processing", "sent", "failed"]);

export const rosterEntries = pgTable("roster_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  normalizedFullName: text("normalized_full_name").notNull(),
  email: text("email").notNull(),
  normalizedEmail: text("normalized_email").notNull(),
  badge: badgeEnum("badge").notNull(),
  graduationYear: integer("graduation_year"),
  sourceBatchId: uuid("source_batch_id").notNull(),
  importedByUserId: uuid("imported_by_user_id"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...timestamps
}, (table) => [
  uniqueIndex("roster_entries_normalized_email_active_uq").on(table.normalizedEmail).where(sql`${table.deletedAt} is null`),
  index("roster_entries_match_idx").on(table.normalizedFullName, table.normalizedEmail),
  check("roster_entries_badge_year_ck", sql`(${table.badge} = 'spouse' and ${table.graduationYear} is null) or (${table.badge} in ('two-year', 'four-year') and ${table.graduationYear} between 2001 and 2026)`)
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  rosterEntryId: uuid("roster_entry_id").references(() => rosterEntries.id, { onDelete: "restrict" }),
  displayName: text("display_name").notNull(),
  normalizedFullName: text("normalized_full_name").notNull(),
  email: text("email").notNull(),
  normalizedEmail: text("normalized_email").notNull(),
  role: roleEnum("role").notNull().default("member"),
  state: accountStateEnum("state").notNull(),
  badge: badgeEnum("badge"),
  graduationYear: integer("graduation_year"),
  isRegistrationReviewer: boolean("is_registration_reviewer").notNull().default(false),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  ...timestamps
}, (table) => [
  uniqueIndex("users_roster_entry_uq").on(table.rosterEntryId),
  uniqueIndex("users_normalized_email_uq").on(table.normalizedEmail),
  index("users_state_idx").on(table.state),
  check("users_badge_year_ck", sql`${table.badge} is null or (${table.badge} = 'spouse' and ${table.graduationYear} is null) or (${table.badge} in ('two-year', 'four-year') and ${table.graduationYear} between 2001 and 2026)`),
  check("users_active_profile_ck", sql`${table.state} <> 'active' or ${table.badge} is not null`)
]);

export const credentials = pgTable("credentials", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps
});

export const registrationRequests = pgTable("registration_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  status: registrationStatusEnum("status").notNull().default("pending"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  reviewerUserId: uuid("reviewer_user_id").references(() => users.id, { onDelete: "restrict" }),
  decisionReason: text("decision_reason"),
  version: integer("version").notNull().default(1),
  ...timestamps
}, (table) => [
  uniqueIndex("registration_requests_one_pending_per_user_uq").on(table.userId).where(sql`${table.status} = 'pending'`),
  index("registration_requests_status_submitted_idx").on(table.status, table.submittedAt),
  index("registration_requests_user_idx").on(table.userId),
  check("registration_requests_decision_ck", sql`(${table.status} = 'pending' and ${table.decidedAt} is null and ${table.reviewerUserId} is null and ${table.decisionReason} is null) or (${table.status} in ('approved', 'rejected') and ${table.decidedAt} is not null and ${table.reviewerUserId} is not null and length(trim(${table.decisionReason})) >= 3)`)
]);

export const classAssignments = pgTable("class_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  classYear: integer("class_year").notNull(),
  assignedByUserId: uuid("assigned_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  ...timestamps
}, (table) => [
  uniqueIndex("class_assignments_user_year_uq").on(table.userId, table.classYear),
  index("class_assignments_year_idx").on(table.classYear),
  check("class_assignments_year_ck", sql`${table.classYear} between 2001 and 2026`)
]);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  assurance: assuranceEnum("assurance").notNull().default("password"),
  totpVerifiedAt: timestamp("totp_verified_at", { withTimezone: true }),
  idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
  absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revocationReason: text("revocation_reason"),
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),
  ...timestamps
}, (table) => [
  uniqueIndex("sessions_token_hash_uq").on(table.tokenHash),
  index("sessions_user_active_idx").on(table.userId, table.revokedAt),
  check("sessions_token_hash_length_ck", sql`length(${table.tokenHash}) = 64`),
  check("sessions_expiry_order_ck", sql`${table.idleExpiresAt} <= ${table.absoluteExpiresAt}`)
]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  ...timestamps
}, (table) => [
  uniqueIndex("password_reset_tokens_hash_uq").on(table.tokenHash),
  index("password_reset_tokens_user_idx").on(table.userId, table.expiresAt),
  check("password_reset_tokens_hash_length_ck", sql`length(${table.tokenHash}) = 64`)
]);

export const totpFactors = pgTable("totp_factors", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  encryptedSecret: text("encrypted_secret").notNull(),
  encryptionIv: text("encryption_iv").notNull(),
  encryptionTag: text("encryption_tag").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  ...timestamps
});

export const recoveryCodes = pgTable("recovery_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  ...timestamps
}, (table) => [
  uniqueIndex("recovery_codes_hash_uq").on(table.codeHash),
  index("recovery_codes_user_idx").on(table.userId, table.usedAt),
  check("recovery_codes_hash_length_ck", sql`length(${table.codeHash}) = 64`)
]);

export const loginHistory = pgTable("login_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  identityHash: text("identity_hash").notNull(),
  outcome: loginOutcomeEnum("outcome").notNull(),
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("login_history_user_occurred_idx").on(table.userId, table.occurredAt)]);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  subjectUserId: uuid("subject_user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  reason: text("reason"),
  before: jsonb("before"),
  after: jsonb("after"),
  requestId: uuid("request_id"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("audit_events_actor_occurred_idx").on(table.actorUserId, table.occurredAt),
  index("audit_events_subject_occurred_idx").on(table.subjectUserId, table.occurredAt),
  index("audit_events_action_occurred_idx").on(table.action, table.occurredAt)
]);

export const emailOutbox = pgTable("email_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  recipient: text("recipient").notNull(),
  template: text("template").notNull(),
  publicMetadata: jsonb("public_metadata").notNull().default({}),
  encryptedPayload: text("encrypted_payload"),
  encryptionIv: text("encryption_iv"),
  encryptionTag: text("encryption_tag"),
  status: outboxStatusEnum("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  lastErrorCode: text("last_error_code"),
  ...timestamps
}, (table) => [
  index("email_outbox_status_available_idx").on(table.status, table.availableAt),
  check("email_outbox_encryption_ck", sql`(${table.encryptedPayload} is null and ${table.encryptionIv} is null and ${table.encryptionTag} is null) or (${table.encryptedPayload} is not null and ${table.encryptionIv} is not null and ${table.encryptionTag} is not null)`)
]);

export const authRateLimits = pgTable("auth_rate_limits", {
  bucket: text("bucket").notNull(),
  keyHash: text("key_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  blockedUntil: timestamp("blocked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  primaryKey({ columns: [table.bucket, table.keyHash], name: "auth_rate_limits_pk" }),
  index("auth_rate_limits_blocked_idx").on(table.blockedUntil)
]);

export const schema = {
  rosterEntries,
  users,
  credentials,
  registrationRequests,
  classAssignments,
  sessions,
  passwordResetTokens,
  totpFactors,
  recoveryCodes,
  loginHistory,
  auditEvents,
  emailOutbox,
  authRateLimits
};
