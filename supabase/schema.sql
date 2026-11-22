create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text not null unique,
  stripe_payment_intent_id text,
  customer_email text not null,
  customer_name text,
  customer_phone text,
  shipping_address jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  amount_total integer not null default 0,
  currency text not null default 'eur',
  payment_status text not null default 'paid',
  fulfillment_status text not null default 'à préparer',
  tracking_number text,
  tracking_url text,
  carrier text,
  customer_note text,
  dsers_exported_at timestamptz,
  cj_order_id text,
  cj_order_status text,
  cj_order_created_at timestamptz,
  cj_submission_status text not null default 'awaiting_mapping',
  cj_submitted_at timestamptz,
  cj_logistic_name text,
  cj_origin_country_code text,
  cj_last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  refunded_amount integer not null default 0 check (refunded_amount >= 0)
);

alter table public.orders add column if not exists customer_phone text;
alter table public.orders add column if not exists dsers_exported_at timestamptz;
alter table public.orders add column if not exists cj_order_id text;
alter table public.orders add column if not exists cj_order_status text;
alter table public.orders add column if not exists cj_order_created_at timestamptz;
alter table public.orders add column if not exists cj_submission_status text not null default 'awaiting_mapping';
alter table public.orders add column if not exists cj_submitted_at timestamptz;
alter table public.orders add column if not exists cj_logistic_name text;
alter table public.orders add column if not exists cj_origin_country_code text;
alter table public.orders add column if not exists cj_last_error text;
alter table public.orders add column if not exists refunded_amount integer not null default 0;

create table if not exists public.supplier_variant_mappings (
  id uuid primary key default gen_random_uuid(),
  store_product_id integer not null check (store_product_id between 101 and 115),
  variant_key text not null default 'default',
  cj_product_id text not null,
  cj_variant_id text not null,
  cj_variant_sku text,
  origin_country_code text not null default 'CN' check (origin_country_code ~ '^[A-Z]{2}$'),
  logistic_name text not null,
  unit_cost_usd numeric(12,2) not null default 0 check (unit_cost_usd >= 0),
  is_active boolean not null default true,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_product_id, variant_key)
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_fulfillment_status_idx on public.orders (fulfillment_status);
create index if not exists orders_cj_submission_status_idx on public.orders (cj_submission_status);
create index if not exists supplier_variant_mappings_product_idx on public.supplier_variant_mappings (store_product_id, is_active);

alter table public.orders enable row level security;
alter table public.supplier_variant_mappings enable row level security;
revoke all on public.orders from anon, authenticated;
revoke all on public.supplier_variant_mappings from anon, authenticated;
grant all on public.orders to service_role;
grant all on public.supplier_variant_mappings to service_role;

create or replace function public.set_order_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders
for each row execute function public.set_order_updated_at();

-- Customer account data. RLS ensures each signed-in customer can only
-- access their own profile, addresses, and paid-order history.
create table if not exists public.customer_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create index if not exists orders_user_id_created_at_idx on public.orders(user_id, created_at desc);
create index if not exists customer_addresses_user_idx on public.customer_addresses(user_id, created_at desc);
create unique index if not exists customer_addresses_one_default_idx on public.customer_addresses(user_id) where is_default;

alter table public.customer_profiles enable row level security;
alter table public.customer_addresses enable row level security;
revoke all on public.customer_profiles from anon;
revoke all on public.customer_addresses from anon;
grant select, insert, update on public.customer_profiles to authenticated;
grant select, insert, update, delete on public.customer_addresses to authenticated;

drop policy if exists "Customers manage own profile" on public.customer_profiles;
create policy "Customers manage own profile" on public.customer_profiles
  for all to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
drop policy if exists "Customers view own orders" on public.orders;
create policy "Customers view own orders" on public.orders
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Customers manage own addresses" on public.customer_addresses;
create policy "Customers manage own addresses" on public.customer_addresses
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);


