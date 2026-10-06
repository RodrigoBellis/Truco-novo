# Supabase setup and security map

This repository uses a shared Supabase project for Truco and other applications. The configured Truco project reference is `sfllpogpuqukhjddwiel`; confirm the target project in Supabase before every remote change. Only `truco_*` objects and the `avatars` Storage bucket are in the scope of this application. Do not change CRM, messaging, or other application objects from a Truco task.

Current teams, players, memberships, fixtures, and results in this project are **test data**. Preserve them during setup and schema work; do not treat them as production records or delete/reseed them without a separate explicit request. The current test fixture contains 10 teams, 10 edition-scoped memberships, and 2 groups.

## Local environment

Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`. Fill values from a **test/staging Supabase project**. Never commit either `.env` file. Required names:

- Backend: `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; optional `TRUCO_DEFAULT_PASSWORD`.
- Frontend: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

The frontend key is public by design. The backend service role key is secret and must only exist on the server.

## Migration and remote state

The migration `202610050001_manual_edition_participation.sql` creates edition-scoped participation, backfills valid two-person legacy memberships without deleting legacy rows, adds constraints and triggers, scopes browser reads, blocks browser writes, and adds a score-plus-audit RPC. It has been applied to the configured project (remote migration version `20261005230914`). The roster endpoint was verified returning HTTP 200 after application.

The migration `202610050002_player_avatars.sql` documents the intended public bucket configuration (2 MiB; JPEG, PNG, WebP). The bucket was initially missing those limits. Its upsert was applied remotely as migration `configure_player_avatar_bucket` (remote version `20261005232217`). Public reads are intentional for player photos; uploads remain through the authenticated API.

The Hall of Fame RPC `truco_rpc_champions_ranking()` was callable by `anon`; current Hall of Fame pages use public-read policies and the server computes the major-champions ranking, so its execute privilege was restricted to `service_role`. `truco_rpc_standings` is backend-only and is restricted to `service_role`. Direct EXECUTE grants were removed from the two trigger-only validation functions; table triggers continue invoking them. These changes were applied remotely in migration `harden_truco_rpc_grants` (remote version `20261005232535`). Functions supporting auth/RLS and the authenticated admin tie-resolution RPC retain their required grants. Security/performance advisors cover the entire shared project; do not remediate findings on non-Truco objects under this app's scope.

## Operation map

| Operation | Path | Authorization |
| --- | --- | --- |
| Login, roster, players, teams, groups, matches, standings, schedule, bracket | Express API | Supabase JWT checked by `requireAuth`; mutations additionally use `requireRole` or own-team match checks |
| Score create/correction | Express API → `truco_rpc_record_match_result` | Actor is the middleware-verified Auth user; player must belong to either match team; admin may edit any match |
| Hall of Fame and current-edition label | Browser → Supabase REST | Public read policies only; no browser write grants |
| Match realtime | Browser → Supabase Realtime | Authenticated SELECT policy: own matches and completed matches in the player's group; admin sees all |
| Avatar upload | Express API → Supabase Storage | Authenticated user's own player ID; API validates type/size and server role uploads to the public `avatars` bucket created by migration `202610050002_player_avatars.sql` |
| Account provisioning/password administration | Backend scripts → Supabase Auth Admin API | Server service role; run manually with controlled temporary password |

## Instructions for coding agents

The root `AGENTS.md` points here. Before changing Supabase, read this document, identify and verify the project reference without printing keys, inspect current remote migration history, and make a new versioned migration in `supabase/migrations/` for schema/configuration changes. Keep a matching local migration record for remote changes and document any unavoidable naming/version discrepancy. Never expose `.env`, API keys, service-role keys, tokens, or credential files in tool output, generated reports, or chat. Do not mutate objects outside the Truco scope listed above. After each DDL/configuration change, verify the affected setting and run a small read-only query or API check; report relevant Truco advisor findings separately from unrelated project-wide findings. Preserve all current test data.

All browser roles have table write privileges revoked for tournament data. Because Express uses `service_role` and bypasses RLS, each mutation route must keep its server-side role/ownership validation. RLS is defense-in-depth for direct browser access; it does not replace Express authorization. Avatar uploads are restricted by the authenticated API to the current player's own ID; reads are public by design for shared display.

## Browser session lifecycle

The shared project's Auth password policy currently requires at least six characters (confirmed by `updateUserById` returning `weak_password` on a four-character password). Do not lower that shared policy from a Truco-only task. On 2026-10-05, a user-authorized reset successfully updated all 21 Truco accounts (20 players and 1 superadmin) through the Auth Admin API, using the compliant password provided at runtime. `must_change_password` was cleared on those test profiles to allow direct test login. All 21 logins were verified through the local Express API; player and administrator team reads both returned HTTP 200 with all 10 teams. No roles, players, teams, or other applications' accounts were changed. Do not record the password or resulting sessions in documentation. The legacy four-character default in provisioning/reset scripts is incompatible with this policy; supply a compliant runtime password when using those scripts.

Password login uses a new isolated Supabase client from `createLoginClient()` for every request. Never call `supabaseAdmin.auth.signInWithPassword`: doing so replaces the shared server client's service-role bearer with a player's JWT, makes later requests subject to that player's RLS policies, and prevents other accounts from logging in. This failure was reproduced during reset verification and is covered by a regression test for sequential and concurrent logins. `supabaseAdmin` remains reserved for server database operations, JWT verification, and Auth Admin calls.

`frontend/src/lib/authSession.ts` owns the application session stored in `truco-do-novo:session`. The Auth provider waits for Supabase `setSession` to restore/refresh it before rendering protected routes. Its synchronous `onAuthStateChange` callback copies both rotated tokens into application storage and React state. API calls read the current Supabase session through `getAccessToken`, rather than reading a stale token directly from localStorage. Keep Auth calls outside the change-event callback to avoid an Auth lock deadlock. If renewal fails, clear the application session and show the login page.

The previous implementation restored Auth asynchronously while rendering protected pages immediately, and never updated application storage after a token refresh. This was reproduced with a real expired test-player session: Supabase refreshed successfully but `/teams`, `/dashboard`, and `/schedule/my-status` returned 401. After the fix the same browser flow and both group standings returned 200, and Início, Grupos, Jogos, Minha Dupla, Perfil, Maiores Campeões, and Hall da Fama rendered without error. A second manual refresh confirmed that both tokens were synchronized. Account password, role, and tournament records were unchanged; the test browser alone bypassed the cached first-password UI flag for the read-only page checks. Regression tests simulate Auth and API responses without storing real credentials or modifying Supabase.

## Edition rules currently encoded

The current test championship has 10 teams arranged across two groups. Championship rules encoded by the app: position 1 goes directly to the semifinal, positions 2–5 enter the repechage, and position 6 is eliminated where the configured format has six teams per group. Do not infer tournament structure from test rows; check the active championship and the application rules before data changes.

## Playwright

Run local E2E tests with `npm run test:e2e`; they use controlled HTTP responses to inspect UI workflows (including mobile avatar upload and shared display) and do not mutate Supabase. For real staging runs, set `PLAYWRIGHT_BASE_URL` to the deployed staging URL and use dedicated non-production accounts/data. Never put credentials in source files or test reports.
