"use server";

import {
  createOpaqueToken,
  createRecoveryCodes,
  decryptValue,
  encryptValue,
  gateCookieName,
  hashOpaqueToken,
  hashPassword,
  normalizeRecoveryCode,
  passwordPolicyIssues,
  recoveryDisplayCookieName,
  sessionCookieName,
  sessionCookieOptions,
  verifyPassword,
  verifyTotp
} from "@hwa/auth";
import {
  clearRateLimit,
  completeTotpEnrollment,
  consumePasswordReset,
  consumeRateLimit,
  consumeRecoveryCode,
  createSession,
  findCredentialAccount,
  findTotpFactor,
  issuePasswordReset,
  recordLoginHistory,
  revokeAllUserSessions,
  revokeOwnedSession,
  revokeSession,
  submitRosterRegistration
} from "@hwa/db";
import { genericRegistrationResponse, matchesBrandDate, normalizeEmail, safeInternalRedirect } from "@hwa/domain";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertTrustedMutationOrigin, keyedHash, readSession, requestMetadata } from "../lib/server/request";
import { getRuntime } from "../lib/server/runtime";

export interface FormState {
  status: "idle" | "success" | "error";
  message?: string;
}

const emailSchema = z.email().max(254);
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128), next: z.string().optional() });
const registrationSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: z.string().max(128),
  passwordConfirm: z.string().max(128)
});
const resetSchema = z.object({ token: z.string().min(20).max(200), password: z.string().max(128), passwordConfirm: z.string().max(128) });
const dummyHashPromise = hashPassword("HwaConnectDummyPassword1985");
const sessionIdleMs = 7 * 24 * 60 * 60 * 1000;
const sessionAbsoluteMs = 30 * 24 * 60 * 60 * 1000;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function error(message: string): FormState {
  return { status: "error", message };
}

async function setSessionCookie(rawToken: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, rawToken, sessionCookieOptions(Math.floor(sessionAbsoluteMs / 1000)));
}

async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
}

async function startSession(input: {
  userId: string;
  assurance: "password" | "mfa";
  totpVerifiedAt?: Date;
  rotateSessionId?: string;
}): Promise<void> {
  const { database } = getRuntime();
  const token = createOpaqueToken();
  const now = new Date();
  const metadata = await requestMetadata();
  await createSession(database.db, {
    ...input,
    tokenHash: token.hash,
    idleExpiresAt: new Date(now.getTime() + sessionIdleMs),
    absoluteExpiresAt: new Date(now.getTime() + sessionAbsoluteMs),
    ...metadata,
    now
  });
  await setSessionCookie(token.token);
}

export async function unlockGate(_state: FormState, formData: FormData): Promise<FormState> {
  try {
    await assertTrustedMutationOrigin();
    const { database, environment } = getRuntime();
    const metadata = await requestMetadata();
    const keyHash = keyedHash("gate", metadata.ipHash ?? "anonymous", environment.SESSION_SECRET);
    const decision = await consumeRateLimit(database.db, {
      bucket: "date-gate",
      keyHash,
      maxAttempts: 8,
      windowMs: 15 * 60 * 1000,
      baseBlockMs: 60_000,
      maxBlockMs: 60 * 60 * 1000
    });
    if (!decision.allowed) return error(`Please wait ${decision.retryAfterSeconds} seconds before trying again.`);

    const month = Number.parseInt(field(formData, "month"), 10);
    const day = Number.parseInt(field(formData, "day"), 10);
    const year = Number.parseInt(field(formData, "year"), 10);
    if (!matchesBrandDate(month, day, year)) return error("That combination did not open the case.");

    await clearRateLimit(database.db, "date-gate", keyHash);
    const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    const signature = keyedHash("gate-cookie", String(expiresAt), environment.SESSION_SECRET);
    const cookieStore = await cookies();
    cookieStore.set(gateCookieName, `${expiresAt}.${signature}`, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 24 * 60 * 60
    });
  } catch {
    return error("The portal is temporarily unavailable. Please try again shortly.");
  }
  redirect("/login");
}

