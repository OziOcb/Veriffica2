-- migration: add public.save_inspection_snapshot function
-- purpose: provide an atomic, lock-safe path for the offline-first sync
-- endpoint to persist the fully merged canonical inspection snapshot in a
-- single transaction. the service layer computes the complete merged state
-- (part 1, runtime flags, answers, question notes, global notes, visibility
-- arrays) and passes it here as a pre-built jsonb; the function is responsible
-- only for conflict detection and persistence.
-- affected objects: public.save_inspection_snapshot
-- special considerations:
--   - uses the same advisory lock key strategy as save_inspection_part1 and
--     save_inspection_runtime_flags: hashtext(user_id::text || ':' || inspection_id::text).
--   - security definer so it can write despite rls being disabled at the table
--     level; execute is restricted to service_role.
--   - ownership, status guard (completed inspections block sync), and
--     snapshot_version conflict are all re-verified inside the lock to prevent
--     toctou races between the service-layer pre-check and the write.
--   - when p_update_part1 is true the function also updates the relational
--     projection columns (make, model, fuel_type, etc.) so dashboard and filter
--     queries stay accurate after a sync that patches part 1.
--   - the private.prepare_inspection_row trigger handles snapshot_version
--     increment and updated_at stamping on every update, so the function
--     returns the trigger-stamped values via returning *.

begin;

create or replace function public.save_inspection_snapshot(
  p_user_id               uuid,
  p_inspection_id         uuid,
  p_base_snapshot_version bigint,
  p_client_updated_at     timestamptz,
  -- complete canonical snapshot built and merged by the service layer
  p_new_snapshot          jsonb,
  -- when true, update relational projection columns from the part 1 params
  p_update_part1          boolean,
  p_title                 text,
  p_make                  text,
  p_model                 text,
  p_fuel_type             text,
  p_transmission          text,
  p_drive                 text,
  p_body_type             text,
  p_price                 numeric,
  p_year_of_production    integer,
  p_mileage               integer,
  p_number_of_doors       smallint,
  p_registration_number   text,
  p_vin_number            text,
  p_color                 text,
  p_address               text
)
returns table (
  id                uuid,
  title             text,
  status            text,
  snapshot_version  bigint,
  client_updated_at timestamptz,
  updated_at        timestamptz
)
language plpgsql
security definer
as $function$
declare
  v_row      public.inspections%rowtype;
  v_lock_key bigint;
begin
  -- Derive a deterministic bigint advisory lock key from (user_id, inspection_id).
  -- hashtext operates on text so we concatenate both UUIDs with a separator.
  v_lock_key := hashtext(p_user_id::text || ':' || p_inspection_id::text)::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  -- Fetch the current row while holding the lock to prevent toctou.
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

  -- Guard: completed inspections cannot be synced; require explicit reopen first.
  if v_row.status = 'completed' then
    raise exception 'INSPECTION_COMPLETED'
      using
        hint    = 'The inspection is completed and cannot be synced. Reopen it first.',
        errcode = 'P0005';
  end if;

  -- Re-verify snapshot_version inside the lock to detect concurrent writes
  -- that landed between the service-layer pre-check and this transaction.
  if v_row.snapshot_version <> p_base_snapshot_version then
    raise exception 'SNAPSHOT_CONFLICT'
      using
        hint    = 'The snapshot version is outdated. Refresh the inspection and retry.',
        errcode = 'P0004';
  end if;

  -- Persist the canonical snapshot. When part 1 was included in the mutation
  -- also update the relational projection columns so dashboard / filter queries
  -- stay accurate. The private.prepare_inspection_row trigger increments
  -- snapshot_version and stamps updated_at on every update.
  if p_update_part1 then
    update public.inspections
       set snapshot             = p_new_snapshot,
           client_updated_at   = p_client_updated_at,
           title               = p_title,
           make                = p_make,
           model               = p_model,
           fuel_type           = p_fuel_type,
           transmission        = p_transmission,
           drive               = p_drive,
           body_type           = p_body_type,
           price               = p_price,
           year_of_production  = p_year_of_production,
           mileage             = p_mileage,
           number_of_doors     = p_number_of_doors,
           registration_number = p_registration_number,
           vin_number          = p_vin_number,
           color               = p_color,
           address             = p_address
     where public.inspections.id      = p_inspection_id
       and public.inspections.user_id = p_user_id
    returning * into v_row;
  else
    update public.inspections
       set snapshot           = p_new_snapshot,
           client_updated_at = p_client_updated_at
     where public.inspections.id      = p_inspection_id
       and public.inspections.user_id = p_user_id
    returning * into v_row;
  end if;

  return query
    select
      v_row.id,
      v_row.title,
      v_row.status::text,
      v_row.snapshot_version,
      v_row.client_updated_at,
      v_row.updated_at;
end;
$function$;

-- Restrict execute to service_role only; revoke from public and anon.
revoke execute on function public.save_inspection_snapshot(
  uuid, uuid, bigint, timestamptz, jsonb,
  boolean, text, text, text, text, text, text, text,
  numeric, integer, integer, smallint,
  text, text, text, text
) from public, anon;

grant execute on function public.save_inspection_snapshot(
  uuid, uuid, bigint, timestamptz, jsonb,
  boolean, text, text, text, text, text, text, text,
  numeric, integer, integer, smallint,
  text, text, text, text
) to service_role;

commit;
