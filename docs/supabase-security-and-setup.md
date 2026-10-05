# Supabase setup and security map

## Local environment

Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`. Fill values from a **test/staging Supabase project**. Never commit either `.env` file. Required names:

- Backend: `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; optional `TRUCO_DEFAULT_PASSWORD`.
- Frontend: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

The frontend key is public by design. The backend service role key is secret and must only exist on the server.

## Migration

Review and apply `supabase/migrations/202610050001_manual_edition_participation.sql` to a staging database first. This migration creates edition-scoped participation, copies two-person legacy team memberships, adds strength constraints, scopes browser reads, blocks browser writes, and adds an atomic score-plus-audit RPC. It does not delete legacy rows and must not be run against production until the backfill has been reviewed. This repository session had no reliable Supabase connection, so the migration has **not** been applied or tested remotely.

## Operation map

| Operation | Path | Authorization |
| --- | --- | --- |
| Login, roster, players, teams, groups, matches, standings, schedule, bracket | Express API | Supabase JWT checked by `requireAuth`; mutations additionally use `requireRole` or own-team match checks |
| Score create/correction | Express API → `truco_rpc_record_match_result` | Actor is the middleware-verified Auth user; player must belong to either match team; admin may edit any match |
| Hall of Fame and current-edition label | Browser → Supabase REST | Public read policies only; no browser write grants |
| Match realtime | Browser → Supabase Realtime | Authenticated SELECT policy: own matches and completed matches in the player's group; admin sees all |
| Avatar upload | Express API → Supabase Storage | Authenticated user's own player ID; bucket must exist and server role is used for upload |
| Account provisioning/password administration | Backend scripts → Supabase Auth Admin API | Server service role; run manually with controlled temporary password |

All browser roles have table write privileges revoked for tournament data. Because Express uses `service_role` and bypasses RLS, each mutation route must keep its server-side role/ownership validation. RLS is defense-in-depth for direct browser access; it does not replace Express authorization.

## Edition rules currently encoded

The administrator assigns 10 active teams, five to each group. The group fixture action creates 10 round-robin matches per group (20 total). Position 1 goes to the semifinal, positions 2–4 enter the repechage, and position 5 is eliminated. Repechage pairings and progression remain blocked until the administrator defines the cross-group bracket.

## Playwright

Run local E2E tests with `npm run test:e2e`; they use controlled HTTP responses to inspect UI workflows and do not mutate Supabase. For real staging runs, set `PLAYWRIGHT_BASE_URL` to the deployed staging URL and use dedicated non-production accounts/data. Never put credentials in source files or test reports.
