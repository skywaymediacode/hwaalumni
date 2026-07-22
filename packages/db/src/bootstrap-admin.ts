import { hashPassword } from "@hwa/auth";
import { assertValidClassProfile, normalizeEmail, normalizeFullName, type Badge } from "@hwa/domain";
import { eq } from "drizzle-orm";
import { createDatabase } from "./connection";
import { auditEvents, classAssignments, credentials, users } from "./schema";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main(): Promise<void> {
  const databaseUrl = required("DATABASE_URL");
  const displayName = required("ADMIN_FULL_NAME").replace(/\s+/gu, " ");
  const email = required("ADMIN_EMAIL");
  const password = required("ADMIN_PASSWORD");
  const badge = (process.env.ADMIN_BADGE?.trim() || "spouse") as Badge;
  const rawYear = process.env.ADMIN_GRADUATION_YEAR?.trim();
  const graduationYear = badge === "spouse" || !rawYear ? null : Number.parseInt(rawYear, 10);
  if (!(["two-year", "four-year", "spouse"] as string[]).includes(badge)) throw new Error("ADMIN_BADGE is invalid.");
  assertValidClassProfile({
    badge,
    graduationYear,
    assignedClassYears: badge === "spouse" || graduationYear === null ? [] : [graduationYear]
  });
  const passwordHash = await hashPassword(password);
  const handle = createDatabase(databaseUrl);
  try {
    await handle.db.transaction(async (tx) => {
      const normalizedEmail = normalizeEmail(email);
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.normalizedEmail, normalizedEmail)).limit(1).for("update");
      if (existing) throw new Error("An account already exists for ADMIN_EMAIL; bootstrap will not overwrite it.");
      const [administrator] = await tx.insert(users).values({
        displayName,
        normalizedFullName: normalizeFullName(displayName),
        email,
        normalizedEmail,
        role: "super-admin",
        state: "active",
        badge,
        graduationYear,
        isRegistrationReviewer: true,
        approvedAt: new Date()
      }).returning({ id: users.id });
      if (!administrator) throw new Error("Administrator account was not created.");
      await tx.insert(credentials).values({ userId: administrator.id, passwordHash });
      if (badge !== "spouse" && graduationYear !== null) {
        await tx.insert(classAssignments).values({ userId: administrator.id, classYear: graduationYear, assignedByUserId: administrator.id });
      }
      await tx.insert(auditEvents).values({
        actorUserId: administrator.id,
        subjectUserId: administrator.id,
        action: "administrator.bootstrapped",
        after: { role: "super-admin", state: "active", isRegistrationReviewer: true }
      });
    });
    process.stdout.write("Initial super administrator created. TOTP enrollment is required at first sign-in.\n");
  } finally {
    await handle.pool.end();
  }
}

main().catch((cause: unknown) => {
  const message = cause instanceof Error ? cause.message : "Administrator bootstrap failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
