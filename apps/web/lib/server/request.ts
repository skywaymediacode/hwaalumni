import "server-only";

import { createHmac } from "node:crypto";
import { hashOpaqueToken, isTrustedOrigin, sessionCookieName } from "@hwa/auth";
import { findActiveSession, touchSession, type SessionAccount } from "@hwa/db";
import { can, type Actor } from "@hwa/domain";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRuntime } from "./runtime";

const idleSessionMs = 7 * 24 * 60 * 60 * 1000;

export async function assertTrustedMutationOrigin(): Promise<void> {
  const { environment } = getRuntime();
  const requestHeaders = await headers();
  if (!isTrustedOrigin(requestHeaders.get("origin"), environment.NEXT_PUBLIC_APP_URL)) {
    throw new Error("The request origin could not be verified.");
  }
}

export async function requestMetadata(): Promise<{ ipHash?: string; userAgent?: string }> {
  const { environment } = getRuntime();
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const direct = requestHeaders.get("x-real-ip")?.trim();
  const ip = forwarded || direct;
  const metadata: { ipHash?: string; userAgent?: string } = {};
  if (ip) metadata.ipHash = keyedHash("client-ip", ip, environment.SESSION_SECRET);
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 500);
  if (userAgent) metadata.userAgent = userAgent;
  return metadata;
}

export function keyedHash(bucket: string, value: string, secret: string): string {
  return createHmac("sha256", secret).update(`${bucket}\0${value}`, "utf8").digest("hex");
}

export async function readSession(options: { touch?: boolean } = {}): Promise<SessionAccount | null> {
  const cookieStore = await cookies();
  let runtime;
  try {
    runtime = getRuntime();
  } catch {
    return null;
  }
  const rawToken = cookieStore.get(sessionCookieName)?.value;
  if (!rawToken) return null;
  const now = new Date();
  const session = await findActiveSession(runtime.database.db, hashOpaqueToken(rawToken), now);
  if (!session) return null;
  if (options.touch) {
    const desiredIdleExpiry = new Date(now.getTime() + idleSessionMs);
    const cappedIdleExpiry = desiredIdleExpiry < session.absoluteExpiresAt ? desiredIdleExpiry : session.absoluteExpiresAt;
    await touchSession(runtime.database.db, session.sessionId, cappedIdleExpiry, now);
  }
  return session;
}

export function toActor(session: SessionAccount): Actor | null {
  if (!session.badge) return null;
  return {
    id: session.userId,
    role: session.role,
    state: session.state,
    badge: session.badge,
    classYear: session.graduationYear,
    assignedClassYears: session.assignedClassYears,
    isRegistrationReviewer: session.isRegistrationReviewer,
    hasTwoFactor: session.hasVerifiedTotp,
    totpVerifiedAt: session.totpVerifiedAt
  };
}

export async function requireActiveSession(): Promise<SessionAccount> {
  const session = await readSession({ touch: true });
  if (!session) redirect("/login");
  if (session.state === "pending") redirect("/pending");
  if (session.state !== "active" || !session.badge) redirect("/login?status=unavailable");
  if (session.role === "super-admin" && session.assurance !== "mfa") {
    redirect(session.hasVerifiedTotp ? "/login/verify-2fa" : "/admin/setup-2fa");
  }
  return session;
}

export async function requireAdministrator(): Promise<SessionAccount> {
  const session = await requireActiveSession();
  const actor = toActor(session);
  if (!actor || actor.role !== "super-admin" || session.assurance !== "mfa") redirect("/home");
  if (!can(actor, "admin:enter")) redirect("/login/verify-2fa");
  return session;
}
