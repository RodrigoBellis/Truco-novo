# Agent instructions

## Frontend and visual direction

Before changing player screens, read [`DESIGN.md`](DESIGN.md) and the implementation/validation report in [`docs/frontend-redesign-5th-edition.md`](docs/frontend-redesign-5th-edition.md). Preserve the eight player menu items (Mata-mata was added at the user's request on 2026-10-07), old-route redirects, shared team ownership, central scoring/qualification rules, real historical data, tied rankings, and mobile layouts. Frontend work does not authorize changing Supabase data. The opening screen uses the real cumulative ranking; it must remain skippable even if ranking data is unavailable.

## Supabase and tournament data

Before any Supabase work, read [`docs/supabase-security-and-setup.md`](docs/supabase-security-and-setup.md). The configured database is a shared project; only Truco-owned `truco_*` objects and the `avatars` bucket are in scope for this application. Current tournament teams, memberships, matches, and player records are test data and must be preserved. Never print or expose `.env` values, keys, tokens, or credentials.

Tournament rehearsals never run against the shared project. Use the in-memory rehearsal (`npm run test:rehearsal`) or the local homologation database (`docs/homologacao-local-20261009.md`); the production rollout plan and its open decisions are in `docs/plano-producao-5a-edicao.md`. Do not run the rehearsal and homologation suites at the same time (both use ports 3101 and 5183).

Verify the project reference and remote migration history before database changes. Keep SQL changes in versioned files under `supabase/migrations/`, apply only the necessary migration, then verify the changed schema/configuration and an affected read path. Do not modify CRM, messaging, or other application data/functions as part of Truco work. Do not commit or deploy unless the user explicitly asks.

When diagnosing authenticated pages, verify a real authenticated request or a browser flow; a public roster/health HTTP 200 alone does not confirm login works. Keep session handling centralized in `frontend/src/lib/authSession.ts` and preserve token-refresh synchronization. Never save real session credentials in tracked files, tests, traces, or reports. Read the session lifecycle section in the Supabase guide before changing Auth.

Backend password login must use an isolated `createLoginClient()` per request. Never sign a user in on the shared `supabaseAdmin` instance: that changes its bearer token and contaminates requests from other accounts. Include sequential/concurrent-account checks when modifying this flow.