export async function registerAccount(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = registrationSchema.safeParse({
    fullName: field(formData, "fullName"),
    email: field(formData, "email"),
    password: field(formData, "password"),
    passwordConfirm: field(formData, "passwordConfirm")
  });
  if (!parsed.success) return error("Enter a valid full name, email address, and password.");
  if (parsed.data.password !== parsed.data.passwordConfirm) return error("The passwords do not match.");
  const passwordIssues = passwordPolicyIssues(parsed.data.password);
  if (passwordIssues.length > 0) return error(passwordIssues[0] ?? "Choose a stronger password.");

  try {
    await assertTrustedMutationOrigin();
    const { database, environment } = getRuntime();
    const metadata = await requestMetadata();
    const normalizedEmail = normalizeEmail(parsed.data.email);
    const keyHash = keyedHash("register", `${metadata.ipHash ?? "anonymous"}:${normalizedEmail}`, environment.SESSION_SECRET);
    const decision = await consumeRateLimit(database.db, {
      bucket: "registration",
      keyHash,
      maxAttempts: 5,
      windowMs: 60 * 60 * 1000,
      baseBlockMs: 15 * 60 * 1000,
      maxBlockMs: 24 * 60 * 60 * 1000
    });
    if (!decision.allowed) return { status: "success", message: genericRegistrationResponse };
    const passwordHash = await hashPassword(parsed.data.password);
    await submitRosterRegistration(database.db, { fullName: parsed.data.fullName, email: parsed.data.email, passwordHash });
    return { status: "success", message: genericRegistrationResponse };
  } catch {
    return { status: "success", message: genericRegistrationResponse };
  }
}

export async function login(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: field(formData, "email"), password: field(formData, "password"), next: field(formData, "next") });
  if (!parsed.success) return error("Email or password is incorrect.");

  let destination = "/home";
  try {
    await assertTrustedMutationOrigin();
    const { database, environment } = getRuntime();
    const metadata = await requestMetadata();
    const normalizedEmail = normalizeEmail(parsed.data.email);
    const identityHash = keyedHash("login-identity", normalizedEmail, environment.SESSION_SECRET);
    const keyHash = keyedHash("login", `${metadata.ipHash ?? "anonymous"}:${normalizedEmail}`, environment.SESSION_SECRET);
    const decision = await consumeRateLimit(database.db, {
      bucket: "login",
      keyHash,
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
      baseBlockMs: 60_000,
      maxBlockMs: 60 * 60 * 1000
    });
    if (!decision.allowed) {
      await recordLoginHistory(database.db, { identityHash, outcome: "locked", ...metadata });
      return error("Email or password is incorrect. Please try again later.");
    }

    const account = await findCredentialAccount(database.db, normalizedEmail);
    const passwordValid = await verifyPassword(account?.passwordHash ?? await dummyHashPromise, parsed.data.password);
    if (!account || !passwordValid) {
      await recordLoginHistory(database.db, { ...(account ? { userId: account.userId } : {}), identityHash, outcome: "invalid", ...metadata });
      return error("Email or password is incorrect.");
    }

    if (account.state === "pending") {
      await startSession({ userId: account.userId, assurance: "password" });
      await recordLoginHistory(database.db, { userId: account.userId, identityHash, outcome: "pending", ...metadata });
      await clearRateLimit(database.db, "login", keyHash);
      destination = "/pending";
    } else if (account.state !== "active") {
      const outcome = account.state === "suspended" ? "suspended" : "invalid";
      await recordLoginHistory(database.db, { userId: account.userId, identityHash, outcome, ...metadata });
      return error("This account is not currently available. Contact an administrator for help.");
    } else if (account.role === "super-admin") {
      await startSession({ userId: account.userId, assurance: "password" });
      await recordLoginHistory(database.db, { userId: account.userId, identityHash, outcome: "mfa-required", ...metadata });
      await clearRateLimit(database.db, "login", keyHash);
      destination = account.hasVerifiedTotp ? "/login/verify-2fa" : "/admin/setup-2fa";
    } else {
      await startSession({ userId: account.userId, assurance: "password" });
      await recordLoginHistory(database.db, { userId: account.userId, identityHash, outcome: "success", ...metadata });
      await clearRateLimit(database.db, "login", keyHash);
      destination = safeInternalRedirect(parsed.data.next, "/home");
    }
  } catch {
    return error("Sign-in is temporarily unavailable. Please try again shortly.");
  }
  redirect(destination);
}

