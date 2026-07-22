# Milestone 1 operations runbook

## Release order

1. Provision a PostgreSQL database and configure a connection string with TLS as required by the provider.
2. Configure the application and SMTP environment variables listed below in the deployment platform. Never place their values in Git.
3. Run `pnpm install --frozen-lockfile` and `pnpm check` in CI.
4. Run `pnpm --filter @hwa/db migrate` as a separate, explicitly approved release step. Application startup never runs migrations.
5. Run the one-time administrator bootstrap command from a trusted shell.
6. Deploy the web application.
7. Run `pnpm --filter @hwa/db email:dispatch` from a scheduler or worker. The scheduling provider is deliberately not selected by the application.

## Required environment

- `APP_ENV`: `production` in production; `preview` for a preview deployment.
- `NEXT_PUBLIC_APP_URL`: canonical HTTPS origin, with no path.
- `DATABASE_URL`: PostgreSQL connection string.
- `SESSION_SECRET`: at least 32 random characters.
- `TOTP_ENCRYPTION_KEY`: base64-encoded 32 random bytes.
- `OUTBOX_ENCRYPTION_KEY`: a different base64-encoded 32-byte key.
- `EMAIL_FROM`: sender name and address.
- `EMAIL_DELIVERY_MODE`: `provider` in production.
- `SMTP_HOST`, `SMTP_PORT`, and `SMTP_SECURE`: SMTP endpoint settings.
- `SMTP_USER` and `SMTP_PASSWORD`: configure both when the SMTP endpoint requires authentication.

Generate each encryption key independently in PowerShell:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

## Initial super administrator

The bootstrap refuses to overwrite an existing email. It creates an active super administrator and registration reviewer, then requires TOTP enrollment at first sign-in.

Set these variables only in the trusted shell that runs the command:

- `ADMIN_FULL_NAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_BADGE`: `spouse`, `two-year`, or `four-year`; defaults to `spouse`
- `ADMIN_GRADUATION_YEAR`: required for graduate badges and omitted for a spouse

Then run:

```powershell
pnpm --filter @hwa/db bootstrap:admin
```

Clear the password variable from the shell after the command. The password is never accepted as a command-line argument and is never logged.

## Email outbox

Registration, approval, rejection, password reset, and administrator-security messages are committed to the database inside the related transaction. The dispatcher claims jobs with row locking, retries failures with exponential backoff, recovers abandoned claims, and never logs message contents or sensitive reset links.

For local development, `EMAIL_DELIVERY_MODE=log` uses a redacting adapter. Production validation refuses log delivery and requires the SMTP adapter.

## Vercel project settings

- Import the GitHub repository and keep the repository root as the Vercel project root so pnpm workspaces remain available.
- Framework preset: Next.js.
- Install command: `pnpm install --frozen-lockfile`.
- Build command: `pnpm --filter @hwa/web build`.
- Add the production variables above to Production and use separate credentials and keys for Preview.
- Do not put database migrations in the Vercel build command.

The email dispatcher needs a scheduler or worker capable of running the pnpm command with the same database and SMTP environment. Selecting and paying for that scheduler remains a deployment-owner decision.

## Verification and rollback

- CI migrates an isolated PostgreSQL 16 service, executes unit and database integration tests, produces a production Next.js build, and runs desktop/mobile Chromium checks.
- After deployment, verify `/`, `/login`, roster-miss registration, anonymous `/home` redirection, administrator TOTP, a synthetic approval, email delivery, session revocation, and audit evidence.
- Roll application code back independently from the database. Database migration rollback requires a reviewed forward-repair migration; never edit a migration that has reached a shared environment.
