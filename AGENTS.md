# HWA Connect Project Instructions

## Product scope

- Build a private alumni community for Herbert W. Armstrong College.
- Preserve the existing HWA brand system and responsive Milestone 0 dashboard.
- The root route is a branded briefcase combination-lock ritual using January 16, 1985. The ritual is never authentication and must never expose protected data.
- Alumni authenticate with email and password. Super admins additionally require TOTP.
- Only active accounts may read protected community content.

## Identity and authorization

- Roles are `member` and `super-admin`.
- Badges are `two-year`, `four-year`, and `spouse`.
- Graduate years are 2001 through 2026. Spouses have no year or class-group membership.
- Name, year, badge, role, approval state, and class assignments are admin-controlled.
- Registration must match normalized full name and email against a verified roster on the server, while all public responses remain generic.
- Only an active super admin with recently verified TOTP and explicit reviewer designation may review registrations.
- Enforce authorization on every protected server read and mutation; UI visibility is never an authorization boundary.

## Security invariants

- Hash passwords with Argon2id.
- Store only hashes of session and password-reset tokens.
- Use Secure, HttpOnly, SameSite cookies and rotate sessions after login, approval, password or role changes, and 2FA verification.
- Implement CSRF protection, safe redirect validation, input validation, progressive throttling, login history, append-only audit events, and generic auth/registration errors.
- Encrypt TOTP secrets at rest and store recovery codes as one-time hashes.
- Never log or commit passwords, tokens, recovery codes, secrets, production credentials, or real alumni data.
- Local and test fixtures must use synthetic data and reserved `example.test` addresses.

## Architecture

- Keep the pnpm monorepo boundaries: `apps/web` for Next.js UI/server endpoints, `packages/domain` for pure policy, `packages/ui` for shared UI, and `packages/db` for PostgreSQL access and migrations.
- PostgreSQL is the system of record. Keep email, rate limiting, storage, and other providers behind adapters.
- Use secure, non-sequential public identifiers, foreign keys, constraints, indexes, timestamps, and transactional approval decisions.
- Database migrations are reviewed artifacts. Production migration execution is a separate gated deployment step.
- Do not place provider SDKs in domain policy code.

## Required flows

- Public: `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/pending`.
- Protected member: `/home`, `/profile`, `/directory`.
- Protected admin: `/admin/setup-2fa`, `/admin/registrations`, `/admin/users`, `/admin/audit`.
- Support registration, approval/rejection, password reset, login/logout, logout all devices, session revocation, login history, TOTP, recovery codes, roster CSV import with preview and duplicate detection, and audited admin actions.

## Working method

- Work only on `milestone-1-auth-approval`; never push directly to `main` or modify `milestone-0-design-foundation`.
- Work in small coherent stages. Before each commit, review the diff.
- After every stage run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`; fix every failure.
- Use descriptive commits and push only to `origin/milestone-1-auth-approval`.
- Keep `.next`, dependencies, coverage, local environment files, and generated secrets out of Git.
- Continue autonomously unless a decision materially affects security, production data ownership, recurring hosting cost, third-party vendor selection, or irreversible database architecture.
