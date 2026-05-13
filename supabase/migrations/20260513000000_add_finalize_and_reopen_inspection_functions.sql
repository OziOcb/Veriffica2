-- migration: add public.finalize_inspection and public.reopen_inspection
-- purpose: provide atomic, lock-safe state transitions for the inspection
-- lifecycle: draft → completed (finalize) and completed → draft (reopen).
-- affected objects:
--   public.finalize_inspection
--   public.reopen_inspection
-- special considerations:
--   - both functions use the same advisory lock key strategy as existing
--     answer/notes functions: hashtext(user_id::text || ':' || inspection_id::text).
--   - security definer so they can write despite rls being disabled at the
--     table level; execute is restricted to service_role.
--   - ownership, snapshot_version (optimistic concurrency) and status pre-
--     conditions are re-verified inside the advisory lock to prevent toctou
--     races between the service-layer pre-check and the write.
--   - the private.prepare_inspection_row trigger handles snapshot_version
--     increment and updated_at stamping automatically on every meaningful update.
--   - neither function modifies snapshot content — they only change status and
--     completed_at, which are relational columns.
--   - client_updated_at is set to the server transaction timestamp because
--     these lifecycle commands carry no client-supplied timestamp.

begin;

-- ── public.finalize_inspection ─────────────────────────────────────────────

create or replace function public.finalize_inspection(
  p_user_id               uuid,
  p_inspection_id         uuid,
  p_base_snapshot_version bigint
)
returns table (
  snapshot_version bigint,
  completed_at     timestamptz
)
language plpgsql
security definer
as $function$
declare
  v_row      public.inspections%rowtype;
  v_lock_key bigint;
begin
  -- Derive a deterministic bigint advisory lock key from (user_id, inspection_id).
  v_lock_key := hashtext(p_user_id::text || ':' || p_inspection_id::text)::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  -- Fetch the current row while holding the advisory lock (prevents toctou).
  select *
    into v_row
    from public.inspections
   where public.inspections.id      = p_inspection_id
     and public.inspections.user_id = p_user_id;

  if not found then
    raise exception 'NOT_FOUND'
      using
        hint    = 'The inspection does not exist or does not belong to the requesting user.',
        errcode = 'P0003';
  end if;

  -- Re-verify snapshot_version inside the lock to detect concurrent writes.
  if v_row.snapshot_version <> p_base_snapshot_version then
    raise exception 'SNAPSHOT_CONFLICT'
      using
        hint    = 'The snapshot version is outdated. Refresh the inspection and retry.',
        errcode = 'P0004';
  end if;

  -- Business rule: only draft inspections can be finalized.
  if v_row.status <> 'draft' then
    raise exception 'INVALID_STATE'
      using
        hint    = 'Only draft inspections can be finalized.',
        errcode = 'P0005';
  end if;

  -- Atomically transition to completed.
  -- The trigger will increment snapshot_version because status changes.
  update public.inspections
     set status           = 'completed',
         completed_at     = now(),
         client_updated_at = now()
   where id      = p_inspection_id
     and user_id = p_user_id;

  -- Return the new snapshot_version and completed_at stamped by the trigger.
  select new_row.snapshot_version, new_row.completed_at
    into snapshot_version, completed_at
    from public.inspections as new_row
   where new_row.id      = p_inspection_id
     and new_row.user_id = p_user_id;

  return next;
end;
$function$;

revoke all on function public.finalize_inspection(uuid, uuid, bigint) from public;
grant execute on function public.finalize_inspection(uuid, uuid, bigint) to service_role;

-- ── public.reopen_inspection ───────────────────────────────────────────────

create or replace function public.reopen_inspection(
  p_user_id               uuid,
  p_inspection_id         uuid,
  p_base_snapshot_version bigint
)
returns table (
  snapshot_version bigint
)
language plpgsql
security definer
as $function$
declare
  v_row      public.inspections%rowtype;
  v_lock_key bigint;
begin
  -- Derive a deterministic bigint advisory lock key from (user_id, inspection_id).
  v_lock_key := hashtext(p_user_id::text || ':' || p_inspection_id::text)::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  -- Fetch the current row while holding the advisory lock (prevents toctou).
  select *
    into v_row
    from public.inspections
   where public.inspections.id      = p_inspection_id
     and public.inspections.user_id = p_user_id;

  if not found then
    raise exception 'NOT_FOUND'
      using
        hint    = 'The inspection does not exist or does not belong to the requesting user.',
        errcode = 'P0003';
  end if;

  -- Re-verify snapshot_version inside the lock to detect concurrent writes.
  if v_row.snapshot_version <> p_base_snapshot_version then
    raise exception 'SNAPSHOT_CONFLICT'
      using
        hint    = 'The snapshot version is outdated. Refresh the inspection and retry.',
        errcode = 'P0004';
  end if;

  -- Business rule: only completed inspections can be reopened.
  if v_row.status <> 'completed' then
    raise exception 'INVALID_STATE'
      using
        hint    = 'Only completed inspections can be reopened.',
        errcode = 'P0005';
  end if;

  -- Atomically transition back to draft and clear completed_at.
  -- The trigger will increment snapshot_version because status changes.
  update public.inspections
     set status            = 'draft',
         completed_at      = null,
         client_updated_at = now()
   where id      = p_inspection_id
     and user_id = p_user_id;

  -- Return the new snapshot_version stamped by the trigger.
  select new_row.snapshot_version
    into snapshot_version
    from public.inspections as new_row
   where new_row.id      = p_inspection_id
     and new_row.user_id = p_user_id;

  return next;
end;
$function$;

revoke all on function public.reopen_inspection(uuid, uuid, bigint) from public;
grant execute on function public.reopen_inspection(uuid, uuid, bigint) to service_role;

commit;
