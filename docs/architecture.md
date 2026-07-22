# Architecture baseline

## Decision

HWA Connect begins as a pnpm monorepo with a server-rendered Next.js web application and framework-agnostic TypeScript packages. PostgreSQL is the source of truth; Redis supports queues, rate limits, cache, and ephemeral presence; private S3-compatible storage owns media. Providers remain behind adapters.

## Boundaries

- `apps/web`: member/admin web experience and server endpoints.
- `packages/domain`: pure policy, validation, and business rules with no UI or database dependency.
- `packages/ui`: accessible components and brand tokens.
- Future packages: `db`, `realtime`, `media`, `email`, and `testing` enter only when their milestone needs executable behavior.

Authentication will use opaque, rotated server sessions in Secure, HttpOnly, SameSite cookies. Protected reads require active membership and object-level policy checks. Events that fan out to realtime, notifications, analytics, and audit will use a transactional outbox. Background jobs must carry idempotency keys.

## Environments

Local, preview, staging, and production use separate credentials and data stores. Local and preview accept synthetic data only. Production migration execution is a distinct gated deployment step with backup verification and a documented rollback/forward-fix decision.

## Architecture decisions

1. Node 24 LTS is the production baseline.
2. Next.js 16.2 and React 19.2 are pinned, including security patches. TypeScript 6 is pinned until the lint ecosystem supports TypeScript 7.
3. PostgreSQL search with full-text and trigram indexes is the launch search engine.
4. The signature date gate never sets identity or authorization state.
5. No provider SDK may appear in domain policy code.
