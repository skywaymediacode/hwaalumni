# Milestone 1 implementation sequence

## Acceptance boundary

Milestone 1 delivers roster-matched registration, approval/rejection, password login and reset, secure sessions, administrator TOTP and recovery codes, protected member routes, roster import, login history, and append-only audit evidence. Messaging, realtime presence, media uploads, and full directory/profile editing remain later milestones.

## Stages

1. **Repository instructions and architecture**
   - Add permanent `AGENTS.md` guidance.
   - Record database, password, session, TOTP, validation, rate-limit, and email choices in ADR 0001.
2. **Domain policy**
   - Validate account-state transitions, badge/year combinations, reviewer assurance, redirects, normalization, and registration decisions.
   - Add exhaustive unit tests.
3. **Persistence**
   - Add `packages/db`, Drizzle schema, checked-in SQL migration, connection factory, repositories, transactional approval, audit append, outbox, and roster import services.
4. **Authentication primitives**
   - Add environment validation, Argon2id password services, opaque session rotation/revocation, password resets, TOTP encryption/verification, recovery codes, CSRF, throttling, safe logging, and email adapters.
5. **Public experience**
   - Move the design preview to `/home`.
   - Build the permanent briefcase date ritual at `/`, then login, registration, forgot/reset password, and pending pages.
6. **Protected member experience**
   - Enforce active-session authorization on `/home`, `/profile`, and `/directory` using server-side guards.
7. **Administrator experience**
   - Add TOTP setup, registration review, user administration, audit inspection, and roster CSV preview/import.
8. **Verification and delivery**
   - Add database integration and browser tests, CI PostgreSQL service/migrations, security regression tests, production build verification, reviewed commits, and a feature-branch push.

## Security acceptance checks

- The date ritual reveals public forms only; it never creates identity or authorization state.
- Public registration and password-reset responses are indistinguishable for roster/account hits and misses.
- Pending, rejected, suspended, deactivated, roster-only, and soft-deleted accounts cannot read protected content.
- Approval is single-winner, transactional, audited, assigns valid class membership, revokes stale sessions, and creates an email outbox job.
- Review requires active super-admin status, designated reviewer permission, and recent TOTP verification.
- Password, session, reset, recovery, and TOTP secrets never appear in logs, client bundles, or database plaintext.
