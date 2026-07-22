import { describe, expect, it, vi } from "vitest";
import * as OTPAuth from "otpauth";
import { createCsrfPair, isTrustedOrigin, verifyCsrf } from "./csrf";
import { ConsoleEmailAdapter } from "./email";
import { decryptValue, encryptValue } from "./encryption";
import { parseAuthEnvironment } from "./environment";
import { hashPassword, passwordHashNeedsUpgrade, verifyPassword } from "./password";
import { MemoryRateLimiter } from "./rate-limit";
import { createOpaqueToken, hashOpaqueToken } from "./tokens";
import { createRecoveryCodes, createTotpEnrollment, normalizeRecoveryCode, verifyTotp } from "./totp";

describe("password hashing", () => {
  it("uses Argon2id and verifies the correct password", async () => {
    const hash = await hashPassword("LongEnoughPassword42");
    expect(hash).toMatch(/^\$argon2id\$/u);
    expect(await verifyPassword(hash, "LongEnoughPassword42")).toBe(true);
    expect(await verifyPassword(hash, "WrongPassword42")).toBe(false);
    expect(passwordHashNeedsUpgrade(hash)).toBe(false);
  });
});

describe("opaque tokens and encryption", () => {
  it("stores a one-way token digest", () => {
    const value = createOpaqueToken();
    expect(value.token).not.toBe(value.hash);
    expect(value.hash).toBe(hashOpaqueToken(value.token));
    expect(value.hash).toHaveLength(64);
  });

  it("round-trips AES-256-GCM values", () => {
    const key = Buffer.alloc(32, 7);
    expect(decryptValue(encryptValue("totp-secret", key), key)).toBe("totp-secret");
  });
});

describe("CSRF and origins", () => {
  it("requires the matching signed token and trusted origin", () => {
    const pair = createCsrfPair("a".repeat(32));
    expect(verifyCsrf(pair.cookieSecret, pair.formToken, "a".repeat(32))).toBe(true);
    expect(verifyCsrf(pair.cookieSecret, pair.formToken, "b".repeat(32))).toBe(false);
    expect(isTrustedOrigin("https://connect.example.test", "https://connect.example.test/login")).toBe(true);
    expect(isTrustedOrigin("https://evil.example", "https://connect.example.test")).toBe(false);
  });
});

describe("progressive throttling", () => {
  it("blocks attempts with increasing delays", async () => {
    const limiter = new MemoryRateLimiter();
    const policy = { windowMs: 60_000, allowedAttempts: 2, baseBlockMs: 1_000, maximumBlockMs: 8_000 };
    expect((await limiter.consume("login", "mia", policy, new Date(0))).allowed).toBe(true);
    expect((await limiter.consume("login", "mia", policy, new Date(1))).allowed).toBe(true);
    expect(await limiter.consume("login", "mia", policy, new Date(2))).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect((await limiter.consume("login", "mia", policy, new Date(500))).allowed).toBe(false);
  });
});

describe("TOTP and recovery", () => {
  it("verifies a generated current TOTP", () => {
    const enrollment = createTotpEnrollment("admin@example.test");
    const url = new URL(enrollment.uri);
    const token = url.searchParams.get("secret");
    expect(token).toBe(enrollment.secret);
    const now = new Date("2026-01-01T00:00:00Z");
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(enrollment.secret) });
    expect(verifyTotp(enrollment.secret, totp.generate({ timestamp: now.getTime() }), now)).toBe(true);
  });

  it("creates one-time recovery values and hashes", () => {
    const [code] = createRecoveryCodes(1);
    expect(code).toBeDefined();
    expect(normalizeRecoveryCode(code!.display)).toBe(code!.token);
    expect(code!.hash).toBe(hashOpaqueToken(code!.token));
  });
});

describe("safe development email", () => {
  it("redacts reset links", async () => {
    const write = vi.fn();
    const adapter = new ConsoleEmailAdapter(write);
    await adapter.send({ to: "mia@example.test", template: "password-reset", subject: "Reset", text: "https://example.test/reset?token=secret", containsSensitiveLink: true });
    const entry = write.mock.calls[0]?.[0];
    expect(JSON.stringify(entry)).not.toContain("token=secret");
    expect(entry?.text).toContain("redacted");
  });
});

describe("production environment validation", () => {
  const base = {
    APP_ENV: "production",
    NEXT_PUBLIC_APP_URL: "https://connect.example.test",
    DATABASE_URL: "postgresql://user:pass@db.example.test/hwa",
    SESSION_SECRET: "s".repeat(32),
    TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    OUTBOX_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"),
    EMAIL_FROM: "HWA Connect <admin@example.test>",
    EMAIL_DELIVERY_MODE: "provider"
  };

  it("requires a production SMTP endpoint", () => {
    expect(() => parseAuthEnvironment(base)).toThrow(/SMTP_HOST/u);
  });

  it("accepts a complete provider-neutral SMTP configuration", () => {
    expect(parseAuthEnvironment({ ...base, SMTP_HOST: "smtp.example.test", SMTP_PORT: "587", SMTP_SECURE: "false" })).toMatchObject({ SMTP_PORT: 587, SMTP_SECURE: "false" });
  });
});
