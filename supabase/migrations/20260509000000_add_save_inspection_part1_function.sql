-- migration: add public.save_inspection_part1 function
-- purpose: provide an atomic, lock-safe path for writing Part 1 vehicle data
-- to an existing inspection. the function updates both the relational
-- projection columns (for dashboard/filter queries) and the canonical snapshot
-- jsonb in a single transaction, letting the private.prepare_inspection_row
-- trigger handle snapshot_version increment and updated_at stamping.
-- affected objects: public.save_inspection_part1
-- special considerations:
--   - uses an advisory lock keyed on (user_id, inspection_id) to serialise
--     concurrent writes for the same inspection without blocking unrelated rows.
--   - security definer so it can write despite rls being disabled at the table
--     level; execute is restricted to service_role.
--   - ownership is verified inside the lock to prevent toctou races.
--   - the function returns the full post-save row so the service layer can
--     build the api response without a second round-trip.

begin;

create or replace function public.save_inspection_part1(
  p_user_id                 uuid,
  p_inspection_id           uuid,
  -- relational projection columns
  p_title                   text,
  p_make                    text,
  p_model                   text,
  p_fuel_type               text,
  p_transmission            text,
  p_drive                   text,
  p_body_type               text,
  p_price                   numeric,
  p_year_of_production      integer,
  p_mileage                 integer,
  p_number_of_doors         smallint,
  p_registration_number     text,
  p_vin_number              text,
  p_color                   text,
  p_address                 text,
  -- snapshot patch fields (notes lives only in snapshot)
  p_notes                   text,
  -- snapshot visibility arrays (recomputed by service layer)
  p_visible_group_ids       text[],
  p_visible_question_ids    text[],
  -- smart-pruned answer / note removals
  p_removed_answer_ids      text[],
  p_removed_question_note_ids text[],
  -- client-supplied timestamp
  p_client_updated_at       timestamptz
)
returns table (
  id                      uuid,
  title                   text,
  snapshot_version        bigint,
  client_updated_at       timestamptz,
  snapshot                jsonb
)
language plpgsql
security definer
as $function$
declare
  v_row               public.inspections%rowtype;
  v_new_snapshot      jsonb;
  v_answers_patch     jsonb;
  v_question_notes_patch jsonb;
  v_part1_json        jsonb;
  v_lock_key          bigint;
begin
  -- Derive a deterministic bigint advisory lock key from (user_id, inspection_id).
  -- hashtext operates on text so we concatenate both UUIDs with a separator.
  v_lock_key := hashtext(p_user_id::text || ':' || p_inspection_id::text)::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  -- Fetch the current row while holding the advisory lock to prevent toctou.
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

  -- Build the Part 1 JSON fragment that lives inside snapshot.part_1.
  v_part1_json := jsonb_build_object(
    'price',              p_price,
    'make',               p_make,
    'model',              p_model,
    'yearOfProduction',   p_year_of_production,
    'registrationNumber', p_registration_number,
    'vinNumber',          p_vin_number,
    'mileage',            p_mileage,
    'fuelType',           p_fuel_type,
    'transmission',       p_transmission,
    'drive',              p_drive,
    'color',              p_color,
    'bodyType',           p_body_type,
    'numberOfDoors',      p_number_of_doors,
    'address',            p_address,
    'notes',              p_notes
  );

  -- Start from the current snapshot so we preserve fields we do not touch
  -- (e.g. runtime_flags, global_notes).
  v_new_snapshot := v_row.snapshot;

  -- Overwrite part_1 with the new normalized data.
  v_new_snapshot := jsonb_set(v_new_snapshot, '{part_1}', v_part1_json, true);

  -- Apply smart-pruned answer removals: delete each key from snapshot.answers.
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
  --   - auto-increment snapshot_version when content changed
  --   - stamp updated_at
  --   - normalize registration_number to uppercase
  update public.inspections
     set title               = p_title,
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
         address             = p_address,
         client_updated_at   = p_client_updated_at,
         snapshot            = v_new_snapshot
   where public.inspections.id      = p_inspection_id
     and public.inspections.user_id = p_user_id
  returning *
    into v_row;

  return query
    select
      v_row.id,
      v_row.title,
      v_row.snapshot_version,
      v_row.client_updated_at,
      v_row.snapshot;
end;
$function$;

-- Restrict execute to service_role only; revoke from public and anon.
revoke execute on function public.save_inspection_part1(
  uuid, uuid,
  text, text, text, text, text, text, text,
  numeric, integer, integer, smallint,
  text, text, text, text,
  text, text[], text[], text[], text[],
  timestamptz
) from public, anon;

grant execute on function public.save_inspection_part1(
  uuid, uuid,
  text, text, text, text, text, text, text,
  numeric, integer, integer, smallint,
  text, text, text, text,
  text, text[], text[], text[], text[],
  timestamptz
) to service_role;

commit;
