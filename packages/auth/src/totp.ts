import { randomBytes } from "node:crypto";
import * as OTPAuth from "otpauth";
import { hashOpaqueToken, type OpaqueToken } from "./tokens";

export interface TotpEnrollment {
  secret: string;
  uri: string;
}

function createTotp(secret: string, label: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: "HWA Connect",
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret)
  });
}

export function createTotpEnrollment(label: string): TotpEnrollment {
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  return { secret, uri: createTotp(secret, label).toString() };
}

export function verifyTotp(secret: string, token: string, now = new Date()): boolean {
  if (!/^\d{6}$/u.test(token)) return false;
  return createTotp(secret, "administrator").validate({ token, timestamp: now.getTime(), window: 1 }) !== null;
}

export interface RecoveryCode extends OpaqueToken {
  display: string;
}

export function createRecoveryCodes(count = 10): readonly RecoveryCode[] {
  return Array.from({ length: count }, () => {
    const compact = randomBytes(10).toString("hex").toUpperCase();
    const display = compact.match(/.{1,5}/gu)?.join("-") ?? compact;
    return { display, token: compact, hash: hashOpaqueToken(compact) };
  });
}

export function normalizeRecoveryCode(value: string): string {
  return value.replace(/[^a-fA-F0-9]/gu, "").toUpperCase();
}