-- 2026-11-22 customer experience extension
create table if not exists public.customer_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id integer not null check (product_id between 101 and 115),
  created_at timestamptz not null default now(),
  unique(user_id, product_id)
);
create index if not exists customer_favorites_user_idx on public.customer_favorites(user_id, created_at desc);
alter table public.customer_favorites enable row level security;
revoke all on public.customer_favorites from anon;
grant select, insert, delete on public.customer_favorites to authenticated;
drop policy if exists "Customers manage own favorites" on public.customer_favorites;
create policy "Customers manage own favorites" on public.customer_favorites
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id integer not null check (product_id between 101 and 115),
  order_id uuid not null references public.orders(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  title text check (title is null or char_length(title) <= 100),
  body text not null check (char_length(body) between 5 and 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  unique(user_id, product_id, order_id)
);
create index if not exists product_reviews_product_status_idx on public.product_reviews(product_id, status, created_at desc);
create index if not exists product_reviews_user_idx on public.product_reviews(user_id, created_at desc);
alter table public.product_reviews enable row level security;
revoke all on public.product_reviews from anon, authenticated;
grant select on public.product_reviews to anon, authenticated;
grant insert on public.product_reviews to authenticated;
drop policy if exists "Anyone reads approved product reviews" on public.product_reviews;
create policy "Anyone reads approved product reviews" on public.product_reviews
  for select to anon, authenticated using (status = 'approved' or (select auth.uid()) = user_id);
drop policy if exists "Verified buyers can submit reviews" on public.product_reviews;
create policy "Verified buyers can submit reviews" on public.product_reviews
  for insert to authenticated with check (
    (select auth.uid()) = user_id and status = 'pending'
    and exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())
      and o.payment_status = 'paid' and o.fulfillment_status = 'livrée'
      and o.items @> jsonb_build_array(jsonb_build_object('id', product_id))
    )
  );

create table if not exists public.promotion_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,40}$'),
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value integer not null check (discount_value > 0),
  minimum_amount integer not null default 0 check (minimum_amount >= 0),
  max_uses integer check (max_uses is null or max_uses > 0),
  uses_count integer not null default 0 check (uses_count >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((discount_type <> 'percent') or discount_value <= 90)
);
alter table public.promotion_codes enable row level security;
revoke all on public.promotion_codes from anon, authenticated;
grant select, insert, update, delete on public.promotion_codes to service_role;
drop policy if exists "Service role manages promotion codes" on public.promotion_codes;
create policy "Service role manages promotion codes" on public.promotion_codes
  for all to service_role using (true) with check (true);

create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 5 and 2000),
  items jsonb not null default '[]'::jsonb,
  status text not null default 'requested' check (status in ('requested','approved','rejected','received','refunded','closed')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists return_requests_user_idx on public.return_requests(user_id, created_at desc);
create index if not exists return_requests_order_idx on public.return_requests(order_id, created_at desc);
alter table public.return_requests enable row level security;
revoke all on public.return_requests from anon, authenticated;
grant select, insert on public.return_requests to authenticated;
grant select, insert, update on public.return_requests to service_role;
drop policy if exists "Customers view own return requests" on public.return_requests;
create policy "Customers view own return requests" on public.return_requests
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Customers request returns for own paid orders" on public.return_requests;
create policy "Customers request returns for own paid orders" on public.return_requests
  for insert to authenticated with check (
    (select auth.uid()) = user_id and status = 'requested'
    and exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())
      and o.payment_status = 'paid' and o.fulfillment_status in ('expédiée','livrée'))
  );

create table if not exists public.customer_invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  invoice_number text not null unique,
  issued_at timestamptz not null default now(),
  billing_details jsonb not null default '{}'::jsonb,
  pdf_storage_path text,
  created_at timestamptz not null default now()
);
create index if not exists customer_invoices_user_idx on public.customer_invoices(user_id, issued_at desc);
alter table public.customer_invoices enable row level security;
revoke all on public.customer_invoices from anon, authenticated;
grant select on public.customer_invoices to authenticated;
grant select, insert, update on public.customer_invoices to service_role;
drop policy if exists "Customers view own invoices" on public.customer_invoices;
create policy "Customers view own invoices" on public.customer_invoices
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.supplier_variant_mappings from anon, authenticated;
grant select, insert, update, delete on public.supplier_variant_mappings to service_role;
drop policy if exists "Service role manages supplier mappings" on public.supplier_variant_mappings;
create policy "Service role manages supplier mappings" on public.supplier_variant_mappings
  for all to service_role using (true) with check (true);
