-- migration: add public.save_inspection_answer and public.delete_inspection_answer
-- purpose: provide atomic, lock-safe paths for writing and removing a single
-- answer entry in the inspection snapshot's answers sub-object.
-- affected objects: public.save_inspection_answer, public.delete_inspection_answer
-- special considerations:
--   - both functions use the same advisory lock key strategy as
--     save_inspection_part1 and save_inspection_runtime_flags:
--     hashtext(user_id::text || ':' || inspection_id::text).
--   - security definer so they can write despite rls being disabled at the
--     table level; execute is restricted to service_role.
--   - ownership and snapshot_version (for save) are re-verified inside the
--     lock to prevent toctou races between the service-layer pre-check and
--     the write.
--   - the private.prepare_inspection_row trigger handles snapshot_version
--     increment and updated_at stamping automatically on every update.
--   - for delete_inspection_answer, client_updated_at is set to the server's
--     current transaction timestamp (now()) because the public DELETE contract
--     does not carry a client-supplied timestamp.

begin;

-- ── save_inspection_answer ─────────────────────────────────────────────────

create or replace function public.save_inspection_answer(
  p_user_id               uuid,
  p_inspection_id         uuid,
  p_question_id           text,
  p_answer                text,
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

  -- Set or overwrite the single answer key inside snapshot.answers.
  -- jsonb_set path: array['answers', p_question_id] — creates missing
  -- intermediate keys when the fourth argument (create_missing) is true.
  update public.inspections
     set snapshot          = jsonb_set(
                               snapshot,
                               array['answers', p_question_id],
                               to_jsonb(p_answer),
                               true
                             ),
         client_updated_at = p_client_updated_at
   where id      = p_inspection_id
     and user_id = p_user_id;

  -- Return the post-trigger snapshot_version (incremented by
  -- private.prepare_inspection_row if snapshot content changed).
  return query
    select i.snapshot_version
      from public.inspections i
     where i.id = p_inspection_id;
end;
$function$;

-- Restrict execute to service_role only.
revoke execute on function public.save_inspection_answer(uuid, uuid, text, text, bigint, timestamptz) from public;
grant  execute on function public.save_inspection_answer(uuid, uuid, text, text, bigint, timestamptz) to service_role;

-- ── delete_inspection_answer ───────────────────────────────────────────────

create or replace function public.delete_inspection_answer(
  p_user_id       uuid,
  p_inspection_id uuid,
  p_question_id   text
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

  -- Remove the question key from snapshot.answers using the jsonb minus
  -- operator (-). If the key is absent the operation is a no-op at the SQL
  -- level, but the service layer validates key presence before calling this
  -- function so absent-key calls should not occur in practice.
  update public.inspections
     set snapshot          = jsonb_set(
                               snapshot,
                               '{answers}',
                               (snapshot -> 'answers') - p_question_id,
                               false
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
revoke execute on function public.delete_inspection_answer(uuid, uuid, text) from public;
grant  execute on function public.delete_inspection_answer(uuid, uuid, text) to service_role;

commit;
