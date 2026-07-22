import {
  assertAccountStateTransition,
  assertValidClassProfile,
  can,
  normalizeFullName,
  type AccountState,
  type Actor,
  type Badge,
  type Capability,
  type Role
} from "@hwa/domain";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "./connection";
import type { RosterImportRow } from "./roster";
import {
  auditEvents,
  classAssignments,
  registrationRequests,
  rosterEntries,
  sessions,
  totpFactors,
  users
} from "./schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface AdministrativeSessionInput {
  administratorUserId: string;
  administratorSessionId: string;
  capability: Extract<Capability, "registration:review" | "roster:import" | "user:manage" | "audit:read">;
  now?: Date;
}

export async function assertAdministrativeSession(tx: Transaction, input: AdministrativeSessionInput): Promise<Actor> {
  const now = input.now ?? new Date();
  const [record] = await tx.select({ user: users, session: sessions, factor: totpFactors }).from(users)
    .innerJoin(sessions, and(eq(sessions.id, input.administratorSessionId), eq(sessions.userId, users.id)))
    .innerJoin(totpFactors, eq(totpFactors.userId, users.id))
    .where(and(eq(users.id, input.administratorUserId), isNull(sessions.revokedAt), isNull(users.deletedAt)))
    .limit(1).for("update");
  if (!record || record.factor.verifiedAt === null || record.session.idleExpiresAt <= now || record.session.absoluteExpiresAt <= now) {
    throw new Error("Administrator authorization is required.");
  }
  const actor: Actor = {
    id: record.user.id,
    role: record.user.role,
    state: record.user.state,
    badge: record.user.badge ?? "spouse",
    classYear: record.user.graduationYear,
    assignedClassYears: [],
    isRegistrationReviewer: record.user.isRegistrationReviewer,
    hasTwoFactor: true,
    totpVerifiedAt: record.session.totpVerifiedAt
  };
  if (record.session.assurance !== "mfa" || !can(actor, input.capability, undefined, now)) {
    throw new Error("Administrator authorization is required.");
  }
  return actor;
}

export interface PendingRegistration {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  rosterBadge: Badge;
  rosterGraduationYear: number | null;
  submittedAt: Date;
  version: number;
}

export async function listPendingRegistrations(db: Database): Promise<readonly PendingRegistration[]> {
  return db.select({
    id: registrationRequests.id,
    userId: users.id,
    displayName: users.displayName,
    email: users.email,
    rosterBadge: rosterEntries.badge,
    rosterGraduationYear: rosterEntries.graduationYear,
    submittedAt: registrationRequests.submittedAt,
    version: registrationRequests.version
  }).from(registrationRequests)
    .innerJoin(users, eq(users.id, registrationRequests.userId))
    .innerJoin(rosterEntries, eq(rosterEntries.id, users.rosterEntryId))
    .where(and(eq(registrationRequests.status, "pending"), eq(users.state, "pending")))
    .orderBy(registrationRequests.submittedAt);
}

export interface ManagedUser {
  id: string;
  displayName: string;
  email: string;
  role: Role;
  state: AccountState;
  badge: Badge | null;
  graduationYear: number | null;
  isRegistrationReviewer: boolean;
  hasVerifiedTotp: boolean;
  createdAt: Date;
}

export async function listManagedUsers(db: Database): Promise<readonly ManagedUser[]> {
  const rows = await db.select({
    id: users.id,
    displayName: users.displayName,
    email: users.email,
    role: users.role,
    state: users.state,
    badge: users.badge,
    graduationYear: users.graduationYear,
    isRegistrationReviewer: users.isRegistrationReviewer,
    totpVerifiedAt: totpFactors.verifiedAt,
    createdAt: users.createdAt
  }).from(users).leftJoin(totpFactors, eq(totpFactors.userId, users.id))
    .where(isNull(users.deletedAt)).orderBy(users.displayName);
  return rows.map(({ totpVerifiedAt, ...row }) => ({ ...row, hasVerifiedTotp: totpVerifiedAt !== null }));
}

export interface UpdateManagedUserInput {
  administratorUserId: string;
  administratorSessionId: string;
  subjectUserId: string;
  displayName: string;
  role: Role;
  state: Extract<AccountState, "active" | "suspended" | "deactivated">;
  badge: Badge;
  graduationYear: number | null;
  isRegistrationReviewer: boolean;
  reason: string;
  now?: Date;
}

