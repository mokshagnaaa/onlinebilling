-- Glamour Touch Beauty Parlour Billing System
-- Run this entire file in the Supabase SQL Editor (or as a migration) before
-- starting the web application.  This file intentionally uses only the
-- publishable/anon key from the browser; no service-role key is required.

create extension if not exists pgcrypto;

-- Keep roles separate from editable profile data.  A new account is a staff
-- account by default and cannot promote itself.  Promote the first account
-- from the SQL Editor after its email has been confirmed (see README).
do $$ begin
  create type public.app_role as enum ('staff', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.gift_card_status as enum ('active', 'exhausted', 'disabled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.gift_card_transaction_type as enum ('issuance', 'redemption', 'adjustment', 'refund');
exception when duplicate_object then null;
end $$;

create sequence if not exists public.bill_number_seq start with 1;
create sequence if not exists public.gift_card_number_seq start with 100;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'staff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  service_code text not null unique,
  name text not null,
  category text not null default 'General',
  default_price numeric(12,2) not null check (default_price >= 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_name_not_blank check (char_length(btrim(name)) > 0),
  constraint services_code_not_blank check (char_length(btrim(service_code)) > 0)
);

create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  card_number text not null unique,
  original_value numeric(12,2) not null check (original_value > 0),
  remaining_balance numeric(12,2) not null check (remaining_balance >= 0),
  amount_used numeric(12,2) generated always as (original_value - remaining_balance) stored,
  status public.gift_card_status not null default 'active',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gift_cards_no_overdraw check (remaining_balance <= original_value),
  constraint gift_cards_number_not_blank check (char_length(btrim(card_number)) > 0),
  constraint gift_cards_status_matches_balance check (
    (remaining_balance = 0 and status in ('exhausted', 'disabled'))
    or (remaining_balance > 0 and status in ('active', 'disabled'))
  )
);

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  bill_number text not null unique,
  issued_at timestamptz not null default now(),
  bill_date date not null default current_date,
  gross_amount numeric(12,2) not null check (gross_amount >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  net_amount numeric(12,2) not null check (net_amount >= 0),
  gift_card_amount numeric(12,2) not null default 0 check (gift_card_amount >= 0),
  physical_amount numeric(12,2) not null default 0 check (physical_amount >= 0),
  gift_card_id uuid references public.gift_cards(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint bills_amounts_match check (
    gross_amount - discount_amount = net_amount
    and gift_card_amount + physical_amount = net_amount
    and (gift_card_id is not null or gift_card_amount = 0)
  )
);

create table if not exists public.bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  service_id uuid references public.services(id) on delete set null,
  service_name text not null,
  category text,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  final_amount numeric(12,2) not null check (final_amount >= 0),
  created_at timestamptz not null default now(),
  unique (bill_id, line_number),
  constraint bill_items_name_not_blank check (char_length(btrim(service_name)) > 0),
  constraint bill_items_discount_not_over_price check (discount_amount <= unit_price),
  constraint bill_items_final_matches check (final_amount = unit_price - discount_amount)
);

create table if not exists public.gift_card_transactions (
  id uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null references public.gift_cards(id) on delete restrict,
  bill_id uuid references public.bills(id) on delete restrict,
  transaction_type public.gift_card_transaction_type not null,
  -- Positive amounts add credit; redemption amounts are negative.
  amount numeric(12,2) not null check (amount <> 0),
  balance_after numeric(12,2) not null check (balance_after >= 0),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint redemption_requires_bill check (
    (transaction_type = 'redemption' and bill_id is not null and amount < 0)
    or (transaction_type <> 'redemption' and bill_id is null)
  )
);

create unique index if not exists gift_card_transactions_one_redemption_per_bill
  on public.gift_card_transactions (bill_id)
  where transaction_type = 'redemption';
create index if not exists services_active_name_idx on public.services (is_active, name);
create index if not exists bills_bill_date_idx on public.bills (bill_date desc);
create index if not exists bills_created_by_idx on public.bills (created_by, issued_at desc);
create index if not exists bill_items_bill_id_idx on public.bill_items (bill_id);
create index if not exists bill_items_service_id_idx on public.bill_items (service_id);
create index if not exists gift_cards_status_idx on public.gift_cards (status, remaining_balance);
create index if not exists gift_card_transactions_card_idx
  on public.gift_card_transactions (gift_card_id, created_at desc);

-- Timestamp maintenance is ownership controlled; clients cannot write it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at before update on public.services
for each row execute function public.set_updated_at();
drop trigger if exists gift_cards_set_updated_at on public.gift_cards;
create trigger gift_cards_set_updated_at before update on public.gift_cards
for each row execute function public.set_updated_at();

-- Insert the profile using the database owner's privileges when Auth creates a
-- user.  The role is deliberately fixed to staff here.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    'staff'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Security helper.  SECURITY DEFINER avoids an RLS recursion when policies
-- ask whether the current authenticated user is an administrator.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.require_admin()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;
end;
$$;

-- The only in-app route for role management.  There is intentionally no
-- direct UPDATE privilege on profiles.role, so an ordinary user cannot make
-- itself an administrator.
create or replace function public.set_profile_role(
  p_profile_id uuid,
  p_role public.app_role
)
returns public.profiles
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  perform public.require_admin();
  update public.profiles
  set role = p_role
  where id = p_profile_id
  returning * into v_profile;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  return v_profile;
end;
$$;

-- Gift card issuance is an RPC rather than a browser insert.  Sequential
-- public card numbers are generated inside the transaction, not by the UI.
create or replace function public.create_gift_card(p_original_value numeric)
returns public.gift_cards
language plpgsql
security definer set search_path = public
as $$
declare
  v_card public.gift_cards;
  v_card_number text;
begin
  perform public.require_admin();
  if p_original_value is null or p_original_value <= 0 then
    raise exception 'Gift card value must be greater than zero' using errcode = '22023';
  end if;

  v_card_number := 'V' || nextval('public.gift_card_number_seq')::text;
  insert into public.gift_cards (
    card_number, original_value, remaining_balance, status, created_by
  ) values (
    v_card_number, round(p_original_value, 2), round(p_original_value, 2), 'active', auth.uid()
  ) returning * into v_card;

  insert into public.gift_card_transactions (
    gift_card_id, transaction_type, amount, balance_after, notes, created_by
  ) values (
    v_card.id, 'issuance', v_card.original_value, v_card.remaining_balance,
    'Gift card issued', auth.uid()
  );
  return v_card;
end;
$$;

-- Persist the bill, all of its item snapshots, and the gift-card deduction in
-- one database transaction.  This is the only way a bill should be created.
-- p_items is an array of objects such as:
-- [{"service_id":"uuid optional","service_name":"custom optional",
--   "unit_price":300,"discount_amount":50}]
create or replace function public.create_bill(
  p_items jsonb,
  p_gift_card_number text default null,
  p_issued_at timestamptz default now()
)
returns public.bills
language plpgsql
security definer set search_path = public
as $$
declare
  v_source_item jsonb;
  v_clean_items jsonb := '[]'::jsonb;
  v_service public.services;
  v_card public.gift_cards;
  v_bill public.bills;
  v_service_id uuid;
  v_service_name text;
  v_category text;
  v_unit_price numeric(12,2);
  v_discount numeric(12,2);
  v_final numeric(12,2);
  v_gross numeric(12,2) := 0;
  v_total_discount numeric(12,2) := 0;
  v_net numeric(12,2) := 0;
  v_gift_card_amount numeric(12,2) := 0;
  v_physical_amount numeric(12,2) := 0;
  v_line_number integer := 0;
  v_card_input text := nullif(upper(btrim(coalesce(p_gift_card_number, ''))), '');
begin
  perform public.require_admin();
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one bill item is required' using errcode = '22023';
  end if;
  if p_issued_at is null then
    raise exception 'Issued timestamp is required' using errcode = '22023';
  end if;

  for v_source_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_source_item) <> 'object' then
      raise exception 'Every bill item must be an object' using errcode = '22023';
    end if;
    v_service_id := nullif(v_source_item ->> 'service_id', '')::uuid;
    v_service_name := nullif(btrim(v_source_item ->> 'service_name'), '');
    v_unit_price := nullif(v_source_item ->> 'unit_price', '')::numeric(12,2);
    v_discount := coalesce(nullif(v_source_item ->> 'discount_amount', '')::numeric(12,2), 0);

    if v_service_id is not null then
      select * into v_service
      from public.services
      where id = v_service_id and is_active = true;
      if not found then
        raise exception 'The selected service is unavailable' using errcode = '22023';
      end if;
      -- Catalogue services are authoritative. Price edits belong in the
      -- service-management screen, while a no-service_id item is explicitly
      -- a one-off custom service.
      v_service_name := v_service.name;
      v_category := v_service.category;
      v_unit_price := v_service.default_price;
    else
      v_category := nullif(btrim(v_source_item ->> 'category'), '');
      if v_service_name is null or v_unit_price is null then
        raise exception 'Custom services need a name and a price' using errcode = '22023';
      end if;
    end if;

    if v_unit_price is null or v_unit_price < 0 or v_discount < 0 or v_discount > v_unit_price then
      raise exception 'Invalid price or discount on %', coalesce(v_service_name, 'bill item') using errcode = '22023';
    end if;
    v_final := v_unit_price - v_discount;
    v_gross := v_gross + v_unit_price;
    v_total_discount := v_total_discount + v_discount;
    v_net := v_net + v_final;
    v_clean_items := v_clean_items || jsonb_build_array(jsonb_build_object(
      'service_id', v_service_id,
      'service_name', v_service_name,
      'category', v_category,
      'unit_price', v_unit_price,
      'discount_amount', v_discount,
      'final_amount', v_final
    ));
  end loop;

  if v_card_input is not null then
    -- FOR UPDATE serializes concurrent redemptions against this card.
    select * into v_card
    from public.gift_cards
    where upper(card_number) = v_card_input
    for update;
    if not found then
      raise exception 'Gift card not found' using errcode = 'P0002';
    end if;
    if v_card.status <> 'active' or v_card.remaining_balance <= 0 then
      raise exception 'Gift card is not active or has no remaining balance' using errcode = '22023';
    end if;
    v_gift_card_amount := least(v_net, v_card.remaining_balance);
  end if;
  v_physical_amount := v_net - v_gift_card_amount;

  insert into public.bills (
    bill_number, issued_at, bill_date, gross_amount, discount_amount, net_amount,
    gift_card_amount, physical_amount, gift_card_id, created_by
  ) values (
    'B' || lpad(nextval('public.bill_number_seq')::text, 4, '0'),
    p_issued_at,
    (p_issued_at at time zone 'Asia/Kolkata')::date,
    v_gross, v_total_discount, v_net, v_gift_card_amount, v_physical_amount,
    case when v_card_input is null then null else v_card.id end,
    auth.uid()
  ) returning * into v_bill;

  for v_source_item in select value from jsonb_array_elements(v_clean_items)
  loop
    v_line_number := v_line_number + 1;
    insert into public.bill_items (
      bill_id, line_number, service_id, service_name, category,
      unit_price, discount_amount, final_amount
    ) values (
      v_bill.id, v_line_number,
      (v_source_item ->> 'service_id')::uuid,
      v_source_item ->> 'service_name',
      v_source_item ->> 'category',
      (v_source_item ->> 'unit_price')::numeric(12,2),
      (v_source_item ->> 'discount_amount')::numeric(12,2),
      (v_source_item ->> 'final_amount')::numeric(12,2)
    );
  end loop;

  if v_card_input is not null and v_gift_card_amount > 0 then
    update public.gift_cards
    set remaining_balance = remaining_balance - v_gift_card_amount,
        status = case when remaining_balance - v_gift_card_amount = 0 then 'exhausted' else 'active' end
    where id = v_card.id;

    insert into public.gift_card_transactions (
      gift_card_id, bill_id, transaction_type, amount, balance_after, notes, created_by
    ) values (
      v_card.id, v_bill.id, 'redemption', -v_gift_card_amount,
      v_card.remaining_balance - v_gift_card_amount,
      'Applied to bill ' || v_bill.bill_number, auth.uid()
    );
  end if;

  return v_bill;
