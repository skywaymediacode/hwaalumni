import type { AccountState, Badge, Role } from "@hwa/domain";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "./connection";
import {
  authRateLimits,
  auditEvents,
  classAssignments,
  credentials,
  emailOutbox,
  loginHistory,
  passwordResetTokens,
  recoveryCodes,
  sessions,
  totpFactors,
  users
} from "./schema";

export interface RateLimitInput {
  bucket: string;
  keyHash: string;
  maxAttempts: number;
  windowMs: number;
  baseBlockMs: number;
  maxBlockMs: number;
  now?: Date;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function consumeRateLimit(db: Database, input: RateLimitInput): Promise<RateLimitDecision> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    await tx.insert(authRateLimits).values({
      bucket: input.bucket,
      keyHash: input.keyHash,
      attempts: 0,
      windowStartedAt: now,
      updatedAt: now
    }).onConflictDoNothing();

    const [record] = await tx.select().from(authRateLimits).where(and(
      eq(authRateLimits.bucket, input.bucket),
      eq(authRateLimits.keyHash, input.keyHash)
    )).limit(1).for("update");
    if (!record) throw new Error("Rate-limit record was not created.");

    if (record.blockedUntil && record.blockedUntil > now) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((record.blockedUntil.getTime() - now.getTime()) / 1000)) };
    }

    const windowExpired = now.getTime() - record.windowStartedAt.getTime() >= input.windowMs;
    const nextAttempts = windowExpired ? 1 : record.attempts + 1;
    const overLimit = nextAttempts > input.maxAttempts;
    const exponent = Math.max(0, nextAttempts - input.maxAttempts - 1);
    const blockMs = overLimit ? Math.min(input.maxBlockMs, input.baseBlockMs * (2 ** exponent)) : 0;
    const blockedUntil = overLimit ? new Date(now.getTime() + blockMs) : null;

    await tx.update(authRateLimits).set({
      attempts: nextAttempts,
      windowStartedAt: windowExpired ? now : record.windowStartedAt,
      blockedUntil,
      updatedAt: now
    }).where(and(eq(authRateLimits.bucket, input.bucket), eq(authRateLimits.keyHash, input.keyHash)));
    return { allowed: !overLimit, retryAfterSeconds: blockMs === 0 ? 0 : Math.ceil(blockMs / 1000) };
  });
}

export async function clearRateLimit(db: Database, bucket: string, keyHash: string): Promise<void> {
  await db.delete(authRateLimits).where(and(eq(authRateLimits.bucket, bucket), eq(authRateLimits.keyHash, keyHash)));
}

export interface CredentialAccount {
  userId: string;
  displayName: string;
  email: string;
  normalizedEmail: string;
  role: Role;
  state: AccountState;
  badge: Badge | null;
  graduationYear: number | null;
  isRegistrationReviewer: boolean;
  passwordHash: string;
  hasVerifiedTotp: boolean;
}

export async function findCredentialAccount(db: Database, normalizedEmail: string): Promise<CredentialAccount | null> {
  const [row] = await db.select({
    userId: users.id,
    displayName: users.displayName,
    email: users.email,
    normalizedEmail: users.normalizedEmail,
    role: users.role,
    state: users.state,
    badge: users.badge,
    graduationYear: users.graduationYear,
    isRegistrationReviewer: users.isRegistrationReviewer,
    passwordHash: credentials.passwordHash,
    totpVerifiedAt: totpFactors.verifiedAt
  }).from(users)
    .innerJoin(credentials, eq(credentials.userId, users.id))
    .leftJoin(totpFactors, eq(totpFactors.userId, users.id))
    .where(and(eq(users.normalizedEmail, normalizedEmail), isNull(users.deletedAt)))
    .limit(1);

  if (!row) return null;
  return { ...row, hasVerifiedTotp: row.totpVerifiedAt !== null };
}

export interface LoginHistoryInput {
  userId?: string;
  identityHash: string;
  outcome: "success" | "invalid" | "locked" | "pending" | "suspended" | "mfa-required" | "recovery-used";
  ipHash?: string;
  userAgent?: string;
  now?: Date;
}

