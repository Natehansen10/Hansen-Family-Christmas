-- Maison Noël: schema, seeds and lockdown.
-- Run once in the Supabase SQL editor (or `supabase db push`). Safe to re-run.

create extension if not exists pgcrypto;

do $$ begin create type person_role as enum ('santa', 'kid', 'grandkid'); exception when duplicate_object then null; end $$;
do $$ begin create type wish_priority as enum ('must', 'love', 'stocking'); exception when duplicate_object then null; end $$;
do $$ begin create type claim_status as enum ('claimed', 'bought', 'wrapped', 'under_tree'); exception when duplicate_object then null; end $$;

create table if not exists people (
  id text primary key,
  name text not null,
  role person_role not null,
  vault_hash text,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists managers (
  person_id text not null references people(id) on delete cascade,
  manager_id text not null references people(id) on delete cascade,
  primary key (person_id, manager_id)
);

create table if not exists tokens (
  id text primary key,
  name text not null,
  model_path text not null,
  owner_id text unique references people(id) on delete set null,
  sort int not null default 0
);

create table if not exists wishes (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references people(id) on delete cascade,
  added_by text not null references people(id),
  url text,
  title text not null,
  image_url text,
  image_blur text,
  store text,
  price_cents int,
  priority wish_priority not null default 'love',
  notes text,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists wishes_owner_idx on wishes(owner_id);

create table if not exists claims (
  wish_id uuid primary key references wishes(id) on delete cascade,
  claimer_id text not null references people(id),
  status claim_status not null default 'claimed',
  updated_at timestamptz not null default now()
);

-- Lockdown. RLS on with no policies = the anon and authenticated keys can read
-- and write nothing. Every query goes through the Vercel API with the service
-- role, which bypasses RLS. Realtime carries only a payload-free "changed" ping.
alter table people enable row level security;
alter table managers enable row level security;
alter table tokens enable row level security;
alter table wishes enable row level security;
alter table claims enable row level security;

-- One winner per figurine, one figurine per person, and the vault code is set
-- in the same transaction. The unique constraint on tokens.owner_id plus the
-- row lock make two people tapping at the same moment safe.
create or replace function claim_token(p_token text, p_person text, p_hash text)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner text;
  v_hash text;
begin
  select vault_hash into v_hash from people where id = p_person for update;
  if not found then return 'not_found'; end if;

  select owner_id into v_owner from tokens where id = p_token for update;
  if not found then return 'not_found'; end if;
  if v_owner is not null then return 'token_taken'; end if;
  if exists (select 1 from tokens where owner_id = p_person) then return 'person_has_token'; end if;

  if p_hash is not null then
    if v_hash is not null then return 'code_exists'; end if;
    update people set vault_hash = p_hash where id = p_person;
  end if;

  update tokens set owner_id = p_person where id = p_token;
  return 'ok';
exception when unique_violation then
  return 'person_has_token';
end $$;

-- Spends one vault attempt atomically, so parallel guesses cannot dodge the
-- limit. Five attempts, then a 15 minute lock. Returns false while locked.
create or replace function begin_vault_attempt(p_person text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  n int;
begin
  update people
     set failed_attempts = failed_attempts + 1, locked_until = null
   where id = p_person and (locked_until is null or locked_until <= now())
   returning failed_attempts into n;
  if n is null then return false; end if;
  if n >= 5 then
    update people set failed_attempts = 0, locked_until = now() + interval '15 minutes' where id = p_person;
  end if;
  return true;
end $$;

revoke all on function claim_token(text, text, text) from public;
revoke all on function begin_vault_attempt(text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function claim_token(text, text, text) from anon, authenticated;
    revoke all on function begin_vault_attempt(text) from anon, authenticated;
    grant execute on function claim_token(text, text, text) to service_role;
    grant execute on function begin_vault_attempt(text) to service_role;
  end if;
end $$;

-- Seeds
insert into people (id, name, role, sort) values
  ('jen', 'Jen', 'santa', 1), ('curtis', 'Curtis', 'santa', 2),
  ('lindsay', 'Lindsay', 'kid', 3), ('aj', 'AJ', 'kid', 4), ('nate', 'Nate', 'kid', 5), ('lydia', 'Lydia', 'kid', 6),
  ('josh', 'Josh', 'kid', 7), ('katie', 'Katie', 'kid', 8), ('gabriel', 'Gabriel', 'kid', 9),
  ('frankie', 'Frankie', 'grandkid', 10), ('bo', 'Bo', 'grandkid', 11), ('honey', 'Honey', 'grandkid', 12)
on conflict (id) do nothing;

insert into managers (person_id, manager_id) values
  ('frankie', 'lindsay'), ('frankie', 'aj'), ('bo', 'lindsay'), ('bo', 'aj'), ('honey', 'nate'), ('honey', 'lydia')
on conflict do nothing;

insert into tokens (id, name, model_path, sort) values
  ('santa', 'Santa Claus', '/models/figurines/santa.glb', 1),
  ('mrsclaus', 'Mrs. Claus', '/models/figurines/mrsclaus.glb', 2),
  ('headelf', 'The Head Elf', '/models/figurines/headelf.glb', 3),
  ('nutcracker', 'The Nutcracker', '/models/figurines/nutcracker.glb', 4),
  ('sugarplum', 'Sugar Plum Fairy', '/models/figurines/sugarplum.glb', 5),
  ('scrooge', 'Ebenezer Scrooge', '/models/figurines/scrooge.glb', 6),
  ('tinytim', 'Tiny Tim', '/models/figurines/tinytim.glb', 7),
  ('gingerbread', 'Gingerbread Man', '/models/figurines/gingerbread.glb', 8),
  ('jackfrost', 'Jack Frost', '/models/figurines/jackfrost.glb', 9),
  ('krampus', 'Krampus', '/models/figurines/krampus.glb', 10),
  ('comet', 'Comet', '/models/figurines/comet.glb', 11),
  ('toysoldier', 'Toy Soldier', '/models/figurines/toysoldier.glb', 12),
  ('rudolph', 'Rudolph', '/models/figurines/rudolph.glb', 13),
  ('frosty', 'Frosty', '/models/figurines/frosty.glb', 14),
  ('grinch', 'The Grinch', '/models/figurines/grinch.glb', 15),
  ('buddy', 'Buddy the Elf', '/models/figurines/buddy.glb', 16)
on conflict (id) do nothing;
