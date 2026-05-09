-- migration: add private.delete_inspection function
-- purpose: provide an atomic inspection deletion path that checks ownership
-- and detects lock contention in a single transaction. using FOR UPDATE NOWAIT
-- prevents silent data loss when a concurrent save is in progress.
-- affected objects: private schema, private.delete_inspection
-- special considerations: the function lives in the private schema so it is
-- not exposed through the PostgREST API surface. execute is restricted to
-- service_role. the service layer may also use a direct DELETE with an
-- explicit user_id filter as an alternative approach.

begin;

-- Create the private schema for server-only SQL functions that must not be
-- accessible through the PostgREST REST API.
create schema if not exists private;

-- Revoke default public usage on the private schema to enforce the isolation.
revoke usage on schema private from public;
grant usage on schema private to service_role;

create or replace function private.delete_inspection(
  p_user_id        uuid,
  p_inspection_id  uuid
)
returns uuid
language plpgsql
security definer
as $function$
declare
  v_inspection_id uuid;
begin
  -- Attempt to lock the target inspection row exclusively and without waiting.
  -- NOWAIT causes PostgreSQL to raise lock_not_available immediately when the
  -- row is already locked by a concurrent write transaction (e.g. a snapshot
  -- sync), instead of blocking until the lock is released.
  begin
    select id
      into v_inspection_id
      from public.inspections
     where id = p_inspection_id
       and user_id = p_user_id
       for update nowait;
  exception
    when lock_not_available then
      raise exception 'INSPECTION_LOCKED'
        using
          hint    = 'The inspection is currently locked by an active save operation. Please try again shortly.',
          errcode = 'P0002';
  end;

  -- No row was found: either the inspection does not exist or it belongs to a
  -- different user. Both cases are reported as NOT_FOUND to avoid leaking
  -- information about resource existence to unauthorised callers.
  if v_inspection_id is null then
    raise exception 'NOT_FOUND'
      using
        hint    = 'The inspection does not exist or does not belong to the requesting user.',
        errcode = 'P0003';
  end if;

  -- Perform the hard delete now that ownership is confirmed and the row is locked.
  delete from public.inspections where id = v_inspection_id;

  return v_inspection_id;
end;
$function$;

-- Restrict execute to service_role only. The function must never be callable
-- by the anon or authenticated roles through PostgREST RPC.
revoke execute on function private.delete_inspection(uuid, uuid) from public;
grant execute on function private.delete_inspection(uuid, uuid) to service_role;

commit;
