-- ClinicFlow AI: multi-tenant schema. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null, timezone text not null default 'UTC',
  currency text not null default 'USD', avg_value numeric not null default 100,
  language text not null default 'en', wa_phone_number_id text unique
);
create table clinic_secrets (clinic_id uuid primary key references clinics on delete cascade, wa_token text not null);
create table profiles (user_id uuid primary key references auth.users on delete cascade, clinic_id uuid not null references clinics);
create table doctors (id uuid primary key default gen_random_uuid(), clinic_id uuid not null references clinics on delete cascade, name text not null, role text);
create table blocked_slots (doctor_id uuid references doctors on delete cascade, clinic_id uuid not null references clinics on delete cascade, slot_time time not null, primary key (doctor_id, slot_time));
create table patients (id uuid primary key default gen_random_uuid(), clinic_id uuid not null references clinics on delete cascade, name text, phone text not null, opted_in boolean not null default true, unique (clinic_id, phone));
create table appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics on delete cascade,
  doctor_id uuid not null references doctors, patient_id uuid not null references patients,
  treatment text not null, starts_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','reminder_sent','confirmed','rescheduled','cancelled','completed','no_show')),
  saved_noshow boolean not null default false,
  reminder_24h_sent_at timestamptz, reminder_2h_sent_at timestamptz,
  source text not null default 'dashboard'
);
create unique index no_double_booking on appointments (doctor_id, starts_at) where status <> 'cancelled';
create index on appointments (clinic_id, starts_at);
create table reminder_rules (clinic_id uuid references clinics on delete cascade, kind text check (kind in ('24h','2h','waitlist')), enabled boolean not null default true, primary key (clinic_id, kind));
create table messages (id uuid primary key default gen_random_uuid(), clinic_id uuid not null references clinics on delete cascade, phone text not null, direction text not null check (direction in ('in','out')), body text not null, wa_message_id text unique, created_at timestamptz not null default now());
create index on messages (clinic_id, phone, created_at desc);

-- Row Level Security: every user only sees their own clinic
create function my_clinic() returns uuid language sql stable security definer set search_path = public as
$$ select clinic_id from profiles where user_id = auth.uid() $$;
do $$ declare t text; begin
  foreach t in array array['doctors','blocked_slots','patients','appointments','reminder_rules','messages'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant on %I for all using (clinic_id = my_clinic()) with check (clinic_id = my_clinic())', t);
  end loop;
end $$;
alter table clinics enable row level security;
create policy own_read on clinics for select using (id = my_clinic());
create policy own_write on clinics for update using (id = my_clinic());
alter table profiles enable row level security;
create policy me on profiles for select using (user_id = auth.uid());
alter table clinic_secrets enable row level security; -- no policy = service role only
alter publication supabase_realtime add table appointments;

-- ONBOARD A CLINIC (once per client). First create their login in Authentication > Users, paste its UUID below.
-- with c as (insert into clinics(name,timezone,currency,avg_value,wa_phone_number_id)
--      values ('Dr. Sarah Ahmed''s Aesthetic & Dental Clinic','Asia/Karachi','PKR',5000,'META_PHONE_NUMBER_ID') returning id),
--   d as (insert into doctors(clinic_id,name,role) select id,'Dr. Sarah Ahmed','Aesthetic & Dental Surgeon' from c returning 1),
--   r as (insert into reminder_rules(clinic_id,kind) select id,k from c, unnest(array['24h','2h','waitlist']) k returning 1),
--   s as (insert into clinic_secrets(clinic_id,wa_token) select id,'META_ACCESS_TOKEN' from c returning 1)
-- insert into profiles(user_id,clinic_id) select 'AUTH_USER_UUID', id from c;

-- OPTIONAL: run reminders from Supabase instead of Vercel Cron (works on any Vercel plan)
-- create extension if not exists pg_cron; create extension if not exists pg_net;
-- select cron.schedule('reminders','*/10 * * * *',$$ select net.http_get('https://YOUR-APP.vercel.app/api/cron/reminders', headers := '{"Authorization":"Bearer YOUR_CRON_SECRET"}'::jsonb) $$);
