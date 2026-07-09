-- Smart Task Allocation Application Schema
-- Run this file in Supabase SQL Editor.

create extension if not exists "pgcrypto";

create type user_role as enum ('manager', 'department_staff', 'staff_member', 'system_admin');
do $$ begin
  alter type user_role add value if not exists 'customer';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type user_role add value if not exists 'user_admin';
exception when duplicate_object then null; end $$;
create type availability_status as enum ('available', 'unavailable', 'time_off');
create type availability_request_status as enum ('pending', 'approved', 'rejected');
create type task_status as enum ('pending', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled');
do $$ begin
  create type booking_status as enum ('pending', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  business_name text,
  host_admin_id uuid references profiles(id) on delete set null,
  email text not null unique,
  role user_role not null,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table profiles add column if not exists host_admin_id uuid references profiles(id) on delete set null;
alter table profiles add column if not exists attendance_qr_token text;
alter table profiles add column if not exists attendance_qr_rotated_at timestamptz;
alter table profiles add column if not exists marketing_description text;
alter table profiles add column if not exists marketing_published boolean default false;
alter table profiles add column if not exists service_rates jsonb default '{}'::jsonb;

update profiles
set host_admin_id = id
where role = 'system_admin'
  and host_admin_id is null;

update profiles profile
set host_admin_id = admin.id
from profiles admin
where profile.host_admin_id is null
  and profile.business_name is not null
  and admin.role = 'system_admin'
  and admin.business_name = profile.business_name;

create table if not exists staff_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  host_admin_id uuid references profiles(id) on delete set null,
  staff_name text not null,
  email text,
  phone text,
  skills text[] default '{}',
  assigned_region text,
  availability availability_status default 'available',
  current_workload integer default 0,
  weekly_working_hours numeric default 0,
  max_weekly_hours numeric default 40,
  performance_rating numeric default 0,
  status text default 'active',
  is_suspended boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table staff_profiles add column if not exists host_admin_id uuid references profiles(id) on delete set null;
alter table staff_profiles add column if not exists manager_id uuid references profiles(id) on delete set null;

update staff_profiles sp
set host_admin_id = p.host_admin_id
from profiles p
where sp.user_id = p.id
  and sp.host_admin_id is null
  and p.host_admin_id is not null;

create table if not exists task_requests (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references profiles(id) on delete set null,
  title text not null,
  description text,
  location text not null,
  required_skill text not null,
  priority text default 'normal',
  estimated_hours numeric not null default 1,
  instructions text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  travel_time text,
  status task_status default 'pending',
  rejection_reason text,
  assigned_staff_id uuid references staff_profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references profiles(id) on delete cascade,
  host_admin_id uuid references profiles(id) on delete set null,
  service_type text not null,
  description text,
  location text not null,
  scheduled_date date,
  scheduled_time text,
  estimated_hours numeric not null default 2,
  notes text,
  status booking_status default 'pending',
  assigned_staff_id uuid references staff_profiles(id) on delete set null,
  recommendation_reason text,
  reviewed_by uuid references profiles(id) on delete set null,
  rejection_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table bookings add column if not exists host_admin_id uuid references profiles(id) on delete set null;
alter table bookings add column if not exists recommendation_reason text;
alter table bookings add column if not exists checked_in_at timestamptz;
alter table bookings add column if not exists checked_out_at timestamptz;
alter table bookings add column if not exists attendance_status text;
alter table bookings add column if not exists latitude double precision;
alter table bookings add column if not exists longitude double precision;
alter table bookings add column if not exists created_by uuid references profiles(id) on delete set null;
alter table bookings add column if not exists source text not null default 'customer';
alter table bookings add column if not exists guest_name text;
alter table bookings add column if not exists guest_contact text;
-- 'manual' | 'ai' | 'history' for manager-created tasks; null for customer self-service bookings.
alter table bookings add column if not exists creation_method text;

create table if not exists availability_requests (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid references staff_profiles(id) on delete cascade,
  requested_by uuid references profiles(id) on delete set null,
  current_availability availability_status not null,
  requested_availability availability_status not null,
  status availability_request_status default 'pending',
  manager_id uuid references profiles(id) on delete set null,
  comment text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists task_recommendations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references task_requests(id) on delete cascade,
  staff_id uuid references staff_profiles(id) on delete cascade,
  score numeric not null,
  reason text,
  created_at timestamptz default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  title text not null,
  message text not null,
  is_read boolean default false,
  created_at timestamptz default now()
);

create table if not exists task_proofs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references task_requests(id) on delete cascade,
  booking_id uuid references bookings(id) on delete cascade,
  staff_id uuid references staff_profiles(id) on delete cascade,
  file_url text not null,
  file_name text,
  created_at timestamptz default now()
);

alter table task_proofs add column if not exists booking_id uuid references bookings(id) on delete cascade;

create table if not exists performance_reviews (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references task_requests(id) on delete cascade,
  booking_id uuid references bookings(id) on delete cascade,
  staff_id uuid references staff_profiles(id) on delete cascade,
  manager_id uuid references profiles(id) on delete set null,
  rating integer check (rating between 1 and 5),
  feedback text,
  created_at timestamptz default now()
);

alter table performance_reviews add column if not exists booking_id uuid references bookings(id) on delete cascade;

create table if not exists system_parameters (
  id integer primary key default 1,
  workload_threshold numeric default 3,
  max_weekly_hours_default numeric default 40,
  proximity_radius numeric default 10,
  availability_weight numeric default 30,
  skill_weight numeric default 25,
  region_weight numeric default 20,
  hours_weight numeric default 15,
  workload_weight numeric default 10,
  performance_weight numeric default 10,
  updated_at timestamptz default now(),
  constraint only_one_parameter_row check (id = 1)
);
insert into system_parameters (id) values (1) on conflict (id) do nothing;

create table if not exists security_logs (
  id uuid primary key default gen_random_uuid(),
  email text,
  event_type text not null,
  details text,
  created_at timestamptz default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  action text not null,
  details text,
  created_at timestamptz default now()
);

-- Auto-generated weekly schedule proposals (from the Sunday-7pm cron job), pending manager review.
-- Deliberately has no RLS policy below: only ever read/written server-side with the service-role key.
create table if not exists schedule_proposals (
  id uuid primary key default gen_random_uuid(),
  host_admin_id uuid references profiles(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  proposal jsonb not null,
  status text not null default 'pending',
  created_at timestamptz default now()
);

-- A frozen snapshot of a week's schedule taken when the manager clicks "Finalize Schedule".
-- Re-finalizing the same week overwrites its snapshot (one row per host_admin_id + week_start),
-- so viewing a past week always shows exactly what was finalized, even if bookings changed since.
create table if not exists finalized_schedules (
  id uuid primary key default gen_random_uuid(),
  host_admin_id uuid references profiles(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  finalized_by uuid references profiles(id) on delete set null,
  finalized_at timestamptz default now(),
  snapshot jsonb not null,
  unique (host_admin_id, week_start)
);

-- Daily office attendance (QR clock-in/out), one row per person per day. Distinct from the
-- per-booking checked_in_at/checked_out_at on `bookings`, which tracks arrival at a specific job.
create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  host_admin_id uuid references profiles(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  work_date date not null,
  clocked_in_at timestamptz,
  clocked_out_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (profile_id, work_date)
);

alter table profiles enable row level security;
alter table staff_profiles enable row level security;
alter table attendance_records enable row level security;
alter table task_requests enable row level security;
alter table bookings enable row level security;
alter table task_recommendations enable row level security;
alter table availability_requests enable row level security;
alter table notifications enable row level security;
alter table task_proofs enable row level security;
alter table performance_reviews enable row level security;
alter table system_parameters enable row level security;
alter table security_logs enable row level security;
alter table audit_logs enable row level security;
alter table schedule_proposals enable row level security;
alter table finalized_schedules enable row level security;

-- Prototype policies. Tighten these before production.
do $$ begin
  create policy "authenticated read profiles" on profiles for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated insert profiles" on profiles for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated update profiles" on profiles for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "authenticated all staff" on staff_profiles for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated all tasks" on task_requests for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated all bookings" on bookings for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated all recommendations" on task_recommendations for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated make availability requests" on availability_requests for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated read availability requests" on availability_requests for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated update availability requests" on availability_requests for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated all notifications" on notifications for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated all proofs" on task_proofs for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated all reviews" on performance_reviews for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated all parameters" on system_parameters for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated all security logs" on security_logs for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated all audit logs" on audit_logs for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated all finalized schedules" on finalized_schedules for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated all attendance" on attendance_records for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- Security-definer view: exposes only the public-safe columns of published company
-- marketing listings to anonymous visitors, without granting anon any broader access
-- to `profiles` (which also holds emails, QR secrets, host_admin_id, etc).
create or replace view public_marketing_listings as
select id, business_name, marketing_description, service_rates
from profiles
where role = 'system_admin' and marketing_published = true;

grant select on public_marketing_listings to anon, authenticated;

insert into storage.buckets (id, name, public)
values ('task-proofs', 'task-proofs', true)
on conflict (id) do nothing;

do $$ begin
  create policy "authenticated read task proof files" on storage.objects
  for select using (bucket_id = 'task-proofs' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated upload task proof files" on storage.objects
  for insert with check (bucket_id = 'task-proofs' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated update task proof files" on storage.objects
  for update using (bucket_id = 'task-proofs' and auth.role() = 'authenticated')
  with check (bucket_id = 'task-proofs' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role user_role;
  requested_name text;
  requested_business_name text;
  requested_host_admin_id uuid;
begin
  requested_role := coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'staff_member'::user_role);

  requested_name := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email);
  requested_business_name := nullif(new.raw_user_meta_data ->> 'business_name', '');
  requested_host_admin_id := nullif(new.raw_user_meta_data ->> 'host_admin_id', '')::uuid;

  if requested_role = 'system_admin' and requested_host_admin_id is null then
    requested_host_admin_id := new.id;
  end if;

  insert into public.profiles (id, full_name, business_name, host_admin_id, email, role, status)
  values (new.id, requested_name, requested_business_name, requested_host_admin_id, new.email, requested_role, 'active')
  on conflict (id) do nothing;

  if requested_role = 'staff_member' then
    insert into public.staff_profiles (user_id, host_admin_id, staff_name, email, skills, status)
    values (new.id, requested_host_admin_id, requested_name, new.email, '{}', 'active')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();
