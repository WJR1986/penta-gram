-- WORD LEAGUE - SUPABASE SETUP (STAGE 2B)
-- Run this entire file once for a NEW Supabase project.
-- If Stage 2 is already installed, run stage2b_upgrade.sql instead.
--
-- This project intentionally has no user authentication: Will, Michelle and
-- Molly select their name in the app. The database therefore trusts the three
-- players not to impersonate each other.

create table if not exists public.players (
  id text primary key,
  display_name text not null unique,
  sort_order smallint not null default 0,
  avatar_type text not null default 'none',
  avatar_value text,
  avatar_updated_at timestamptz not null default now(),
  constraint players_id_format check (id ~ '^[a-z0-9_-]+$'),
  constraint players_avatar_value_check check (
    (avatar_type = 'none' and avatar_value is null)
    or
    (
      avatar_type = 'preset'
      and avatar_value ~ '^avatar-(0[1-9]|1[0-9]|20)\.webp$'
    )
    or
    (
      avatar_type = 'upload'
      and avatar_value ~ '^data:image/(webp|jpeg|png);base64,'
      and char_length(avatar_value) <= 180000
    )
  )
);

insert into public.players (id, display_name, sort_order)
values
  ('will', 'Will', 1),
  ('michelle', 'Michelle', 2),
  ('molly', 'Molly', 3)
on conflict (id) do update
set display_name = excluded.display_name,
    sort_order = excluded.sort_order;

create table if not exists public.game_sessions (
  player_id text not null references public.players(id) on delete restrict,
  puzzle_date date not null,
  puzzle_version text not null,
  guesses jsonb not null default '[]'::jsonb,
  completed boolean not null default false,
  won boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),

  primary key (player_id, puzzle_date, puzzle_version),

  constraint game_sessions_guess_array check (
    case
      when jsonb_typeof(guesses) = 'array' then jsonb_array_length(guesses) <= 6
      else false
    end
  ),
  constraint game_sessions_won_requires_completed check (not won or completed),
  constraint game_sessions_completion_time check (completed_at is null or completed)
);

create index if not exists game_sessions_version_date_idx
  on public.game_sessions (puzzle_version, puzzle_date);

create index if not exists game_sessions_player_version_date_idx
  on public.game_sessions (player_id, puzzle_version, puzzle_date);

create or replace function public.set_word_league_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_game_sessions_updated_at on public.game_sessions;
create trigger set_game_sessions_updated_at
before update on public.game_sessions
for each row execute function public.set_word_league_updated_at();

create or replace function public.set_word_league_avatar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.avatar_updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_players_avatar_updated_at on public.players;
create trigger set_players_avatar_updated_at
before update of avatar_type, avatar_value on public.players
for each row execute function public.set_word_league_avatar_updated_at();

alter table public.players enable row level security;
alter table public.game_sessions enable row level security;

revoke all on table public.players from anon;
revoke all on table public.game_sessions from anon;

grant select on table public.players to anon;
grant update (avatar_type, avatar_value) on table public.players to anon;
grant select, insert, update on table public.game_sessions to anon;

drop policy if exists "word league players are readable" on public.players;
create policy "word league players are readable"
on public.players
for select
to anon
using (true);

drop policy if exists "word league player avatars can be updated" on public.players;
create policy "word league player avatars can be updated"
on public.players
for update
to anon
using (id in ('will', 'michelle', 'molly'))
with check (id in ('will', 'michelle', 'molly'));

drop policy if exists "word league games are readable" on public.game_sessions;
create policy "word league games are readable"
on public.game_sessions
for select
to anon
using (true);

drop policy if exists "word league games can be created" on public.game_sessions;
create policy "word league games can be created"
on public.game_sessions
for insert
to anon
with check (player_id in ('will', 'michelle', 'molly'));

drop policy if exists "word league games can be updated" on public.game_sessions;
create policy "word league games can be updated"
on public.game_sessions
for update
to anon
using (player_id in ('will', 'michelle', 'molly'))
with check (player_id in ('will', 'michelle', 'molly'));

-- No DELETE grant or policy is created. The public game cannot erase history.