export async function recordLoginHistory(db: Database, input: LoginHistoryInput): Promise<void> {
  await db.insert(loginHistory).values({
    userId: input.userId,
    identityHash: input.identityHash,
    outcome: input.outcome,
    ipHash: input.ipHash,
    userAgent: input.userAgent?.slice(0, 500),
    occurredAt: input.now ?? new Date()
  });
}

export interface NewSessionInput {
  userId: string;
  tokenHash: string;
  assurance: "password" | "mfa";
  totpVerifiedAt?: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  ipHash?: string;
  userAgent?: string;
  rotateSessionId?: string;
  now?: Date;
}

export async function createSession(db: Database, input: NewSessionInput): Promise<{ id: string }> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    if (input.rotateSessionId) {
      await tx.update(sessions).set({
        revokedAt: now,
        revocationReason: "session-rotated",
        updatedAt: now
      }).where(and(
        eq(sessions.id, input.rotateSessionId),
        eq(sessions.userId, input.userId),
        isNull(sessions.revokedAt)
      ));
    }
    const [created] = await tx.insert(sessions).values({
      userId: input.userId,
      tokenHash: input.tokenHash,
      assurance: input.assurance,
      totpVerifiedAt: input.totpVerifiedAt,
      idleExpiresAt: input.idleExpiresAt,
      absoluteExpiresAt: input.absoluteExpiresAt,
      lastSeenAt: now,
      ipHash: input.ipHash,
      userAgent: input.userAgent?.slice(0, 500)
    }).returning({ id: sessions.id });
    if (!created) throw new Error("Session was not created.");
    return created;
  });
}

export interface SessionAccount {
  sessionId: string;
  assurance: "password" | "mfa";
  totpVerifiedAt: Date | null;
  absoluteExpiresAt: Date;
  userId: string;
  displayName: string;
  email: string;
  role: Role;
  state: AccountState;
  badge: Badge | null;
  graduationYear: number | null;
  isRegistrationReviewer: boolean;
  hasVerifiedTotp: boolean;
  assignedClassYears: readonly number[];
}

export async function findActiveSession(db: Database, tokenHash: string, now = new Date()): Promise<SessionAccount | null> {
  const [row] = await db.select({
    sessionId: sessions.id,
    assurance: sessions.assurance,
    totpVerifiedAt: sessions.totpVerifiedAt,
    absoluteExpiresAt: sessions.absoluteExpiresAt,
    userId: users.id,
    displayName: users.displayName,
    email: users.email,
    role: users.role,
    state: users.state,
    badge: users.badge,
    graduationYear: users.graduationYear,
    isRegistrationReviewer: users.isRegistrationReviewer,
    hasVerifiedTotpAt: totpFactors.verifiedAt
  }).from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(totpFactors, eq(totpFactors.userId, users.id))
    .where(and(
      eq(sessions.tokenHash, tokenHash),
      isNull(sessions.revokedAt),
      isNull(users.deletedAt),
      gt(sessions.idleExpiresAt, now),
      gt(sessions.absoluteExpiresAt, now)
    )).limit(1);
  if (!row) return null;

  const assignments = await db.select({ year: classAssignments.classYear })
    .from(classAssignments)
    .where(eq(classAssignments.userId, row.userId));
  return {
    ...row,
    hasVerifiedTotp: row.hasVerifiedTotpAt !== null,
    assignedClassYears: assignments.map(({ year }) => year)
  };
}

export async function touchSession(db: Database, sessionId: string, idleExpiresAt: Date, now = new Date()): Promise<void> {
  await db.update(sessions).set({ lastSeenAt: now, idleExpiresAt, updatedAt: now })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt), gt(sessions.absoluteExpiresAt, now)));
}