export async function requestPasswordReset(_state: FormState, formData: FormData): Promise<FormState> {
  const publicMessage = "If an eligible account exists for that address, a reset link will be sent.";
  const parsed = emailSchema.safeParse(field(formData, "email"));
  if (!parsed.success) return { status: "success", message: publicMessage };
  try {
    await assertTrustedMutationOrigin();
    const { database, environment, outboxEncryptionKey } = getRuntime();
    const metadata = await requestMetadata();
    const normalizedEmail = normalizeEmail(parsed.data);
    const keyHash = keyedHash("password-reset", `${metadata.ipHash ?? "anonymous"}:${normalizedEmail}`, environment.SESSION_SECRET);
    const decision = await consumeRateLimit(database.db, {
      bucket: "password-reset",
      keyHash,
      maxAttempts: 3,
      windowMs: 60 * 60 * 1000,
      baseBlockMs: 60 * 60 * 1000,
      maxBlockMs: 24 * 60 * 60 * 1000
    });
    if (decision.allowed) {
      const token = createOpaqueToken();
      const resetUrl = new URL("/reset-password", environment.NEXT_PUBLIC_APP_URL);
      resetUrl.searchParams.set("token", token.token);
      const encrypted = encryptValue(JSON.stringify({ resetUrl: resetUrl.toString() }), outboxEncryptionKey);
      await issuePasswordReset(database.db, {
        normalizedEmail,
        tokenHash: token.hash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        encryptedPayload: encrypted.ciphertext,
        encryptionIv: encrypted.iv,
        encryptionTag: encrypted.tag
      });
    }
  } catch {
    // Public reset responses intentionally do not reveal availability or account existence.
  }
  return { status: "success", message: publicMessage };
}

export async function resetPassword(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse({ token: field(formData, "token"), password: field(formData, "password"), passwordConfirm: field(formData, "passwordConfirm") });
  if (!parsed.success) return error("This reset link is invalid or incomplete.");
  if (parsed.data.password !== parsed.data.passwordConfirm) return error("The passwords do not match.");
  const passwordIssues = passwordPolicyIssues(parsed.data.password);
  if (passwordIssues.length > 0) return error(passwordIssues[0] ?? "Choose a stronger password.");
  try {
    await assertTrustedMutationOrigin();
    const { database } = getRuntime();
    const passwordHash = await hashPassword(parsed.data.password);
    const changed = await consumePasswordReset(database.db, { tokenHash: hashOpaqueToken(parsed.data.token), passwordHash });
    if (!changed) return error("This reset link is invalid or has expired.");
    await clearSessionCookie();
  } catch {
    return error("The password could not be changed. Please try again shortly.");
  }
  redirect("/login?reset=complete");
}

export async function verifyAdministratorSecondFactor(_state: FormState, formData: FormData): Promise<FormState> {
  const code = field(formData, "code").trim();
  try {
    await assertTrustedMutationOrigin();
    const session = await readSession();
    if (!session || session.role !== "super-admin" || session.state !== "active") {
      return error("Sign in again to continue.");
    }
    const { database, environment, totpEncryptionKey } = getRuntime();
    const metadata = await requestMetadata();
    const keyHash = keyedHash("totp", `${session.userId}:${metadata.ipHash ?? "anonymous"}`, environment.SESSION_SECRET);
    const decision = await consumeRateLimit(database.db, {
      bucket: "administrator-totp",
      keyHash,
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
      baseBlockMs: 60_000,
      maxBlockMs: 60 * 60 * 1000
    });
    if (!decision.allowed) return error("Verification failed. Please try again later.");
    const factor = await findTotpFactor(database.db, session.userId);
    if (!factor?.verifiedAt) return error("Two-factor authentication must be set up first.");
    const secret = decryptValue({ ciphertext: factor.encryptedSecret, iv: factor.encryptionIv, tag: factor.encryptionTag }, totpEncryptionKey);
    let verified = verifyTotp(secret, code);
    let usedRecovery = false;
    if (!verified) {
      const normalized = normalizeRecoveryCode(code);
      if (normalized.length > 0) {
        usedRecovery = await consumeRecoveryCode(database.db, session.userId, hashOpaqueToken(normalized));
        verified = usedRecovery;
      }
    }
    if (!verified) return error("The verification code was not accepted.");
    const now = new Date();
    await startSession({ userId: session.userId, assurance: "mfa", totpVerifiedAt: now, rotateSessionId: session.sessionId });
    await recordLoginHistory(database.db, {
      userId: session.userId,
      identityHash: keyedHash("login-identity", session.email, environment.SESSION_SECRET),
      outcome: usedRecovery ? "recovery-used" : "success",
      ...metadata,
      now
    });
    await clearRateLimit(database.db, "administrator-totp", keyHash);
  } catch {
    return error("Verification is temporarily unavailable. Please try again shortly.");
  }
  redirect("/admin/registrations");
}

