# ADR 0001: Milestone 1 authentication and data foundation

- Status: Accepted
- Date: 2026-07-22

## Context

Milestone 1 introduces verified-roster registration, administrator approval, password authentication, TOTP for super administrators, secure sessions, password reset, login history, audit evidence, and transactional notification delivery. The implementation must remain deployable on Vercel without binding production data to a specific managed database or email vendor.

## Decisions

### PostgreSQL and Drizzle ORM

Use PostgreSQL through `pg` and Drizzle ORM. Drizzle provides typed, parameterized queries while keeping the relational schema and migrations explicit and reviewable. The application accepts a standard `DATABASE_URL`, so PostgreSQL may be self-hosted or supplied by any compatible managed provider.

Schema definitions and repositories live in `packages/db`. Checked-in SQL migrations are the deployment artifact. Production migrations are run separately from application startup.

### Passwords and high-entropy tokens

Use the `argon2` package in Argon2id mode for passwords. Parameters are centralized and encoded into each stored hash so they can be strengthened over time.

Sessions and password-reset links use at least 256 bits of cryptographic randomness. Only SHA-256 digests of these high-entropy tokens are stored. Password-reset tokens are single-use and short-lived.

### Sessions

Use opaque database-backed sessions in Secure, HttpOnly, SameSite=Lax cookies. Sessions have idle and absolute expirations, a revocation timestamp, and an authentication assurance level. Tokens rotate after login, approval, password or role changes, and TOTP verification. Protected reads require both a valid session and an active user.

### TOTP and recovery codes

Use `otpauth` for RFC-compatible TOTP calculation and verification. Encrypt TOTP secrets with AES-256-GCM using a dedicated environment key. Recovery codes are generated with cryptographic randomness and stored only as one-time hashes.

### Validation, CSV, and email

Use Zod at environment and request boundaries. Use `csv-parse` for strict roster CSV parsing and keep preview/import logic in an application service. Email is expressed through a provider-neutral interface. The local adapter emits redacted metadata and development-safe message bodies but never credentials or raw tokens.

### Authorization and audit

Keep authorization decisions in `packages/domain` and enforce them again at every server read and mutation. Registration decisions use a row lock and a single database transaction. Audit events are append-only at the database-permission and application-repository layers; the application exposes no update or delete operation.

### Rate limiting

Define a provider-neutral rate-limit interface. Milestone 1 uses PostgreSQL counters so security behavior is consistent without selecting a recurring-cost Redis vendor. A Redis adapter can replace it later without changing authentication flows.

## Consequences

- Native Argon2 binaries must be verified in local, CI, and Vercel Linux builds.
- Database integration tests require PostgreSQL rather than an in-memory SQL approximation.
- Email delivery remains in log mode until the owner selects a production provider.
- The application cannot treat middleware, public routing, or hidden UI as an authorization boundary.

## Rejected alternatives

- Magic links as primary authentication: conflicts with the authoritative product decision.
- Hosted authentication platforms: introduce vendor selection and move core approval/session policy outside the application.
- Prisma: capable, but Drizzle keeps generated runtime surface smaller and SQL migrations more direct for this repository.
- Storing plaintext session/reset tokens or TOTP secrets: fails the threat model.
- Redis-only throttling in Milestone 1: would force a production vendor decision before one is required.
