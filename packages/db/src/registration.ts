import { assertValidClassProfile, can, genericRegistrationResponse, normalizeEmail, normalizeFullName, type Actor, type Badge } from "@hwa/domain";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "./connection";
import {
  auditEvents,
  classAssignments,
  credentials,
  emailOutbox,
  registrationRequests,
  rosterEntries,
  sessions,
  totpFactors,
  users
} from "./schema";

export interface RegistrationInput {
  fullName: string;
  email: string;
  passwordHash: string;
}

export async function submitRosterRegistration(db: Database, input: RegistrationInput): Promise<{ publicMessage: string; created: boolean }> {
  const normalizedFullName = normalizeFullName(input.fullName);
  const normalizedEmail = normalizeEmail(input.email);

  const created = await db.transaction(async (tx) => {
    const [roster] = await tx.select().from(rosterEntries).where(and(
      eq(rosterEntries.normalizedFullName, normalizedFullName),
      eq(rosterEntries.normalizedEmail, normalizedEmail),
      isNull(rosterEntries.deletedAt)
    )).limit(1).for("update");
    if (!roster) return false;

    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.rosterEntryId, roster.id)).limit(1);
    if (existing) return false;

    const [user] = await tx.insert(users).values({
      rosterEntryId: roster.id,
      displayName: roster.fullName,
      normalizedFullName: roster.normalizedFullName,
      email: roster.email,
      normalizedEmail: roster.normalizedEmail,
      state: "pending"
    }).returning({ id: users.id });
    if (!user) throw new Error("Registration account was not created.");

    await tx.insert(credentials).values({ userId: user.id, passwordHash: input.passwordHash });
    await tx.insert(registrationRequests).values({ userId: user.id });
    await tx.insert(auditEvents).values({ subjectUserId: user.id, action: "registration.submitted", after: { state: "pending" } });
    await tx.insert(emailOutbox).values({
      userId: user.id,
      recipient: roster.email,
      template: "registration-received",
      publicMetadata: { displayName: roster.fullName }
    });
    return true;
  });

  return { publicMessage: genericRegistrationResponse, created };
}

interface ReviewInput {
  registrationRequestId: string;
  reviewerUserId: string;
  reviewerSessionId: string;
  reason: string;
  now?: Date;
}

export interface ApprovalInput extends ReviewInput {
  badge: Badge;
  graduationYear: number | null;
}

async function assertReviewer(tx: Parameters<Parameters<Database["transaction"]>[0]>[0], input: ReviewInput, now: Date): Promise<void> {
  const [reviewer] = await tx.select({
    user: users,
    session: sessions,
    factor: totpFactors
  }).from(users)
    .innerJoin(sessions, and(eq(sessions.id, input.reviewerSessionId), eq(sessions.userId, users.id)))
    .innerJoin(totpFactors, eq(totpFactors.userId, users.id))
    .where(and(eq(users.id, input.reviewerUserId), isNull(sessions.revokedAt)))
    .limit(1)
    .for("update");

  if (!reviewer || reviewer.session.absoluteExpiresAt <= now || reviewer.session.idleExpiresAt <= now || reviewer.factor.verifiedAt === null) {
    throw new Error("Registration review is not authorized.");
  }

  const actor: Actor = {
    id: reviewer.user.id,
    role: reviewer.user.role,
    state: reviewer.user.state,
    badge: reviewer.user.badge ?? "spouse",
    classYear: reviewer.user.graduationYear,
    assignedClassYears: [],
    isRegistrationReviewer: reviewer.user.isRegistrationReviewer,
    hasTwoFactor: true,
    totpVerifiedAt: reviewer.session.totpVerifiedAt
  };
  if (reviewer.session.assurance !== "mfa" || !can(actor, "registration:review", undefined, now)) {
    throw new Error("Registration review is not authorized.");
  }
}

