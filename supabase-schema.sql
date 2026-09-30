-- Maple Growth Lab: one private cloud snapshot per signed-in user.
-- Run this in Supabase Dashboard > SQL Editor > New query.
create table if not exists public.maple_growth_user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  companion_inventory jsonb not null default '{}'::jsonb,
  detailed_stats jsonb not null default '{}'::jsonb,
  build_presets jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.maple_growth_user_data enable row level security;

drop policy if exists "Users can read their own Maple Growth data" on public.maple_growth_user_data;
create policy "Users can read their own Maple Growth data"
on public.maple_growth_user_data for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own Maple Growth data" on public.maple_growth_user_data;
create policy "Users can insert their own Maple Growth data"
on public.maple_growth_user_data for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own Maple Growth data" on public.maple_growth_user_data;
create policy "Users can update their own Maple Growth data"
on public.maple_growth_user_data for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own Maple Growth data" on public.maple_growth_user_data;
create policy "Users can delete their own Maple Growth data"
on public.maple_growth_user_data for delete
using (auth.uid() = user_id);

create or replace function public.maple_growth_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists maple_growth_user_data_updated_at on public.maple_growth_user_data;
create trigger maple_growth_user_data_updated_at
before update on public.maple_growth_user_data
for each row execute function public.maple_growth_set_updated_at();