export async function updateManagedUser(db: Database, input: UpdateManagedUserInput): Promise<void> {
  const now = input.now ?? new Date();
  const reason = input.reason.trim();
  const displayName = input.displayName.trim().replace(/\s+/gu, " ");
  if (displayName.length < 2 || displayName.length > 120) throw new Error("A valid display name is required.");
  if (reason.length < 3 || reason.length > 500) throw new Error("A reason is required.");
  assertValidClassProfile({
    badge: input.badge,
    graduationYear: input.graduationYear,
    assignedClassYears: input.badge === "spouse" || input.graduationYear === null ? [] : [input.graduationYear]
  });

  await db.transaction(async (tx) => {
    await assertAdministrativeSession(tx, {
      administratorUserId: input.administratorUserId,
      administratorSessionId: input.administratorSessionId,
      capability: "user:manage",
      now
    });
    const [subject] = await tx.select().from(users).where(and(eq(users.id, input.subjectUserId), isNull(users.deletedAt))).limit(1).for("update");
    if (!subject) throw new Error("The member account no longer exists.");
    if (subject.state === "pending" || subject.state === "rejected" || subject.state === "roster-only" || subject.state === "soft-deleted") {
      throw new Error("This account state must be handled through its dedicated workflow.");
    }
    if (subject.state !== input.state) assertAccountStateTransition(subject.state, input.state);

    const removesActiveAdministrator = subject.role === "super-admin" && subject.state === "active" && (input.role !== "super-admin" || input.state !== "active");
    if (removesActiveAdministrator) {
      const activeAdministrators = await tx.select({ id: users.id }).from(users)
        .where(and(eq(users.role, "super-admin"), eq(users.state, "active"), isNull(users.deletedAt))).for("update");
      if (activeAdministrators.length <= 1) throw new Error("The final active super administrator cannot be removed.");
    }

    const reviewer = input.role === "super-admin" && input.isRegistrationReviewer;
    const before = {
      displayName: subject.displayName,
      role: subject.role,
      state: subject.state,
      badge: subject.badge,
      graduationYear: subject.graduationYear,
      isRegistrationReviewer: subject.isRegistrationReviewer
    };
    const after = {
      displayName,
      role: input.role,
      state: input.state,
      badge: input.badge,
      graduationYear: input.graduationYear,
      isRegistrationReviewer: reviewer
    };
    await tx.update(users).set({
      ...after,
      normalizedFullName: normalizeFullName(displayName),
      suspendedAt: input.state === "suspended" ? now : null,
      deactivatedAt: input.state === "deactivated" ? now : null,
      updatedAt: now,
      version: sql`${users.version} + 1`
    }).where(eq(users.id, subject.id));
    await tx.delete(classAssignments).where(eq(classAssignments.userId, subject.id));
    if (input.badge !== "spouse" && input.graduationYear !== null) {
      await tx.insert(classAssignments).values({
        userId: subject.id,
        classYear: input.graduationYear,
        assignedByUserId: input.administratorUserId
      });
    }
    await tx.update(sessions).set({ revokedAt: now, revocationReason: "account-administration-change", updatedAt: now })
      .where(and(eq(sessions.userId, subject.id), isNull(sessions.revokedAt)));
    await tx.insert(auditEvents).values({
      actorUserId: input.administratorUserId,
      subjectUserId: subject.id,
      action: "user.administration-updated",
      reason,
      before,
      after,
      occurredAt: now
    });
  });
}

export async function importRosterRowsAuthorized(
  db: Database,
  input: {
    administratorUserId: string;
    administratorSessionId: string;
    rows: readonly RosterImportRow[];
    sourceBatchId: string;
    now?: Date;
  }
): Promise<{ inserted: number; duplicates: number }> {
  if (input.rows.length === 0) throw new Error("No valid roster rows were provided.");
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    await assertAdministrativeSession(tx, {
      administratorUserId: input.administratorUserId,
      administratorSessionId: input.administratorSessionId,
      capability: "roster:import",
      now
    });
    let inserted = 0;
    for (const row of input.rows) {
      const created = await tx.insert(rosterEntries).values({
        fullName: row.fullName,
        normalizedFullName: row.normalizedFullName,
        email: row.email,
        normalizedEmail: row.normalizedEmail,
        badge: row.badge,
        graduationYear: row.graduationYear,
        sourceBatchId: input.sourceBatchId,
        importedByUserId: input.administratorUserId,
        createdAt: now,
        updatedAt: now
      }).onConflictDoNothing().returning({ id: rosterEntries.id });
      inserted += created.length;
    }
    const duplicates = input.rows.length - inserted;
    await tx.insert(auditEvents).values({
      actorUserId: input.administratorUserId,
      action: "roster.imported",
      after: { sourceBatchId: input.sourceBatchId, submitted: input.rows.length, inserted, duplicates },
      occurredAt: now
    });
    return { inserted, duplicates };
  });
}

export interface AuditEventView {
  id: string;
  action: string;
  actorName: string | null;
  subjectName: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  occurredAt: Date;
}

export async function listAuditEvents(db: Database, limit = 200): Promise<readonly AuditEventView[]> {
  const events = await db.select().from(auditEvents).orderBy(sql`${auditEvents.occurredAt} desc`).limit(Math.min(Math.max(limit, 1), 500));
  const userIds = [...new Set(events.flatMap((event) => [event.actorUserId, event.subjectUserId]).filter((id): id is string => id !== null))];
  const names = userIds.length === 0 ? [] : await db.select({ id: users.id, displayName: users.displayName }).from(users).where(inArray(users.id, userIds));
  const nameById = new Map(names.map((user) => [user.id, user.displayName]));
  return events.map((event) => ({
    id: event.id,
    action: event.action,
    actorName: event.actorUserId ? nameById.get(event.actorUserId) ?? "Deleted account" : null,
    subjectName: event.subjectUserId ? nameById.get(event.subjectUserId) ?? "Deleted account" : null,
    reason: event.reason,
    before: event.before,
    after: event.after,
    occurredAt: event.occurredAt
  }));
}
