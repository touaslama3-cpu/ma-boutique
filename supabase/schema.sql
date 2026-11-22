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