end;
$$;

-- All totals are calculated from stored bills, never browser-side running
-- counters. Dates are inclusive and use the bill's India-local calendar day.
create or replace function public.get_dashboard_metrics(
  p_start_date date default current_date,
  p_end_date date default current_date
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public.require_admin();
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Choose a valid date range' using errcode = '22023';
  end if;

  with selected_bills as (
    select * from public.bills
    where bill_date between p_start_date and p_end_date
  ), service_rows as (
    select bi.service_name,
           count(*)::integer as times_performed,
           coalesce(sum(bi.final_amount), 0)::numeric(12,2) as revenue
    from public.bill_items bi
    join selected_bills b on b.id = bi.bill_id
    group by bi.service_name
  )
  select jsonb_build_object(
    'start_date', p_start_date,
    'end_date', p_end_date,
    'gross_service_value', coalesce((select sum(gross_amount) from selected_bills), 0),
    'total_discounts', coalesce((select sum(discount_amount) from selected_bills), 0),
    'net_service_revenue', coalesce((select sum(net_amount) from selected_bills), 0),
    'physical_collections', coalesce((select sum(physical_amount) from selected_bills), 0),
    'gift_card_redemptions', coalesce((select sum(gift_card_amount) from selected_bills), 0),
    'total_bills', coalesce((select count(*) from selected_bills), 0),
    'total_services', coalesce((select count(*) from public.bill_items bi join selected_bills b on b.id = bi.bill_id), 0),
    'active_gift_cards', (select count(*) from public.gift_cards where status = 'active' and remaining_balance > 0),
    'outstanding_gift_card_balance', coalesce((select sum(remaining_balance) from public.gift_cards where status = 'active'), 0),
    'service_breakdown', coalesce((select jsonb_agg(jsonb_build_object(
      'service_name', service_name, 'times_performed', times_performed, 'revenue', revenue
    ) order by revenue desc, service_name) from service_rows), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.get_report_summary(
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public.require_admin();
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Choose a valid date range' using errcode = '22023';
  end if;

  select public.get_dashboard_metrics(p_start_date, p_end_date) || jsonb_build_object(
    'gift_cards_issued', coalesce((
      select count(*) from public.gift_cards
      where (created_at at time zone 'Asia/Kolkata')::date between p_start_date and p_end_date
    ), 0),
    'gift_card_value_issued', coalesce((
      select sum(original_value) from public.gift_cards
      where (created_at at time zone 'Asia/Kolkata')::date between p_start_date and p_end_date
    ), 0),
    'gift_card_amount_used', coalesce((
      select sum(-amount) from public.gift_card_transactions
      where transaction_type = 'redemption'
        and (created_at at time zone 'Asia/Kolkata')::date between p_start_date and p_end_date
    ), 0)
  ) into v_result;
  return v_result;
end;
$$;

-- RLS: all business data is visible only to approved administrators.
alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.bills enable row level security;
alter table public.bill_items enable row level security;
alter table public.gift_cards enable row level security;
alter table public.gift_card_transactions enable row level security;

drop policy if exists "profiles are visible to owner or admin" on public.profiles;
create policy "profiles are visible to owner or admin" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());
drop policy if exists "users can edit their own display name" on public.profiles;
create policy "users can edit their own display name" on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "admins manage services" on public.services;
create policy "admins manage services" on public.services
for all to authenticated
using (public.is_admin())
with check (public.is_admin());
drop policy if exists "admins read bills" on public.bills;
create policy "admins read bills" on public.bills
for select to authenticated using (public.is_admin());
drop policy if exists "admins read bill items" on public.bill_items;
create policy "admins read bill items" on public.bill_items
for select to authenticated using (public.is_admin());
drop policy if exists "admins read gift cards" on public.gift_cards;
create policy "admins read gift cards" on public.gift_cards
for select to authenticated using (public.is_admin());
drop policy if exists "admins read gift card transactions" on public.gift_card_transactions;
create policy "admins read gift card transactions" on public.gift_card_transactions
for select to authenticated using (public.is_admin());

-- Explicit table privileges complement RLS. Bills and gift cards may only be
-- written through the audited, transactional RPCs above.
revoke all on public.profiles, public.services, public.bills, public.bill_items,
  public.gift_cards, public.gift_card_transactions from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select on public.bills, public.bill_items, public.gift_cards, public.gift_card_transactions to authenticated;
revoke all on function public.set_profile_role(uuid, public.app_role) from public;
revoke all on function public.create_gift_card(numeric) from public;
revoke all on function public.create_bill(jsonb, text, timestamptz) from public;
revoke all on function public.get_dashboard_metrics(date, date) from public;
revoke all on function public.get_report_summary(date, date) from public;
grant execute on function public.set_profile_role(uuid, public.app_role) to authenticated;
grant execute on function public.create_gift_card(numeric) to authenticated;
grant execute on function public.create_bill(jsonb, text, timestamptz) to authenticated;
grant execute on function public.get_dashboard_metrics(date, date) to authenticated;
grant execute on function public.get_report_summary(date, date) to authenticated;

-- Catalogue seed data.  This is safe to run again; new rows are only inserted
-- when their stable service codes do not exist yet.
insert into public.services (service_code, name, category, default_price)
values
  ('S001', 'Hair Cut', 'Hair', 300),
  ('S002', 'Hair Spa', 'Hair', 1200),
  ('S003', 'Facial', 'Skin', 1500),
  ('S004', 'Cleanup', 'Skin', 800),
  ('S005', 'Threading', 'Beauty', 200),
  ('S006', 'Waxing', 'Beauty', 500),
  ('S007', 'Makeup', 'Makeup', 3000)
on conflict (service_code) do nothing;

-- FIRST ADMIN (run once in the SQL Editor after the account signs up):
-- update public.profiles set role = 'admin' where id = (
--   select id from auth.users where email = 'your-admin@example.com'
-- );
-- This statement runs as the database owner in the SQL Editor. It is not
-- available through the public API, and ordinary accounts cannot self-promote.