export async function completeAdministratorTotpSetup(_state: FormState, formData: FormData): Promise<FormState> {
  const code = field(formData, "code").trim();
  try {
    await assertTrustedMutationOrigin();
    const session = await readSession();
    if (!session || session.role !== "super-admin" || session.state !== "active" || session.assurance !== "password") {
      return error("Sign in again to continue.");
    }
    const { database, totpEncryptionKey } = getRuntime();
    const factor = await findTotpFactor(database.db, session.userId);
    if (!factor || factor.verifiedAt) return error("Two-factor setup is not pending.");
    const secret = decryptValue({ ciphertext: factor.encryptedSecret, iv: factor.encryptionIv, tag: factor.encryptionTag }, totpEncryptionKey);
    if (!verifyTotp(secret, code)) return error("The verification code was not accepted.");
    const recovery = createRecoveryCodes();
    const now = new Date();
    await completeTotpEnrollment(database.db, {
      userId: session.userId,
      sessionId: session.sessionId,
      recoveryCodeHashes: recovery.map(({ hash }) => hash),
      now
    });
    await startSession({ userId: session.userId, assurance: "mfa", totpVerifiedAt: now });
    const encryptedCodes = encryptValue(JSON.stringify(recovery.map(({ display }) => display)), totpEncryptionKey);
    const displayPayload = Buffer.from(JSON.stringify(encryptedCodes), "utf8").toString("base64url");
    const cookieStore = await cookies();
    cookieStore.set(recoveryDisplayCookieName, displayPayload, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 10 * 60
    });
  } catch {
    return error("Two-factor setup could not be completed. Please try again.");
  }
  redirect("/admin/setup-2fa/recovery");
}

export async function finishAdministratorTotpSetup(): Promise<void> {
  await assertTrustedMutationOrigin();
  const session = await readSession();
  if (!session || session.role !== "super-admin" || session.assurance !== "mfa") redirect("/login");
  const cookieStore = await cookies();
  cookieStore.delete(recoveryDisplayCookieName);
  redirect("/admin/registrations");
}

export async function logout(): Promise<void> {
  try {
    await assertTrustedMutationOrigin();
    const session = await readSession();
    if (session) await revokeSession(getRuntime().database.db, session.sessionId, "user-logout");
  } finally {
    await clearSessionCookie();
  }
  redirect("/login");
}

export async function logoutAllDevices(): Promise<void> {
  try {
    await assertTrustedMutationOrigin();
    const session = await readSession();
    if (session) await revokeAllUserSessions(getRuntime().database.db, session.userId, "user-logout-all");
  } finally {
    await clearSessionCookie();
  }
  redirect("/login");
}

export async function revokeDeviceSession(formData: FormData): Promise<void> {
  await assertTrustedMutationOrigin();
  const session = await readSession();
  if (!session) redirect("/login");
  const targetSessionId = field(formData, "sessionId");
  if (!z.uuid().safeParse(targetSessionId).success || targetSessionId === session.sessionId) return;
  await revokeOwnedSession(getRuntime().database.db, session.userId, targetSessionId, "user-device-revoked");
  revalidatePath("/profile");
}
