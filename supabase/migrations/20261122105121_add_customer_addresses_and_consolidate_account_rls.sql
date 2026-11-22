create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Domicile' check (char_length(label) between 1 and 40),
  recipient_name text not null check (char_length(recipient_name) between 1 and 120),
  phone text,
  line1 text not null check (char_length(line1) between 1 and 200),
  line2 text,
  postal_code text not null check (char_length(postal_code) between 1 and 20),
  city text not null check (char_length(city) between 1 and 100),
  country_code text not null default 'FR' check (country_code ~ '^[A-Z]{2}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customer_addresses_user_idx on public.customer_addresses(user_id, created_at desc);
create unique index if not exists customer_addresses_one_default_idx on public.customer_addresses(user_id) where is_default;
alter table public.customer_addresses enable row level security;
revoke all on public.customer_addresses from anon;
grant select, insert, update, delete on public.customer_addresses to authenticated;
drop policy if exists "Customers manage own addresses" on public.customer_addresses;
create policy "Customers manage own addresses" on public.customer_addresses
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Customers manage own profile" on public.customer_profiles;
drop policy if exists "Customers view own orders" on public.orders;
create policy "Customers manage own profile" on public.customer_profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
create policy "Customers view own orders" on public.orders
  for select to authenticated
  using ((select auth.uid()) = user_id);