export async function revokeSession(db: Database, sessionId: string, reason: string, now = new Date()): Promise<void> {
  await db.update(sessions).set({ revokedAt: now, revocationReason: reason, updatedAt: now })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

export async function revokeAllUserSessions(db: Database, userId: string, reason: string, now = new Date()): Promise<void> {
  await db.update(sessions).set({ revokedAt: now, revocationReason: reason, updatedAt: now })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export interface DirectoryEntry {
  id: string;
  displayName: string;
  badge: Badge;
  graduationYear: number | null;
  assignedClassYears: readonly number[];
}

export async function listActiveDirectory(db: Database): Promise<readonly DirectoryEntry[]> {
  const members = await db.select({
    id: users.id,
    displayName: users.displayName,
    badge: users.badge,
    graduationYear: users.graduationYear
  }).from(users).where(and(eq(users.state, "active"), isNull(users.deletedAt))).orderBy(users.displayName);
  const assignments = await db.select({ userId: classAssignments.userId, year: classAssignments.classYear }).from(classAssignments);
  const yearsByUser = new Map<string, number[]>();
  for (const assignment of assignments) {
    const years = yearsByUser.get(assignment.userId) ?? [];
    years.push(assignment.year);
    yearsByUser.set(assignment.userId, years);
  }
  return members.flatMap((member) => member.badge ? [{ ...member, badge: member.badge, assignedClassYears: yearsByUser.get(member.id) ?? [] }] : []);
}

export async function listUserLoginHistory(db: Database, userId: string, limit = 20) {
  return db.select({ outcome: loginHistory.outcome, ipHash: loginHistory.ipHash, userAgent: loginHistory.userAgent, occurredAt: loginHistory.occurredAt })
    .from(loginHistory).where(eq(loginHistory.userId, userId)).orderBy(sql`${loginHistory.occurredAt} desc`).limit(limit);
}

export async function listUserSessions(db: Database, userId: string, now = new Date()) {
  return db.select({
    id: sessions.id,
    assurance: sessions.assurance,
    userAgent: sessions.userAgent,
    lastSeenAt: sessions.lastSeenAt,
    createdAt: sessions.createdAt,
    absoluteExpiresAt: sessions.absoluteExpiresAt
  }).from(sessions).where(and(
    eq(sessions.userId, userId),
    isNull(sessions.revokedAt),
    gt(sessions.absoluteExpiresAt, now)
  )).orderBy(sql`${sessions.lastSeenAt} desc`);
}

export interface PasswordResetIssueInput {
  normalizedEmail: string;
  tokenHash: string;
  expiresAt: Date;
  encryptedPayload: string;
  encryptionIv: string;
  encryptionTag: string;
  now?: Date;
}

export async function issuePasswordReset(db: Database, input: PasswordResetIssueInput): Promise<boolean> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [user] = await tx.select({ id: users.id, email: users.email, displayName: users.displayName, state: users.state })
      .from(users).where(and(eq(users.normalizedEmail, input.normalizedEmail), isNull(users.deletedAt))).limit(1);
    if (!user || !(["pending", "active", "suspended"] as AccountState[]).includes(user.state)) return false;

    await tx.update(passwordResetTokens).set({ usedAt: now })
      .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, now)));
    await tx.insert(passwordResetTokens).values({ userId: user.id, tokenHash: input.tokenHash, expiresAt: input.expiresAt });
    await tx.insert(emailOutbox).values({
      userId: user.id,
      recipient: user.email,
      template: "password-reset",
      publicMetadata: { displayName: user.displayName },
      encryptedPayload: input.encryptedPayload,
      encryptionIv: input.encryptionIv,
      encryptionTag: input.encryptionTag
    });
    return true;
  });
}

