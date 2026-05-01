-- migration: create veriffica mvp schema
-- purpose: establish the initial auth-owned relational schema for profiles,
-- user preferences, and inspections, including helper triggers, indexes, and
-- explicit row-level security policies.
-- affected objects: private schema, helper trigger functions, public.profiles,
-- public.user_preferences, public.inspections, supporting indexes, and
-- auth.users provisioning trigger.
-- special considerations: auth.users remains the canonical identity source;
-- browser clients are intentionally denied direct writes to all application
-- tables; trusted server-side flows or privileged sql paths are expected to
-- perform mutations.

begin;

-- ensure the uuid generator used by inspections is available in supabase.
create extension if not exists pgcrypto with schema extensions;

-- keep privileged helper functions in an unexposed schema so they can be used
-- by triggers without widening the public api surface.
create schema if not exists private;
comment on schema private is 'internal helper schema for trigger functions and privileged database routines.';
revoke all on schema private from public;

-- keep updated_at stable for no-op updates while still touching rows that
-- actually changed.
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
as $function$
begin
  if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$function$;
comment on function private.touch_updated_at() is 'trigger helper that only updates updated_at when a row changed outside the updated_at column itself.';
revoke all on function private.touch_updated_at() from public;

-- normalize inspection projections and preserve snapshot_version / updated_at
-- on no-op writes. this keeps the row-level guarantees aligned with the mvp
-- sync design even when writes come from a privileged server path.
create or replace function private.prepare_inspection_row()
returns trigger
language plpgsql
as $function$
begin
  if new.registration_number is not null then
    new.registration_number := upper(btrim(new.registration_number));
  end if;

  if new.year_of_production is not null
     and (
       new.year_of_production < 1886
       or new.year_of_production > (extract(year from timezone('utc', now()))::integer + 1)
     ) then
    raise exception using
      errcode = '23514',
      message = format(
        'year_of_production must be between 1886 and %s',
        extract(year from timezone('utc', now()))::integer + 1
      );
  end if;

  if tg_op = 'update' then
    if new.question_bank_version is distinct from old.question_bank_version then
      raise exception using
        errcode = '23514',
        message = 'question_bank_version is immutable after insert';
    end if;

    if new.snapshot_schema_version is distinct from old.snapshot_schema_version then
      raise exception using
        errcode = '23514',
        message = 'snapshot_schema_version is immutable after insert';
    end if;

    if (to_jsonb(new) - 'updated_at' - 'snapshot_version' - 'client_updated_at') is distinct from
       (to_jsonb(old) - 'updated_at' - 'snapshot_version' - 'client_updated_at') then
      new.snapshot_version := old.snapshot_version + 1;
      new.updated_at := now();
    else
      new.snapshot_version := old.snapshot_version;
      new.client_updated_at := old.client_updated_at;
      new.updated_at := old.updated_at;
    end if;
  end if;

  return new;
exception
  when others then
    raise log 'private.prepare_inspection_row failed for operation %, inspection_id %, user_id %: %',
      tg_op,
      case when tg_op = 'insert' then new.id else old.id end,
      case when tg_op = 'insert' then new.user_id else old.user_id end,
      sqlerrm;
    raise;
end;
$function$;
comment on function private.prepare_inspection_row() is 'trigger helper that normalizes inspection projections, enforces immutable version columns, and prevents version churn on no-op writes.';
revoke all on function private.prepare_inspection_row() from public;

-- public.profiles is a technical 1:1 companion to auth.users and intentionally
-- stores no duplicated login or identity payload.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'technical 1:1 companion row for auth.users. stores only application-level lifecycle timestamps.';
comment on column public.profiles.user_id is 'matches auth.users.id and cascades on account deletion.';

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function private.touch_updated_at();

-- public.user_preferences stores device-independent application settings and is
-- also auto-provisioned from auth.users.
create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text not null default 'system',
  font_scale text not null default 'medium',
  hide_inspection_intro boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_preferences_theme_chk check (theme in ('system', 'light', 'dark')),
  constraint user_preferences_font_scale_chk check (font_scale in ('small', 'medium', 'large'))
);
comment on table public.user_preferences is 'application settings shared across devices for a single authenticated user.';
comment on column public.user_preferences.hide_inspection_intro is 'controls whether the inspection introduction is hidden across sessions and devices.';

