# Threat model — Milestone 0 baseline

## Assets and trust boundaries

Highest-value assets are member identity/contact data, private conversations, class-group membership, media originals, session credentials, reviewer decisions, admin capabilities, and audit evidence. Trust boundaries exist at the browser/server edge, server/data stores, upload quarantine/published storage, realtime fan-out, background queues, email/push providers, and administrator actions.

## Principal threats and required controls

| Threat | Boundary | Required control | Verification milestone |
|---|---|---|---|
| Broken object authorization | API/database | Deny by default; central policy; authorized query scope | 1 onward |
| Session theft/fixation | Browser/server | Opaque rotated HttpOnly cookies; CSRF; revocation; login history | 1 |
| Reviewer/admin takeover | Admin surface | Mandatory TOTP and recovery codes; step-up for critical changes | 1 |
| Roster enumeration | Registration | Generic responses; normalized exact email match; rate limits; audit | 1 |
| Stored XSS | Rich content | Allowlist sanitizer; CSP; safe links; no executable uploads | 3 |
| Cross-tenant realtime leak | Realtime | Authorize subscription and every fan-out audience | 3–4 |
| Malicious upload | Storage/workers | Quarantine; signature validation; scan; EXIF strip; isolated transcode | 3/6 |
| Search snippet leak | Search | Apply source authorization before retrieval/snippet generation | 3 onward |
| Precise location disclosure | Map | Canonical city centroid only; visibility setting; low-count policy | 7 |
| Privileged repudiation | Admin/data | Append-only/tamper-evident audit with actor/reason/before/after | 1/9 |
| Dependency/build compromise | CI/supply chain | Lockfile; read-only CI token; audit/SAST/secret scan; review updates | 0/10 |
| Data loss/ransomware | Operations | Encrypted backups, separate credentials, restore drills | 10 |

## Privacy invariants

- Never expose content, snippets, storage URLs, or presence before authorization.
- DMs are excluded from global search.
- Exact addresses and image GPS metadata are not retained for map display.
- Analytics are aggregate and do not infer sensitive traits.
- The date gate is assumed public knowledge and is never a security boundary.

Review this model at every milestone and after any provider or data-flow change.
