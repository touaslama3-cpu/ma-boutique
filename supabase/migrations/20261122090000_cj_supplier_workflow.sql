alter table public.orders
  add column if not exists cj_submission_status text not null default 'awaiting_mapping',
  add column if not exists cj_submitted_at timestamptz,
  add column if not exists cj_logistic_name text,
  add column if not exists cj_origin_country_code text,
  add column if not exists cj_last_error text;

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

create index if not exists orders_cj_submission_status_idx on public.orders (cj_submission_status);
create index if not exists supplier_variant_mappings_product_idx on public.supplier_variant_mappings (store_product_id, is_active);

alter table public.orders enable row level security;
alter table public.supplier_variant_mappings enable row level security;
revoke all on public.orders from anon, authenticated;
revoke all on public.supplier_variant_mappings from anon, authenticated;
grant all on public.orders to service_role;
grant all on public.supplier_variant_mappings to service_role;
