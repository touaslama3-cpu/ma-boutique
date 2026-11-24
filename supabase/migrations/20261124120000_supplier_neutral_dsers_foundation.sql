-- TAW.co: modèle fournisseur neutre pour la future intégration DSers.
-- Migration additive uniquement : ne supprime ni ne modifie les colonnes CJ historiques.
-- À relire et tester sur un environnement de préproduction avant toute application.

alter table public.orders
  add column if not exists supplier_provider text,
  add column if not exists supplier_order_id text,
  add column if not exists supplier_order_status text,
  add column if not exists supplier_submission_status text not null default 'blocked_unconfigured',
  add column if not exists supplier_submitted_at timestamptz,
  add column if not exists supplier_last_error text,
  add column if not exists tracking_carrier text,
  add column if not exists tracking_number text,
  add column if not exists tracking_url text,
  add column if not exists tracking_updated_at timestamptz;

create index if not exists orders_supplier_submission_status_idx
  on public.orders (supplier_provider, supplier_submission_status, created_at desc);

create table if not exists public.supplier_variant_mappings_v2 (
  id uuid primary key default gen_random_uuid(),
  store_product_id integer not null,
  variant_key text not null check (char_length(variant_key) between 1 and 120),
  supplier_provider text not null check (supplier_provider in ('dsers')),
  supplier_product_id text not null,
  supplier_variant_id text not null,
  supplier_sku text,
  supplier_product_url text,
  product_cost numeric(12,2) check (product_cost is null or product_cost >= 0),
  cost_currency text not null default 'EUR' check (cost_currency in ('EUR','USD')),
  destination_country_code text not null default 'FR' check (destination_country_code ~ '^[A-Z]{2}$'),
  shipping_cost numeric(12,2) check (shipping_cost is null or shipping_cost >= 0),
  shipping_currency text not null default 'EUR' check (shipping_currency in ('EUR','USD')),
  shipping_method text,
  delivery_min_days integer check (delivery_min_days is null or delivery_min_days >= 0),
  delivery_max_days integer check (delivery_max_days is null or delivery_max_days >= 0),
  availability_status text not null default 'unverified'
    check (availability_status in ('unverified','available','unavailable','out_of_stock')),
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  is_active boolean not null default false,
  verified_at timestamptz,
  verification_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_variant_mappings_v2_days_check
    check (delivery_min_days is null or delivery_max_days is null or delivery_max_days >= delivery_min_days),
  constraint supplier_variant_mappings_v2_variant_unique
    unique (supplier_provider, store_product_id, variant_key)
);

create index if not exists supplier_variant_mappings_v2_product_idx
  on public.supplier_variant_mappings_v2 (store_product_id, is_active);

create table if not exists public.fulfillment_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  supplier_provider text not null check (supplier_provider in ('dsers')),
  action text not null check (action in ('submit_order','refresh_tracking','cancel_order')),
  status text not null default 'blocked'
    check (status in ('blocked','queued','processing','succeeded','failed','needs_review','cancelled')),
  idempotency_key text not null unique,
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  request_reference text,
  response_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, supplier_provider, action)
);

create index if not exists fulfillment_jobs_queue_idx
  on public.fulfillment_jobs (status, available_at)
  where status in ('queued','failed','needs_review');

alter table public.supplier_variant_mappings_v2 enable row level security;
alter table public.fulfillment_jobs enable row level security;
revoke all on public.supplier_variant_mappings_v2 from anon, authenticated;
revoke all on public.fulfillment_jobs from anon, authenticated;
grant all on public.supplier_variant_mappings_v2 to service_role;
grant all on public.fulfillment_jobs to service_role;

drop policy if exists "Service role manages neutral supplier mappings" on public.supplier_variant_mappings_v2;
create policy "Service role manages neutral supplier mappings"
  on public.supplier_variant_mappings_v2 for all to service_role
  using (true) with check (true);

drop policy if exists "Service role manages fulfillment jobs" on public.fulfillment_jobs;
create policy "Service role manages fulfillment jobs"
  on public.fulfillment_jobs for all to service_role
  using (true) with check (true);

-- Les lignes DSers restent inactives et non vérifiées jusqu'à validation réelle
-- du SKU, du stock, du coût et de la livraison vers la France.
