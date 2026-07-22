import { createHmac, randomBytes } from "node:crypto";
import { constantTimeEqual } from "./tokens";

export interface CsrfPair {
  cookieSecret: string;
  formToken: string;
}

function signCsrfSecret(cookieSecret: string, signingSecret: string): string {
  return createHmac("sha256", signingSecret).update(cookieSecret, "utf8").digest("base64url");
}

export function createCsrfPair(signingSecret: string): CsrfPair {
  const cookieSecret = randomBytes(32).toString("base64url");
  return { cookieSecret, formToken: signCsrfSecret(cookieSecret, signingSecret) };
}

export function verifyCsrf(cookieSecret: string | undefined, formToken: string | undefined, signingSecret: string): boolean {
  if (!cookieSecret || !formToken) return false;
  return constantTimeEqual(signCsrfSecret(cookieSecret, signingSecret), formToken);
}

export function isTrustedOrigin(origin: string | null, applicationUrl: string): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(applicationUrl).origin;
  } catch {
    return false;
  }
}
