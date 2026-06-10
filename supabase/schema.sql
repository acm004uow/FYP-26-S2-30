-- Smart Task Allocation Application Schema
-- Run this file in Supabase SQL Editor.

create extension if not exists "pgcrypto";

create type user_role as enum ('manager', 'department_staff', 'staff_member', 'system_admin');
create type availability_status as enum ('available', 'unavailable', 'time_off');
create type task_status as enum ('pending', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled');

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

create table if not exists task_recommendations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references task_requests(id) on delete cascade,
  staff_id uuid references staff_profiles(id) on delete cascade,
  score numeric not null,
  reason text,
  created_at timestamptz default now()
);

create table if not exists task_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
insert into task_categories (name, description)
values
  ('Maintenance', 'Equipment, facilities, and repair work'),
  ('Inspection', 'Checking quality, safety, or completion status'),
  ('Cleaning', 'Cleaning and hygiene-related tasks'),
  ('Delivery', 'Pickup, delivery, and movement tasks'),
  ('Administration', 'Administrative and coordination work')
on conflict (name) do nothing;

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
  staff_id uuid references staff_profiles(id) on delete cascade,
  file_url text not null,
  file_name text,
  created_at timestamptz default now()
);

create table if not exists performance_reviews (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references task_requests(id) on delete cascade,
  staff_id uuid references staff_profiles(id) on delete cascade,
  manager_id uuid references profiles(id) on delete set null,
  rating integer check (rating between 1 and 5),
  feedback text,
  created_at timestamptz default now()
);

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

alter table profiles enable row level security;
alter table staff_profiles enable row level security;
alter table task_requests enable row level security;
alter table task_recommendations enable row level security;
alter table task_categories enable row level security;
alter table notifications enable row level security;
alter table task_proofs enable row level security;
alter table performance_reviews enable row level security;
alter table system_parameters enable row level security;
alter table security_logs enable row level security;
alter table audit_logs enable row level security;

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
  create policy "authenticated all recommendations" on task_recommendations for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated all categories" on task_categories for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
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
    insert into public.staff_profiles (user_id, staff_name, email, skills, status)
    values (new.id, requested_name, new.email, '{}', 'active')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();
