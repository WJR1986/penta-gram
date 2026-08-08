-- WORD LEAGUE - STAGE 2B PROFILE UPGRADE
-- Run this ONCE in Supabase > SQL Editor BEFORE refreshing the Stage 2B files.
-- It preserves all existing players and game_sessions data.

alter table public.players
  add column if not exists avatar_type text not null default 'none',
  add column if not exists avatar_value text,
  add column if not exists avatar_updated_at timestamptz not null default now();

-- Normalise any rows created before Stage 2B.
update public.players
set avatar_type = 'none', avatar_value = null
where avatar_type is null;

-- Bound exactly what the public no-login client can store.
-- Uploaded pictures are browser-resized to 256x256 and stored as a small data URL.
alter table public.players
  drop constraint if exists players_avatar_value_check;

alter table public.players
  add constraint players_avatar_value_check check (
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
  );

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

-- Keep the existing read access, but only permit anonymous clients to update
-- the two avatar fields. Names, IDs and sort order stay read-only from the app.
revoke update on table public.players from anon;
grant update (avatar_type, avatar_value) on table public.players to anon;

drop policy if exists "word league player avatars can be updated" on public.players;
create policy "word league player avatars can be updated"
on public.players
for update
to anon
using (id in ('will', 'michelle', 'molly'))
with check (id in ('will', 'michelle', 'molly'));