export async function approveRegistration(db: Database, input: ApprovalInput): Promise<void> {
  const now = input.now ?? new Date();
  assertValidClassProfile({
    badge: input.badge,
    graduationYear: input.graduationYear,
    assignedClassYears: input.badge === "spouse" || input.graduationYear === null ? [] : [input.graduationYear]
  });

  await db.transaction(async (tx) => {
    await assertReviewer(tx, input, now);
    const [request] = await tx.select().from(registrationRequests)
      .where(eq(registrationRequests.id, input.registrationRequestId)).limit(1).for("update");
    if (!request || request.status !== "pending") throw new Error("Registration request is no longer pending.");

    const [subject] = await tx.select().from(users).where(eq(users.id, request.userId)).limit(1).for("update");
    if (!subject || subject.state !== "pending") throw new Error("Registration account is no longer pending.");

    const updated = await tx.update(registrationRequests).set({
      status: "approved",
      reviewerUserId: input.reviewerUserId,
      decisionReason: input.reason,
      decidedAt: now,
      updatedAt: now,
      version: sql`${registrationRequests.version} + 1`
    }).where(and(eq(registrationRequests.id, request.id), eq(registrationRequests.status, "pending"))).returning({ id: registrationRequests.id });
    if (updated.length !== 1) throw new Error("Registration request is no longer pending.");

    await tx.update(users).set({
      state: "active",
      badge: input.badge,
      graduationYear: input.graduationYear,
      approvedAt: now,
      updatedAt: now,
      version: sql`${users.version} + 1`
    }).where(eq(users.id, subject.id));

    await tx.delete(classAssignments).where(eq(classAssignments.userId, subject.id));
    if (input.badge !== "spouse" && input.graduationYear !== null) {
      await tx.insert(classAssignments).values({ userId: subject.id, classYear: input.graduationYear, assignedByUserId: input.reviewerUserId });
    }
    await tx.update(sessions).set({ revokedAt: now, revocationReason: "account-approved", updatedAt: now })
      .where(and(eq(sessions.userId, subject.id), isNull(sessions.revokedAt)));
    await tx.insert(auditEvents).values({
      actorUserId: input.reviewerUserId,
      subjectUserId: subject.id,
      action: "registration.approved",
      reason: input.reason,
      before: { state: subject.state, badge: subject.badge, graduationYear: subject.graduationYear },
      after: { state: "active", badge: input.badge, graduationYear: input.graduationYear }
    });
    await tx.insert(emailOutbox).values({
      userId: subject.id,
      recipient: subject.email,
      template: "registration-approved",
      publicMetadata: { displayName: subject.displayName }
    });
  });
}

export async function rejectRegistration(db: Database, input: ReviewInput): Promise<void> {
  const now = input.now ?? new Date();
  if (input.reason.trim().length < 3) throw new Error("A rejection reason is required.");

  await db.transaction(async (tx) => {
    await assertReviewer(tx, input, now);
    const [request] = await tx.select().from(registrationRequests)
      .where(eq(registrationRequests.id, input.registrationRequestId)).limit(1).for("update");
    if (!request || request.status !== "pending") throw new Error("Registration request is no longer pending.");
    const [subject] = await tx.select().from(users).where(eq(users.id, request.userId)).limit(1).for("update");
    if (!subject || subject.state !== "pending") throw new Error("Registration account is no longer pending.");

    const updated = await tx.update(registrationRequests).set({
      status: "rejected",
      reviewerUserId: input.reviewerUserId,
      decisionReason: input.reason,
      decidedAt: now,
      updatedAt: now,
      version: sql`${registrationRequests.version} + 1`
    }).where(and(eq(registrationRequests.id, request.id), eq(registrationRequests.status, "pending"))).returning({ id: registrationRequests.id });
    if (updated.length !== 1) throw new Error("Registration request is no longer pending.");

    await tx.update(users).set({ state: "rejected", updatedAt: now, version: sql`${users.version} + 1` }).where(eq(users.id, subject.id));
    await tx.update(sessions).set({ revokedAt: now, revocationReason: "registration-rejected", updatedAt: now })
      .where(and(eq(sessions.userId, subject.id), isNull(sessions.revokedAt)));
    await tx.insert(auditEvents).values({
      actorUserId: input.reviewerUserId,
      subjectUserId: subject.id,
      action: "registration.rejected",
      reason: input.reason,
      before: { state: subject.state },
      after: { state: "rejected" }
    });
    await tx.insert(emailOutbox).values({
      userId: subject.id,
      recipient: subject.email,
      template: "registration-rejected",
      publicMetadata: { displayName: subject.displayName }
    });
  });
}
