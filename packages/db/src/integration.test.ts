import { randomUUID } from "node:crypto";
import { genericRegistrationResponse, normalizeEmail, normalizeFullName } from "@hwa/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { approveRegistration, submitRosterRegistration } from "./registration";
import { clearRateLimit, consumePasswordReset, consumeRateLimit, issuePasswordReset } from "./authentication";
import { createDatabase, type DatabaseHandle } from "./connection";
import { claimEmailJobs, markEmailSent } from "./outbox";
import {
  auditEvents,
  classAssignments,
  credentials,
  emailOutbox,
  passwordResetTokens,
  registrationRequests,
  rosterEntries,
  sessions,
  totpFactors,
  users
} from "./schema";

const databaseUrl = process.env.DATABASE_URL;
const integrationEnabled = process.env.APP_ENV === "test" && databaseUrl !== undefined && /(?:^|[_-])test(?:$|[_-])/u.test(new URL(databaseUrl).pathname.slice(1));
const handle: DatabaseHandle | null = integrationEnabled && databaseUrl ? createDatabase(databaseUrl) : null;

function database(): DatabaseHandle {
  if (!handle) throw new Error("Integration database is unavailable.");
  return handle;
}

async function resetDatabase(): Promise<void> {
  await database().pool.query(`TRUNCATE TABLE
    auth_rate_limits, recovery_codes, totp_factors, password_reset_tokens,
    sessions, class_assignments, registration_requests, credentials,
    email_outbox, login_history, audit_events, users, roster_entries
    RESTART IDENTITY CASCADE`);
}

async function createAdministrator(now = new Date("2026-07-22T12:00:00Z")) {
  const db = database().db;
  const [administrator] = await db.insert(users).values({
    displayName: "Ada Administrator",
    normalizedFullName: normalizeFullName("Ada Administrator"),
    email: "ada.admin@example.test",
    normalizedEmail: normalizeEmail("ada.admin@example.test"),
    role: "super-admin",
    state: "active",
    badge: "spouse",
    isRegistrationReviewer: true,
    approvedAt: now
  }).returning({ id: users.id });
  if (!administrator) throw new Error("Test administrator was not created.");
  await db.insert(totpFactors).values({
    userId: administrator.id,
    encryptedSecret: "synthetic-ciphertext",
    encryptionIv: "synthetic-iv",
    encryptionTag: "synthetic-tag",
    verifiedAt: now
  });
  const [session] = await db.insert(sessions).values({
    userId: administrator.id,
    tokenHash: "a".repeat(64),
    assurance: "mfa",
    totpVerifiedAt: now,
    idleExpiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    absoluteExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    lastSeenAt: now
  }).returning({ id: sessions.id });
  if (!session) throw new Error("Test administrator session was not created.");
  return { administratorUserId: administrator.id, administratorSessionId: session.id, now };
}

async function createPendingRegistration(suffix: string) {
  const db = database().db;
  const email = `graduate.${suffix}@example.test`;
  await db.insert(rosterEntries).values({
    fullName: `Graduate ${suffix}`,
    normalizedFullName: normalizeFullName(`Graduate ${suffix}`),
    email,
    normalizedEmail: normalizeEmail(email),
    badge: "four-year",
    graduationYear: 2012,
    sourceBatchId: randomUUID()
  });
  const result = await submitRosterRegistration(db, { fullName: `  Graduate   ${suffix} `, email: email.toUpperCase(), passwordHash: "synthetic-password-hash" });
  const [request] = await db.select({ id: registrationRequests.id, userId: registrationRequests.userId })
    .from(registrationRequests).where(eq(registrationRequests.status, "pending")).limit(1);
  if (!request) throw new Error("Test registration was not created.");
  await db.insert(sessions).values({
    userId: request.userId,
    tokenHash: suffix.padEnd(64, "b").slice(0, 64),
    assurance: "password",
    idleExpiresAt: new Date("2026-07-23T00:00:00Z"),
    absoluteExpiresAt: new Date("2026-08-01T00:00:00Z")
  });
  return { ...request, result };
}

