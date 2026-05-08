-- migration: add public.create_inspection function
-- purpose: provide an atomic inspection creation path that enforces the
-- per-user 2-inspection limit at the database layer. using an advisory lock
-- keyed on the user_id prevents the time-of-check/time-of-use race condition
-- that a separate count + insert approach would have.
-- affected objects: public.create_inspection
-- special considerations: the function uses security definer so it can write
-- to public.inspections despite the insert-denied rls policy. execute is
-- restricted to the service_role so the function cannot be called directly by
-- browser clients through postgrest.

begin;

-- The question bank version is embedded at inspection creation time and is
-- immutable thereafter. Update this constant when a new bank is released.
-- The snapshot schema version tracks the shape of the snapshot jsonb object.
create or replace function public.create_inspection(
  p_user_id             uuid,
  p_client_created_at   timestamptz
)
returns table (
  id                      uuid,
  title                   text,
  status                  text,
  question_bank_version   text,
  snapshot_schema_version text,
  snapshot_version        bigint,
  client_updated_at       timestamptz,
  created_at              timestamptz,
  updated_at              timestamptz,
  snapshot                jsonb,
  current_count           integer
)
language plpgsql
security definer
as $function$
declare
  v_existing_count  integer;
  v_new_row         public.inspections%rowtype;
  v_post_count      integer;
  v_minimal_snapshot jsonb := jsonb_build_object(
    'part_1',               null,
    'runtime_flags',        jsonb_build_object(
      'chargingPortEquipped',        false,
      'evBatteryDocsAvailable',      false,
      'turboEquipped',               false,
      'mechanicalCompressorEquipped', false,
      'importedFromEU',              false
    ),
    'answers',              '{}'::jsonb,
    'question_notes',       '{}'::jsonb,
    'global_notes',         ''::text,
    'visible_group_ids',    '[]'::jsonb,
    'visible_question_ids', '[]'::jsonb
  );
begin
  -- Acquire a transaction-level advisory lock keyed on the user_id so
  -- concurrent requests for the same user are serialised. The lock is
  -- automatically released when the transaction ends.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text)::bigint);

  -- Count existing inspections for this user while holding the lock.
  select count(*)::integer
    into v_existing_count
    from public.inspections
   where user_id = p_user_id;

  if v_existing_count >= 2 then
    raise exception 'INSPECTION_LIMIT_REACHED'
      using
        hint    = 'User has reached the maximum number of allowed inspections.',
        errcode = 'P0001';
  end if;

  -- Insert the new draft inspection with a canonical empty snapshot.
  -- title is 'Untitled inspection' until part 1 is saved and a proper title
  -- can be derived from the vehicle fields.
  insert into public.inspections (
    user_id,
    title,
    status,
    question_bank_version,
    snapshot_schema_version,
    snapshot_version,
    client_updated_at,
    snapshot
  ) values (
    p_user_id,
    'Untitled inspection',
    'draft',
    '2026-05-01',   -- CURRENT_QUESTION_BANK_VERSION: update when bank changes
    '1.0.0',        -- SNAPSHOT_SCHEMA_VERSION: update on breaking shape change
    1,
    p_client_created_at,
    v_minimal_snapshot
  )
  returning * into v_new_row;

  -- Count after insert so the caller can return accurate limit information.
  select count(*)::integer
    into v_post_count
    from public.inspections
   where user_id = p_user_id;

  return query
    select
      v_new_row.id,
      v_new_row.title,
      v_new_row.status,
      v_new_row.question_bank_version,
      v_new_row.snapshot_schema_version,
      v_new_row.snapshot_version,
      v_new_row.client_updated_at,
      v_new_row.created_at,
      v_new_row.updated_at,
      v_new_row.snapshot,
      v_post_count;
end;
$function$;

comment on function public.create_inspection(uuid, timestamptz) is
  'Atomically creates a new draft inspection for the given user. '
  'Raises P0001 INSPECTION_LIMIT_REACHED when the user already holds 2 inspections. '
  'Protected: only service_role may execute this function.';

-- Revoke default public/authenticated access so browser clients cannot call
-- this privileged function directly through postgrest.
revoke all on function public.create_inspection(uuid, timestamptz) from public;
revoke all on function public.create_inspection(uuid, timestamptz) from authenticated;
revoke all on function public.create_inspection(uuid, timestamptz) from anon;
grant execute on function public.create_inspection(uuid, timestamptz) to service_role;

commit;
