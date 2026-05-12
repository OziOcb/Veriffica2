-- migration: normalize persisted question identifiers to underscore format
-- purpose: rewrite inspection snapshot question/group ids from legacy
-- hyphenated values to canonical underscore values and stamp new inspections
-- with the updated question bank version.
-- affected objects: private helper functions, public.inspections rows,
-- public.create_inspection
-- special considerations:
--   - existing rows keep their original question_bank_version because
--     private.prepare_inspection_row enforces that column as immutable.
--   - snapshot updates run through a normal UPDATE so the existing trigger
--     continues to bump snapshot_version for changed rows.

begin;

create or replace function private.normalize_question_identifier(
  p_value text
)
returns text
language sql
immutable
as $function$
  select replace(p_value, '-', '_');
$function$;

comment on function private.normalize_question_identifier(text) is
  'Converts legacy hyphenated question-bank identifiers to canonical underscore form.';

revoke all on function private.normalize_question_identifier(text) from public;

create or replace function private.normalize_snapshot_object_keys(
  p_value jsonb
)
returns jsonb
language sql
immutable
as $function$
  select coalesce(
    (
      select jsonb_object_agg(
        private.normalize_question_identifier(key),
        value
      )
      from jsonb_each(coalesce(p_value, '{}'::jsonb)) as entry(key, value)
    ),
    '{}'::jsonb
  );
$function$;

comment on function private.normalize_snapshot_object_keys(jsonb) is
  'Rewrites every key in a jsonb object from legacy hyphenated ids to underscore ids.';

revoke all on function private.normalize_snapshot_object_keys(jsonb) from public;

create or replace function private.normalize_snapshot_text_array(
  p_value jsonb
)
returns jsonb
language sql
immutable
as $function$
  select coalesce(
    (
      select jsonb_agg(
        private.normalize_question_identifier(value)
        order by ordinality
      )
      from jsonb_array_elements_text(coalesce(p_value, '[]'::jsonb))
        with ordinality as entry(value, ordinality)
    ),
    '[]'::jsonb
  );
$function$;

comment on function private.normalize_snapshot_text_array(jsonb) is
  'Rewrites every string entry in a jsonb text array from hyphenated ids to underscore ids.';

revoke all on function private.normalize_snapshot_text_array(jsonb) from public;

update public.inspections
   set snapshot = jsonb_set(
                    jsonb_set(
                      jsonb_set(
                        jsonb_set(
                          snapshot,
                          '{answers}',
                          private.normalize_snapshot_object_keys(snapshot -> 'answers'),
                          false
                        ),
                        '{question_notes}',
                        private.normalize_snapshot_object_keys(snapshot -> 'question_notes'),
                        false
                      ),
                      '{visible_group_ids}',
                      private.normalize_snapshot_text_array(snapshot -> 'visible_group_ids'),
                      false
                    ),
                    '{visible_question_ids}',
                    private.normalize_snapshot_text_array(snapshot -> 'visible_question_ids'),
                    false
                  )
 where exists (
         select 1
           from jsonb_each(coalesce(snapshot -> 'answers', '{}'::jsonb)) as entry(key, value)
          where entry.key like '%-%'
       )
    or exists (
         select 1
           from jsonb_each(coalesce(snapshot -> 'question_notes', '{}'::jsonb)) as entry(key, value)
          where entry.key like '%-%'
       )
    or exists (
         select 1
           from jsonb_array_elements_text(coalesce(snapshot -> 'visible_group_ids', '[]'::jsonb)) as entry(value)
          where entry.value like '%-%'
       )
    or exists (
         select 1
           from jsonb_array_elements_text(coalesce(snapshot -> 'visible_question_ids', '[]'::jsonb)) as entry(value)
          where entry.value like '%-%'
       );

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
  perform pg_advisory_xact_lock(hashtext(p_user_id::text)::bigint);

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
    '2026-05-12',
    '1.0.0',
    1,
    p_client_created_at,
    v_minimal_snapshot
  )
  returning * into v_new_row;

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

revoke all on function public.create_inspection(uuid, timestamptz) from public;
revoke all on function public.create_inspection(uuid, timestamptz) from authenticated;
revoke all on function public.create_inspection(uuid, timestamptz) from anon;
grant execute on function public.create_inspection(uuid, timestamptz) to service_role;

commit;