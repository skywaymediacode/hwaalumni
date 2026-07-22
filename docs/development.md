# Development

## Prerequisites

- Node.js 24 LTS
- pnpm 11.9.0 through Corepack
- Docker with Compose (optional until persistence work begins)

## Start

1. Copy `.env.example` to `.env.local` and replace placeholder secrets.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm dev` and open `http://localhost:3000`.

Use `pnpm check` before review. Development email must remain in `log` mode and every fixture address must use the reserved `example.test` domain.

## Milestone 0 limitations

The visible dashboard is a design and responsive-shell preview using synthetic copy. Buttons are intentionally inert. Authentication, the signature lock, persistence, actual member content, PWA installation, and deployment infrastructure begin in later milestones.
