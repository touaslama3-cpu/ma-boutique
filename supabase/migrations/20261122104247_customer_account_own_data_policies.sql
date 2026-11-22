alter table public.orders
  add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists orders_user_id_created_at_idx
  on public.orders(user_id, created_at desc);
create table if not exists public.customer_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.orders enable row level security;
alter table public.customer_profiles enable row level security;
revoke all on public.orders from anon, authenticated;
revoke all on public.customer_profiles from anon, authenticated;
grant select on public.orders to authenticated;
grant select, insert, update on public.customer_profiles to authenticated;
create policy "Customers can read own orders" on public.orders
  for select to authenticated using (auth.uid() = user_id);
create policy "Customers can read own profile" on public.customer_profiles
  for select to authenticated using (auth.uid() = id);
create policy "Customers can insert own profile" on public.customer_profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "Customers can update own profile" on public.customer_profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
