-- migration: add public.save_inspection_question_note, public.delete_inspection_question_note
--            and public.save_inspection_global_notes
-- purpose: provide atomic, lock-safe paths for writing, removing and replacing
-- note fields in the inspection snapshot.
-- affected objects:
--   public.save_inspection_question_note
--   public.delete_inspection_question_note
--   public.save_inspection_global_notes
-- special considerations:
--   - all three functions use the same advisory lock key strategy as the
--     existing answer functions: hashtext(user_id::text || ':' || inspection_id::text).
--   - security definer so they can write despite rls being disabled at the
--     table level; execute is restricted to service_role.
--   - ownership and snapshot_version (for save functions) are re-verified
--     inside the lock to prevent toctou races.
--   - sql functions receive the already-computed global_notes text from the
--     service layer; no question-bank or mirroring logic lives in sql.
--   - the private.prepare_inspection_row trigger handles snapshot_version
--     increment and updated_at stamping automatically on every update.
--   - for delete_inspection_question_note, client_updated_at is set to the
--     server transaction timestamp because the DELETE contract carries no
--     client timestamp.

begin;

-- ── save_inspection_question_note ──────────────────────────────────────────

create or replace function public.save_inspection_question_note(
  p_user_id               uuid,
  p_inspection_id         uuid,
  p_question_id           text,
  p_note                  text,
  p_global_notes          text,
  p_base_snapshot_version bigint,
  p_client_updated_at     timestamptz
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

  -- Re-verify snapshot_version inside the lock to detect concurrent writes
  -- that landed between the service-layer pre-check and now.
  if v_row.snapshot_version <> p_base_snapshot_version then
    raise exception 'SNAPSHOT_CONFLICT'
      using
        hint    = 'The snapshot version is outdated. Refresh the inspection and retry.',
        errcode = 'P0004';
  end if;

  -- Atomically update both question_notes[questionId] and global_notes.
  -- The computed global_notes text is supplied by the service layer, which
  -- applied the one-way mirroring logic before calling this function.
  update public.inspections
     set snapshot          = jsonb_set(
                               jsonb_set(
                                 snapshot,
                                 array['question_notes', p_question_id],
                                 to_jsonb(p_note),
                                 true
                               ),
                               '{global_notes}',
                               to_jsonb(p_global_notes),
                               true
                             ),
         client_updated_at = p_client_updated_at
   where id      = p_inspection_id
     and user_id = p_user_id;

  -- Return the post-trigger snapshot_version (incremented automatically).
  return query
    select i.snapshot_version
      from public.inspections i
     where i.id = p_inspection_id;
end;
$function$;

-- Restrict execute to service_role only.
revoke execute on function public.save_inspection_question_note(uuid, uuid, text, text, text, bigint, timestamptz) from public;
grant  execute on function public.save_inspection_question_note(uuid, uuid, text, text, text, bigint, timestamptz) to service_role;

-- ── delete_inspection_question_note ────────────────────────────────────────

create or replace function public.delete_inspection_question_note(
  p_user_id       uuid,
  p_inspection_id uuid,
  p_question_id   text,
  p_global_notes  text
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
  -- Same deterministic advisory lock key as all other snapshot mutations.
  v_lock_key := hashtext(p_user_id::text || ':' || p_inspection_id::text)::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  -- Fetch the current row while holding the lock.
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

  -- Remove the question key from snapshot.question_notes and write the
  -- pre-computed global_notes (with the managed section removed by the
  -- service layer) atomically in a single update.
  update public.inspections
     set snapshot          = jsonb_set(
                               jsonb_set(
                                 snapshot,
                                 '{question_notes}',
                                 (snapshot -> 'question_notes') - p_question_id,
                                 false
                               ),
                               '{global_notes}',
                               to_jsonb(p_global_notes),
                               true
                             ),
         -- client_updated_at is set to the server transaction timestamp
         -- because the DELETE contract does not carry a client timestamp.
         client_updated_at = now()
   where id      = p_inspection_id
     and user_id = p_user_id;

  -- Return the post-trigger snapshot_version.
  return query
    select i.snapshot_version
      from public.inspections i
     where i.id = p_inspection_id;
end;
$function$;

-- Restrict execute to service_role only.
revoke execute on function public.delete_inspection_question_note(uuid, uuid, text, text) from public;
grant  execute on function public.delete_inspection_question_note(uuid, uuid, text, text) to service_role;

-- ── save_inspection_global_notes ───────────────────────────────────────────

create or replace function public.save_inspection_global_notes(
  p_user_id               uuid,
  p_inspection_id         uuid,
  p_global_notes          text,
  p_base_snapshot_version bigint,
  p_client_updated_at     timestamptz
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

  -- Fetch the current row while holding the advisory lock.
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

  -- Re-verify snapshot_version inside the lock.
  if v_row.snapshot_version <> p_base_snapshot_version then
    raise exception 'SNAPSHOT_CONFLICT'
      using
        hint    = 'The snapshot version is outdated. Refresh the inspection and retry.',
        errcode = 'P0004';
  end if;

  -- Update only global_notes; question_notes is intentionally left untouched.
  -- This function must never infer or reconstruct question_notes from free text.
  update public.inspections
     set snapshot          = jsonb_set(
                               snapshot,
                               '{global_notes}',
                               to_jsonb(p_global_notes),
                               true
                             ),
         client_updated_at = p_client_updated_at
   where id      = p_inspection_id
     and user_id = p_user_id;

  -- Return the post-trigger snapshot_version.
  return query
    select i.snapshot_version
      from public.inspections i
     where i.id = p_inspection_id;
end;
$function$;

-- Restrict execute to service_role only.
revoke execute on function public.save_inspection_global_notes(uuid, uuid, text, bigint, timestamptz) from public;
grant  execute on function public.save_inspection_global_notes(uuid, uuid, text, bigint, timestamptz) to service_role;

commit;