describe.runIf(integrationEnabled)("PostgreSQL identity workflows", () => {
  beforeEach(resetDatabase);
  afterAll(async () => { await handle?.pool.end(); });

  it("keeps roster misses indistinguishable and creates no account", async () => {
    const result = await submitRosterRegistration(database().db, {
      fullName: "Unknown Graduate",
      email: "unknown@example.test",
      passwordHash: "synthetic-password-hash"
    });
    expect(result).toEqual({ publicMessage: genericRegistrationResponse, created: false });
    expect(await database().db.select().from(users)).toHaveLength(0);
  });

  it("approves a matched registration transactionally and revokes stale sessions", async () => {
    const admin = await createAdministrator();
    const pending = await createPendingRegistration("one");
    expect(pending.result).toEqual({ publicMessage: genericRegistrationResponse, created: true });

    await approveRegistration(database().db, {
      registrationRequestId: pending.id,
      reviewerUserId: admin.administratorUserId,
      reviewerSessionId: admin.administratorSessionId,
      badge: "four-year",
      graduationYear: 2012,
      reason: "Matched verified roster entry.",
      now: admin.now
    });

    const [member] = await database().db.select().from(users).where(eq(users.id, pending.userId));
    const assignments = await database().db.select().from(classAssignments).where(eq(classAssignments.userId, pending.userId));
    const memberSessions = await database().db.select().from(sessions).where(eq(sessions.userId, pending.userId));
    const events = await database().db.select().from(auditEvents).where(eq(auditEvents.action, "registration.approved"));
    const outbox = await database().db.select().from(emailOutbox).where(eq(emailOutbox.template, "registration-approved"));
    expect(member).toMatchObject({ state: "active", badge: "four-year", graduationYear: 2012 });
    expect(assignments).toHaveLength(1);
    expect(memberSessions[0]?.revokedAt).toBeInstanceOf(Date);
    expect(events).toHaveLength(1);
    expect(outbox).toHaveLength(1);
  });

  it("allows exactly one winner when two reviewers decide concurrently", async () => {
    const admin = await createAdministrator();
    const pending = await createPendingRegistration("race");
    const decision = {
      registrationRequestId: pending.id,
      reviewerUserId: admin.administratorUserId,
      reviewerSessionId: admin.administratorSessionId,
      badge: "four-year" as const,
      graduationYear: 2012,
      reason: "Concurrent review test.",
      now: admin.now
    };
    const results = await Promise.allSettled([approveRegistration(database().db, decision), approveRegistration(database().db, decision)]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(await database().db.select().from(auditEvents).where(eq(auditEvents.action, "registration.approved"))).toHaveLength(1);
  });

  it("consumes password reset tokens once and revokes every active session", async () => {
    await createAdministrator();
    const pending = await createPendingRegistration("reset");
    const tokenHash = "c".repeat(64);
    expect(await issuePasswordReset(database().db, {
      normalizedEmail: normalizeEmail("graduate.reset@example.test"),
      tokenHash,
      expiresAt: new Date("2026-07-22T13:00:00Z"),
      encryptedPayload: "encrypted-reset-url",
      encryptionIv: "synthetic-iv",
      encryptionTag: "synthetic-tag",
      now: new Date("2026-07-22T12:00:00Z")
    })).toBe(true);
    expect(await consumePasswordReset(database().db, { tokenHash, passwordHash: "replacement-password-hash", now: new Date("2026-07-22T12:05:00Z") })).toBe(true);
    expect(await consumePasswordReset(database().db, { tokenHash, passwordHash: "another-password-hash", now: new Date("2026-07-22T12:06:00Z") })).toBe(false);
    const [credential] = await database().db.select().from(credentials).where(eq(credentials.userId, pending.userId));
    const [reset] = await database().db.select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash));
    const memberSessions = await database().db.select().from(sessions).where(eq(sessions.userId, pending.userId));
    expect(credential?.passwordHash).toBe("replacement-password-hash");
    expect(reset?.usedAt).toBeInstanceOf(Date);
    expect(memberSessions.every(({ revokedAt }) => revokedAt !== null)).toBe(true);
    const claimed = await claimEmailJobs(database().db, 10, new Date("2026-07-22T12:06:00Z"));
    const resetEmail = claimed.find(({ template }) => template === "password-reset");
    expect(resetEmail?.attempts).toBe(1);
    if (!resetEmail) throw new Error("Password-reset outbox job was not claimed.");
    await markEmailSent(database().db, resetEmail.id, new Date("2026-07-22T12:07:00Z"));
    const [sentEmail] = await database().db.select().from(emailOutbox).where(eq(emailOutbox.id, resetEmail.id));
    expect(sentEmail?.status).toBe("sent");
  });

  it("persists progressive rate limits and clears them after success", async () => {
    const input = { bucket: "integration", keyHash: "d".repeat(64), maxAttempts: 2, windowMs: 60_000, baseBlockMs: 30_000, maxBlockMs: 60_000, now: new Date("2026-07-22T12:00:00Z") };
    expect((await consumeRateLimit(database().db, input)).allowed).toBe(true);
    expect((await consumeRateLimit(database().db, input)).allowed).toBe(true);
    expect((await consumeRateLimit(database().db, input)).allowed).toBe(false);
    await clearRateLimit(database().db, input.bucket, input.keyHash);
    expect((await consumeRateLimit(database().db, input)).allowed).toBe(true);
  });

  it("rejects mutation of append-only audit evidence", async () => {
    const admin = await createAdministrator();
    const [event] = await database().db.insert(auditEvents).values({ actorUserId: admin.administratorUserId, action: "integration.audit" }).returning({ id: auditEvents.id });
    if (!event) throw new Error("Test audit event was not created.");
    await expect(database().db.update(auditEvents).set({ reason: "tamper" }).where(eq(auditEvents.id, event.id))).rejects.toThrow(/append-only/u);
  });
});
