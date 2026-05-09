-- migration: fix public.save_inspection_part1 ambiguous column references
-- purpose: replace the previously applied function body with a version that
-- fully qualifies inspections.id / inspections.user_id so PL/pgSQL does not
-- confuse them with RETURNS TABLE output variables.

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
  v_lock_key := hashtext(p_user_id::text || ':' || p_inspection_id::text)::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  select *
    into v_row
    from public.inspections as inspections
   where inspections.id      = p_inspection_id
     and inspections.user_id = p_user_id;

  if not found then
    raise exception 'NOT_FOUND'
      using
        hint    = 'The inspection does not exist or does not belong to the requesting user.',
        errcode = 'P0003';
  end if;

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

  v_new_snapshot := v_row.snapshot;
  v_new_snapshot := jsonb_set(v_new_snapshot, '{part_1}', v_part1_json, true);

  if array_length(p_removed_answer_ids, 1) > 0 then
    v_answers_patch := v_new_snapshot -> 'answers';
    for i in 1 .. array_length(p_removed_answer_ids, 1) loop
      v_answers_patch := v_answers_patch - p_removed_answer_ids[i];
    end loop;
    v_new_snapshot := jsonb_set(v_new_snapshot, '{answers}', v_answers_patch, false);
  end if;

  if array_length(p_removed_question_note_ids, 1) > 0 then
    v_question_notes_patch := v_new_snapshot -> 'question_notes';
    for i in 1 .. array_length(p_removed_question_note_ids, 1) loop
      v_question_notes_patch := v_question_notes_patch - p_removed_question_note_ids[i];
    end loop;
    v_new_snapshot := jsonb_set(v_new_snapshot, '{question_notes}', v_question_notes_patch, false);
  end if;

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

  update public.inspections as inspections
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
   where inspections.id      = p_inspection_id
     and inspections.user_id = p_user_id
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
