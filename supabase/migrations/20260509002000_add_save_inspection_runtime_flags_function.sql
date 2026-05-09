-- migration: add public.save_inspection_runtime_flags function
-- purpose: provide an atomic, lock-safe path for patching the runtime_flags
-- sub-object of an existing inspection snapshot and recomputing visibility
-- arrays plus smart-pruned answer / note removals.
-- affected objects: public.save_inspection_runtime_flags
-- special considerations:
--   - uses the same advisory lock key strategy as save_inspection_part1:
--     hashtext(user_id::text || ':' || inspection_id::text).
--   - security definer so it can write despite rls being disabled at the
--     table level; execute is restricted to service_role.
--   - ownership and snapshot_version are re-verified inside the lock to
--     prevent toctou races between the service-layer pre-check and the write.
--   - only snapshot-level fields are updated (no relational projection
--     columns); the private.prepare_inspection_row trigger handles
--     snapshot_version increment and updated_at stamping.

begin;

create or replace function public.save_inspection_runtime_flags(
  p_user_id                   uuid,
  p_inspection_id             uuid,
  p_base_snapshot_version     bigint,
  p_runtime_flags             jsonb,
  p_visible_group_ids         text[],
  p_visible_question_ids      text[],
  p_removed_answer_ids        text[],
  p_removed_question_note_ids text[],
  p_client_updated_at         timestamptz
)
returns table (
  snapshot_version bigint
)
language plpgsql
security definer
as $function$
declare
  v_row                  public.inspections%rowtype;
  v_new_snapshot         jsonb;
  v_answers_patch        jsonb;
  v_question_notes_patch jsonb;
  v_lock_key             bigint;
begin
  -- Derive a deterministic bigint advisory lock key from (user_id, inspection_id).
  v_lock_key := hashtext(p_user_id::text || ':' || p_inspection_id::text)::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  -- Fetch the current row while holding the lock (prevents toctou).
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

  -- Start from the current snapshot so unrelated fields are preserved.
  v_new_snapshot := v_row.snapshot;

  -- Overwrite runtime_flags with the patched values.
  v_new_snapshot := jsonb_set(v_new_snapshot, '{runtime_flags}', p_runtime_flags, true);

  -- Apply smart-pruned answer removals.
  if array_length(p_removed_answer_ids, 1) > 0 then
    v_answers_patch := v_new_snapshot -> 'answers';
    for i in 1 .. array_length(p_removed_answer_ids, 1) loop
      v_answers_patch := v_answers_patch - p_removed_answer_ids[i];
    end loop;
    v_new_snapshot := jsonb_set(v_new_snapshot, '{answers}', v_answers_patch, false);
  end if;

  -- Apply smart-pruned question note removals.
  if array_length(p_removed_question_note_ids, 1) > 0 then
    v_question_notes_patch := v_new_snapshot -> 'question_notes';
    for i in 1 .. array_length(p_removed_question_note_ids, 1) loop
      v_question_notes_patch := v_question_notes_patch - p_removed_question_note_ids[i];
    end loop;
    v_new_snapshot := jsonb_set(v_new_snapshot, '{question_notes}', v_question_notes_patch, false);
  end if;

  -- Overwrite visibility arrays with the recomputed values.
  v_new_snapshot := jsonb_set(
    v_new_snapshot,
    '{visible_group_ids}',
    to_jsonb(p_visible_group_ids),
    true
  );
  v_new_snapshot := jsonb_set(
    v_new_snapshot,
    '{visible_question_ids}',
    to_jsonb(p_visible_question_ids),
    true
  );

  -- Perform the update. private.prepare_inspection_row trigger will:
  --   - auto-increment snapshot_version when snapshot content changed
  --   - stamp updated_at
  update public.inspections
     set client_updated_at = p_client_updated_at,
         snapshot          = v_new_snapshot
   where public.inspections.id      = p_inspection_id
     and public.inspections.user_id = p_user_id
  returning *
    into v_row;

  return query
    select v_row.snapshot_version;
end;
$function$;

-- Restrict execute to service_role only; revoke from public and anon.
revoke execute on function public.save_inspection_runtime_flags(
  uuid, uuid, bigint, jsonb, text[], text[], text[], text[], timestamptz
) from public, anon;

grant execute on function public.save_inspection_runtime_flags(
  uuid, uuid, bigint, jsonb, text[], text[], text[], text[], timestamptz
) to service_role;

commit;