export async function consumePasswordReset(
  db: Database,
  input: { tokenHash: string; passwordHash: string; now?: Date }
): Promise<boolean> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [reset] = await tx.select().from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, input.tokenHash), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, now)))
      .limit(1).for("update");
    if (!reset) return false;

    await tx.update(credentials).set({ passwordHash: input.passwordHash, passwordChangedAt: now, updatedAt: now })
      .where(eq(credentials.userId, reset.userId));
    await tx.update(passwordResetTokens).set({ usedAt: now }).where(and(
      eq(passwordResetTokens.userId, reset.userId),
      isNull(passwordResetTokens.usedAt)
    ));
    await tx.update(sessions).set({ revokedAt: now, revocationReason: "password-reset", updatedAt: now })
      .where(and(eq(sessions.userId, reset.userId), isNull(sessions.revokedAt)));
    await tx.insert(auditEvents).values({
      subjectUserId: reset.userId,
      action: "credential.password-reset",
      after: { sessionsRevoked: true },
      occurredAt: now
    });
    return true;
  });
}

export async function findTotpFactor(db: Database, userId: string) {
  const [factor] = await db.select().from(totpFactors).where(eq(totpFactors.userId, userId)).limit(1);
  return factor ?? null;
}

export interface TotpEnrollmentRecord {
  userId: string;
  encryptedSecret: string;
  encryptionIv: string;
  encryptionTag: string;
  now?: Date;
}

export async function saveUnverifiedTotpFactor(db: Database, input: TotpEnrollmentRecord): Promise<void> {
  const now = input.now ?? new Date();
  await db.insert(totpFactors).values({
    userId: input.userId,
    encryptedSecret: input.encryptedSecret,
    encryptionIv: input.encryptionIv,
    encryptionTag: input.encryptionTag,
    verifiedAt: null,
    createdAt: now,
    updatedAt: now
  }).onConflictDoUpdate({
    target: totpFactors.userId,
    set: {
      encryptedSecret: input.encryptedSecret,
      encryptionIv: input.encryptionIv,
      encryptionTag: input.encryptionTag,
      verifiedAt: null,
      updatedAt: now
    }
  });
}

export async function completeTotpEnrollment(
  db: Database,
  input: { userId: string; sessionId: string; recoveryCodeHashes: readonly string[]; now?: Date }
): Promise<void> {
  const now = input.now ?? new Date();
  await db.transaction(async (tx) => {
    const [account] = await tx.select({ email: users.email }).from(users).where(eq(users.id, input.userId)).limit(1).for("update");
    if (!account) throw new Error("Administrator account was not found.");
    const updated = await tx.update(totpFactors).set({ verifiedAt: now, updatedAt: now })
      .where(and(eq(totpFactors.userId, input.userId), isNull(totpFactors.verifiedAt)))
      .returning({ userId: totpFactors.userId });
    if (updated.length !== 1) throw new Error("Two-factor enrollment is no longer pending.");
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, input.userId));
    if (input.recoveryCodeHashes.length > 0) {
      await tx.insert(recoveryCodes).values(input.recoveryCodeHashes.map((codeHash) => ({ userId: input.userId, codeHash })));
    }
    await tx.update(sessions).set({ revokedAt: now, revocationReason: "two-factor-enabled", updatedAt: now })
      .where(and(eq(sessions.id, input.sessionId), eq(sessions.userId, input.userId), isNull(sessions.revokedAt)));
    await tx.insert(auditEvents).values({ actorUserId: input.userId, subjectUserId: input.userId, action: "security.totp-enabled", occurredAt: now });
    await tx.insert(emailOutbox).values({
      userId: input.userId,
      recipient: account.email,
      template: "admin-2fa-changed",
      publicMetadata: {}
    });
  });
}

export async function consumeRecoveryCode(db: Database, userId: string, codeHash: string, now = new Date()): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [record] = await tx.select().from(recoveryCodes)
      .where(and(eq(recoveryCodes.userId, userId), eq(recoveryCodes.codeHash, codeHash), isNull(recoveryCodes.usedAt)))
      .limit(1).for("update");
    if (!record) return false;
    const updated = await tx.update(recoveryCodes).set({ usedAt: now, updatedAt: now })
      .where(and(eq(recoveryCodes.id, record.id), isNull(recoveryCodes.usedAt)))
      .returning({ id: recoveryCodes.id });
    return updated.length === 1;
  });
}
