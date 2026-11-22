alter table public.supplier_variant_mappings
  add column if not exists shipping_cost_eur numeric(12,2) check (shipping_cost_eur is null or shipping_cost_eur >= 0),
  add column if not exists shipping_method_id text,
  add column if not exists shipping_method_name text,
  add column if not exists shipping_delivery_min_days integer check (shipping_delivery_min_days is null or shipping_delivery_min_days >= 0),
  add column if not exists shipping_delivery_max_days integer check (shipping_delivery_max_days is null or shipping_delivery_max_days >= 0),
  add column if not exists shipping_checked_at timestamptz,
  add column if not exists product_cost_eur numeric(12,2) check (product_cost_eur is null or product_cost_eur >= 0),
  add column if not exists cost_currency text not null default 'USD' check (cost_currency in ('USD','EUR'));
alter table public.supplier_variant_mappings
  add constraint supplier_variant_shipping_days_check
  check (shipping_delivery_min_days is null or shipping_delivery_max_days is null or shipping_delivery_max_days >= shipping_delivery_min_days);
create table if not exists public.supplier_quote_checks (
  id uuid primary key default gen_random_uuid(),
  store_product_id integer not null check (store_product_id between 101 and 115),
  variant_key text not null,
  cj_product_id text,
  cj_variant_id text,
  destination_country_code text not null default 'FR' check (destination_country_code ~ '^[A-Z]{2}$'),
  currency text not null default 'EUR' check (currency in ('EUR','USD')),
  product_cost numeric(12,2) check (product_cost is null or product_cost >= 0),
  shipping_cost numeric(12,2) check (shipping_cost is null or shipping_cost >= 0),
  shipping_method_id text,
  shipping_method_name text,
  delivery_min_days integer check (delivery_min_days is null or delivery_min_days >= 0),
  delivery_max_days integer check (delivery_max_days is null or delivery_max_days >= 0),
  availability boolean,
  raw_quote jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  check (delivery_min_days is null or delivery_max_days is null or delivery_max_days >= delivery_min_days)
);
create index if not exists supplier_quote_checks_product_idx on public.supplier_quote_checks(store_product_id, variant_key, checked_at desc);
alter table public.supplier_quote_checks enable row level security;
revoke all on public.supplier_quote_checks from anon, authenticated;
grant select, insert on public.supplier_quote_checks to service_role;
drop policy if exists "Service role manages supplier quote checks" on public.supplier_quote_checks;
create policy "Service role manages supplier quote checks" on public.supplier_quote_checks for all to service_role using (true) with check (true);