create trigger user_preferences_set_updated_at
before update on public.user_preferences
for each row
execute function private.touch_updated_at();

-- public.inspections stores the owner relation, a versioned canonical snapshot,
-- and a small relational projection used for dashboard queries and business
-- filters. the database validates the minimum stable shape while deeper domain
-- semantics stay in trusted write paths.
create table public.inspections (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  status text not null default 'draft',
  question_bank_version text not null,
  snapshot_schema_version text not null,
  snapshot jsonb not null,
  snapshot_version bigint not null default 1,
  client_updated_at timestamptz not null,
  make text,
  model text,
  year_of_production integer,
  registration_number text,
  vin_number text,
  fuel_type text,
  transmission text,
  drive text,
  body_type text,
  price numeric(10, 2),
  mileage integer,
  color text,
  number_of_doors smallint,
  address text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspections_title_chk check (char_length(title) between 1 and 120),
  constraint inspections_status_chk check (status in ('draft', 'completed')),
  constraint inspections_question_bank_version_chk check (char_length(question_bank_version) between 1 and 50),
  constraint inspections_snapshot_schema_version_chk check (char_length(snapshot_schema_version) between 1 and 50),
  constraint inspections_snapshot_version_chk check (snapshot_version >= 1),
  constraint inspections_make_chk check (make is null or char_length(make) between 1 and 50),
  constraint inspections_model_chk check (model is null or char_length(model) between 1 and 60),
  constraint inspections_registration_number_chk check (
    registration_number is null
    or (
      char_length(registration_number) between 2 and 15
      and registration_number ~ '^[A-Z0-9 -]+$'
    )
  ),
  constraint inspections_vin_number_chk check (
    vin_number is null
    or vin_number ~ '^[A-HJ-NPR-Z0-9]{17}$'
  ),
  constraint inspections_fuel_type_chk check (
    fuel_type is null
    or fuel_type in ('Petrol', 'Diesel', 'Hybrid', 'Electric')
  ),
  constraint inspections_transmission_chk check (
    transmission is null
    or transmission in ('Manual', 'Automatic')
  ),
  constraint inspections_drive_chk check (
    drive is null
    or drive in ('2WD', '4WD')
  ),
  constraint inspections_body_type_chk check (
    body_type is null
    or body_type in ('Sedan', 'Hatchback', 'SUV', 'Coupe', 'Convertible', 'Van', 'Pickup', 'Other')
  ),
  constraint inspections_price_chk check (
    price is null
    or (price >= 0 and price <= 10000000.00)
  ),
  constraint inspections_mileage_chk check (
    mileage is null
    or (mileage >= 0 and mileage <= 9999999)
  ),
  constraint inspections_color_chk check (color is null or char_length(color) between 1 and 40),
  constraint inspections_number_of_doors_chk check (
    number_of_doors is null
    or number_of_doors between 1 and 9
  ),
  constraint inspections_address_chk check (address is null or char_length(address) between 5 and 150),
  constraint inspections_status_completed_at_chk check (
    (status = 'draft' and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  ),
  constraint inspections_electric_transmission_chk check (
    fuel_type is distinct from 'Electric'
    or transmission is null
    or transmission = 'Automatic'
  ),
  constraint inspections_snapshot_is_object_chk check (jsonb_typeof(snapshot) = 'object'),
  constraint inspections_snapshot_required_keys_chk check (
    snapshot ? 'part_1'
    and snapshot ? 'runtime_flags'
    and snapshot ? 'answers'
    and snapshot ? 'question_notes'
    and snapshot ? 'global_notes'
    and snapshot ? 'visible_group_ids'
    and snapshot ? 'visible_question_ids'
  ),
  constraint inspections_snapshot_part_1_chk check (
    jsonb_typeof(snapshot -> 'part_1') in ('object', 'null')
  ),
  constraint inspections_snapshot_runtime_flags_chk check (
    jsonb_typeof(snapshot -> 'runtime_flags') = 'object'
  ),
  constraint inspections_snapshot_answers_chk check (
    jsonb_typeof(snapshot -> 'answers') = 'object'
  ),
  constraint inspections_snapshot_question_notes_chk check (
    jsonb_typeof(snapshot -> 'question_notes') = 'object'
  ),
  constraint inspections_snapshot_global_notes_chk check (
    jsonb_typeof(snapshot -> 'global_notes') = 'string'
  ),
  constraint inspections_snapshot_visible_group_ids_chk check (
    jsonb_typeof(snapshot -> 'visible_group_ids') = 'array'
  ),
  constraint inspections_snapshot_visible_question_ids_chk check (
    jsonb_typeof(snapshot -> 'visible_question_ids') = 'array'
  )
);
comment on table public.inspections is 'owner-scoped inspections with a canonical jsonb snapshot plus relational dashboard projections.';
comment on column public.inspections.title is 'server-generated canonical title. client-supplied values are not trusted inputs.';
comment on column public.inspections.question_bank_version is 'set only when the inspection is created and kept immutable afterwards.';
comment on column public.inspections.snapshot_schema_version is 'set only when the inspection is created and kept immutable afterwards.';
comment on column public.inspections.snapshot is 'full canonical inspection payload. the database enforces minimum top-level shape, while trusted write paths enforce deeper semantics.';
comment on column public.inspections.snapshot_version is 'optimistic concurrency version that changes only when the canonical row state changes.';
comment on column public.inspections.client_updated_at is 'timestamp of the client-side commit used by trusted write paths during synchronization.';
comment on column public.inspections.year_of_production is 'validated by private.prepare_inspection_row() against the dynamic utc upper bound.';

create index inspections_user_updated_idx
  on public.inspections (user_id, updated_at desc);

create index inspections_user_status_idx
  on public.inspections (user_id, status);

create trigger inspections_prepare_row
before insert or update on public.inspections
for each row
execute function private.prepare_inspection_row();

-- provision technical companion rows whenever a new auth account is created.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
exception
  when others then
    raise log 'private.handle_new_auth_user failed for auth.users.id %: %', new.id, sqlerrm;
    raise;
end;
$function$;
comment on function private.handle_new_auth_user() is 'security definer trigger helper that auto-provisions profile and preference rows for each auth.users record.';
revoke all on function private.handle_new_auth_user() from public;

-- backfill companion rows for any users that already exist before this
-- migration is applied. on conflict keeps the operation safe to rerun within
-- a failed transaction retry.
insert into public.profiles (user_id)
select auth_user.id
from auth.users as auth_user
left join public.profiles as profile
  on profile.user_id = auth_user.id
where profile.user_id is null;

insert into public.user_preferences (user_id)
select auth_user.id
from auth.users as auth_user
left join public.user_preferences as preference
  on preference.user_id = auth_user.id
where preference.user_id is null;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function private.handle_new_auth_user();

-- every exposed table gets explicit row-level security. authenticated users can
-- read only their own rows, while direct browser writes are denied for both
-- anon and authenticated because the application will use trusted server flows
-- or privileged database routines for mutations.
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.inspections enable row level security;

create policy profiles_select_denied_anon
  on public.profiles
  for select
  to anon
  using (false);
comment on policy profiles_select_denied_anon on public.profiles is 'denies anonymous reads because profile rows are private account data.';

create policy profiles_insert_denied_anon
  on public.profiles
  for insert
  to anon
  with check (false);
comment on policy profiles_insert_denied_anon on public.profiles is 'denies anonymous inserts. profile rows are auto-provisioned from auth.users by a trusted trigger.';

create policy profiles_update_denied_anon
  on public.profiles
  for update
  to anon
  using (false)
  with check (false);
comment on policy profiles_update_denied_anon on public.profiles is 'denies anonymous updates because profile rows are not client-editable.';

create policy profiles_delete_denied_anon
  on public.profiles
  for delete
  to anon
  using (false);
comment on policy profiles_delete_denied_anon on public.profiles is 'denies anonymous deletes because account cleanup is handled by trusted server-side flows.';

create policy profiles_select_own_authenticated
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
comment on policy profiles_select_own_authenticated on public.profiles is 'allows an authenticated user to read only the profile row linked to their own auth.users record.';

create policy profiles_insert_denied_authenticated
  on public.profiles
  for insert
  to authenticated
  with check (false);
comment on policy profiles_insert_denied_authenticated on public.profiles is 'denies direct authenticated inserts because profile rows are created by trusted provisioning logic.';

create policy profiles_update_denied_authenticated
  on public.profiles
  for update
  to authenticated
  using (false)
  with check (false);
comment on policy profiles_update_denied_authenticated on public.profiles is 'denies direct authenticated updates because the table is intentionally read-only to normal clients.';

create policy profiles_delete_denied_authenticated
  on public.profiles
  for delete
  to authenticated
  using (false);
comment on policy profiles_delete_denied_authenticated on public.profiles is 'denies direct authenticated deletes because account deletion is a trusted administrative flow.';

create policy user_preferences_select_denied_anon
  on public.user_preferences
  for select
  to anon
  using (false);
comment on policy user_preferences_select_denied_anon on public.user_preferences is 'denies anonymous reads because user preferences are private account data.';

create policy user_preferences_insert_denied_anon
  on public.user_preferences
  for insert
  to anon
  with check (false);
comment on policy user_preferences_insert_denied_anon on public.user_preferences is 'denies anonymous inserts. preference rows are auto-provisioned from trusted auth lifecycle hooks.';

create policy user_preferences_update_denied_anon
  on public.user_preferences
  for update
  to anon
  using (false)
  with check (false);
comment on policy user_preferences_update_denied_anon on public.user_preferences is 'denies anonymous updates because preferences are mutable only through trusted server-side paths.';

create policy user_preferences_delete_denied_anon
  on public.user_preferences
  for delete
  to anon
  using (false);
comment on policy user_preferences_delete_denied_anon on public.user_preferences is 'denies anonymous deletes because preference cleanup follows account lifecycle rules.';

create policy user_preferences_select_own_authenticated
  on public.user_preferences
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
comment on policy user_preferences_select_own_authenticated on public.user_preferences is 'allows an authenticated user to read only their own preference row.';

create policy user_preferences_insert_denied_authenticated
  on public.user_preferences
  for insert
  to authenticated
  with check (false);
comment on policy user_preferences_insert_denied_authenticated on public.user_preferences is 'denies direct authenticated inserts because rows are provisioned automatically for each account.';

create policy user_preferences_update_denied_authenticated
  on public.user_preferences
  for update
  to authenticated
  using (false)
  with check (false);
comment on policy user_preferences_update_denied_authenticated on public.user_preferences is 'denies direct authenticated updates because preference writes must go through a trusted narrow contract.';

create policy user_preferences_delete_denied_authenticated
  on public.user_preferences
  for delete
  to authenticated
  using (false);
comment on policy user_preferences_delete_denied_authenticated on public.user_preferences is 'denies direct authenticated deletes because deletions are not a supported browser action.';

create policy inspections_select_denied_anon
  on public.inspections
  for select
  to anon
  using (false);
comment on policy inspections_select_denied_anon on public.inspections is 'denies anonymous reads because inspections contain private owner-scoped data.';

create policy inspections_insert_denied_anon
  on public.inspections
  for insert
  to anon
  with check (false);
comment on policy inspections_insert_denied_anon on public.inspections is 'denies anonymous inserts because inspection creation must go through trusted server-side business rules.';

create policy inspections_update_denied_anon
  on public.inspections
  for update
  to anon
  using (false)
  with check (false);
comment on policy inspections_update_denied_anon on public.inspections is 'denies anonymous updates because synchronization is handled only by trusted backend flows.';

create policy inspections_delete_denied_anon
  on public.inspections
  for delete
  to anon
  using (false);
comment on policy inspections_delete_denied_anon on public.inspections is 'denies anonymous deletes because destructive inspection actions are server-controlled.';

create policy inspections_select_own_authenticated
  on public.inspections
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
comment on policy inspections_select_own_authenticated on public.inspections is 'allows an authenticated user to read only inspections they own.';

create policy inspections_insert_denied_authenticated
  on public.inspections
  for insert
  to authenticated
  with check (false);
comment on policy inspections_insert_denied_authenticated on public.inspections is 'denies direct authenticated inserts because creation must enforce account limits and canonical snapshot defaults in trusted code.';

create policy inspections_update_denied_authenticated
  on public.inspections
  for update
  to authenticated
  using (false)
  with check (false);
comment on policy inspections_update_denied_authenticated on public.inspections is 'denies direct authenticated updates because inspection synchronization, finalization, and reopening are trusted backend flows.';

create policy inspections_delete_denied_authenticated
  on public.inspections
  for delete
  to authenticated
  using (false);
comment on policy inspections_delete_denied_authenticated on public.inspections is 'denies direct authenticated deletes because inspection deletion is a trusted server-side operation.';

commit;