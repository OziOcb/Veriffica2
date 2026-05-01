-- migration: disable app table rls
-- purpose: disable row-level security on the application tables whose access
-- policies were introduced by the initial schema migration.
-- affected objects: public.profiles, public.user_preferences,
-- public.inspections.
-- special considerations: this migration intentionally keeps the previously
-- defined policy objects in place but makes them inactive by disabling rls on
-- each table. this preserves migration history and allows a later migration to
-- re-enable rls without having to recreate every policy definition.

begin;

-- disable row-level security on the technical profile companion table. once
-- rls is disabled, all existing select/insert/update/delete policies on this
-- table stop being evaluated.
alter table public.profiles disable row level security;

-- disable row-level security on shared user preferences for the same reason:
-- policy objects remain defined in the catalog, but they no longer affect query
-- authorization while rls stays disabled.
alter table public.user_preferences disable row level security;

-- disable row-level security on inspections so the previously defined owner and
-- deny policies are fully inactive. this is a behavior change and should only
-- be used when higher-level trusted access controls are intentionally taking
-- over authorization.
alter table public.inspections disable row level security;

commit;