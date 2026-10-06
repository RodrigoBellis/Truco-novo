-- Keep callable only the RPCs required by the application roles.
-- Trigger functions are invoked by their triggers and do not need API EXECUTE grants.
begin;

revoke execute on function public.truco_rpc_champions_ranking() from public, anon, authenticated;
grant execute on function public.truco_rpc_champions_ranking() to service_role;

revoke execute on function public.truco_rpc_standings(uuid, uuid) from public, anon, authenticated;
grant execute on function public.truco_rpc_standings(uuid, uuid) to service_role;

revoke execute on function public.truco_validate_manual_edition_team_capacity() from public, anon, authenticated, service_role;
revoke execute on function public.truco_validate_team_membership() from public, anon, authenticated, service_role;

commit;
