import { and, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import type { Database } from "./connection";
import { emailOutbox } from "./schema";

export type ClaimedEmailJob = typeof emailOutbox.$inferSelect;

export async function claimEmailJobs(db: Database, limit: number, now = new Date()): Promise<readonly ClaimedEmailJob[]> {
  const boundedLimit = Math.min(Math.max(limit, 1), 100);
  return db.transaction(async (tx) => {
    const staleBefore = new Date(now.getTime() - 15 * 60 * 1000);
    await tx.update(emailOutbox).set({ status: "failed", lastErrorCode: "worker-timeout", availableAt: now, updatedAt: now })
      .where(and(eq(emailOutbox.status, "processing"), lte(emailOutbox.updatedAt, staleBefore)));
    const jobs = await tx.select().from(emailOutbox).where(and(
      or(eq(emailOutbox.status, "pending"), eq(emailOutbox.status, "failed")),
      lte(emailOutbox.availableAt, now),
      lt(emailOutbox.attempts, 5)
    )).orderBy(emailOutbox.availableAt).limit(boundedLimit).for("update", { skipLocked: true });
    if (jobs.length === 0) return [];
    await tx.update(emailOutbox).set({ status: "processing", attempts: sql`${emailOutbox.attempts} + 1`, updatedAt: now })
      .where(inArray(emailOutbox.id, jobs.map(({ id }) => id)));
    return jobs.map((job) => ({ ...job, status: "processing" as const, attempts: job.attempts + 1 }));
  });
}

export async function markEmailSent(db: Database, id: string, now = new Date()): Promise<void> {
  await db.update(emailOutbox).set({ status: "sent", sentAt: now, lastErrorCode: null, updatedAt: now })
    .where(and(eq(emailOutbox.id, id), eq(emailOutbox.status, "processing")));
}

export async function markEmailFailed(db: Database, id: string, attempts: number, errorCode: string, now = new Date()): Promise<void> {
  const delayMs = Math.min(24 * 60 * 60 * 1000, 60_000 * (2 ** Math.max(0, attempts - 1)));
  await db.update(emailOutbox).set({
    status: "failed",
    attempts,
    lastErrorCode: errorCode.slice(0, 80),
    availableAt: new Date(now.getTime() + delayMs),
    updatedAt: now
  }).where(and(eq(emailOutbox.id, id), eq(emailOutbox.status, "processing")));
}
