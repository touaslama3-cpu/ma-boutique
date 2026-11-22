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
