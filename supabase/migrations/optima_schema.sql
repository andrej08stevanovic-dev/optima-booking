-- =====================================================================
-- Optima Booking — kompletna šema baze (IZVOR ISTINE: CLAUDE.md)
-- Pokreni ceo fajl u Supabase: SQL Editor -> New query -> Run.
-- Bezbedno za ponovno pokretanje: prvo briše postojeće tabele.
-- =====================================================================

-- --- Ekstenzije ------------------------------------------------------
create extension if not exists pgcrypto;    -- gen_random_uuid()
create extension if not exists btree_gist;  -- EXCLUDE sa "staff_id WITH ="

-- --- Čisto okruženje (drop u obrnutom redosledu zavisnosti) ----------
drop table if exists bookings       cascade;
drop table if exists time_off       cascade;
drop table if exists working_hours  cascade;
drop table if exists staff_services cascade;
drop table if exists customers      cascade;
drop table if exists services       cascade;
drop table if exists staff          cascade;
drop table if exists settings       cascade;

-- =====================================================================
-- Tabele
-- =====================================================================

-- Radnici (frizeri / majstori za nokte). Rezervacija se vezuje za radnika.
create table staff (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  phone       text,
  email       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Usluge: kategorija (kosa/nokti) + podrazumevano trajanje (deljivo sa 15).
create table services (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  category         text not null check (category in ('kosa', 'nokti')),
  duration_minutes int  not null check (duration_minutes > 0 and duration_minutes % 15 = 0),
  price            numeric(10,2) not null default 0,
  is_active        boolean not null default true
);

-- Ko radi koju uslugu (mešovito: jedan radnik može i kosu i nokte).
create table staff_services (
  staff_id   uuid not null references staff(id)    on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  primary key (staff_id, service_id)
);

-- Smene. day_of_week: 0=nedelja … 6=subota (Postgres dow / JS getDay), NE Luxon.
create table working_hours (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references staff(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time  time not null,
  end_time    time not null,
  check (start_time < end_time)
);

-- Odsustva / pauze radnika (blokira termine u tom intervalu).
create table time_off (
  id        uuid primary key default gen_random_uuid(),
  staff_id  uuid not null references staff(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  reason    text,
  check (starts_at < ends_at)
);

-- Mušterije: identifikacija BROJEM telefona (unique). Email opciono.
create table customers (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  phone      text not null unique,
  email      text,
  notes      text,
  created_at timestamptz not null default now()
);

-- Rezervacije. Čuva starts_at i ends_at (trajanje se može produžiti ručno).
-- EXCLUDE constraint => fizički nemoguć dupli buking za istog radnika.
create table bookings (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  staff_id    uuid not null references staff(id)     on delete cascade,
  service_id  uuid not null references services(id)  on delete restrict,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  status      text not null default 'booked'
                check (status in ('booked','confirmed','done','cancelled','no_show')),
  source      text not null default 'online',
  created_at  timestamptz not null default now(),
  check (starts_at < ends_at),
  constraint no_double_booking exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled')
);

-- Podešavanja salona (jedan red). Ovde žive brojevi koje NE kucamo u kod.
create table settings (
  id                    smallint primary key default 1,
  slot_interval_minutes int  not null default 15,
  min_lead_minutes      int  not null default 30,
  max_horizon_days      int  not null default 60,
  timezone              text not null default 'Europe/Belgrade',
  check (id = 1)
);
insert into settings (id) values (1);

-- =====================================================================
-- RLS: javno čitanje display podataka, osetljivo zaključano
-- =====================================================================
alter table staff          enable row level security;
alter table services       enable row level security;
alter table staff_services enable row level security;
alter table working_hours  enable row level security;
alter table settings       enable row level security;
alter table customers      enable row level security;
alter table bookings       enable row level security;
alter table time_off       enable row level security;

-- Javno čitanje (anon SELECT) za podatke koji se ionako prikazuju mušterijama:
create policy "public read staff"          on staff          for select using (true);
create policy "public read services"       on services       for select using (true);
create policy "public read staff_services" on staff_services for select using (true);
create policy "public read working_hours"  on working_hours  for select using (true);
create policy "public read settings"       on settings       for select using (true);

-- customers, bookings, time_off: BEZ politike za sad => anon ključ ne može da ih čita ni piše.
-- Upis rezervacija u Fazi 2 ide SERVER-SIDE (service role), ne direktno iz browsera —
-- tako niko ne može da lažira ni čita tuđe rezervacije. Pristup rešavamo u Fazi 2 i 5.

-- =====================================================================
-- Lažni podaci (seed) — konzistentni sa pravilima zakazivanja
-- (sva trajanja deljiva sa 15; realne smene da Faza 2 ima u šta da upadne)
-- =====================================================================

-- Radnici
insert into staff (full_name, phone, email) values
  ('Ana Petrović',     '+381641111111', 'ana@optima.rs'),
  ('Marija Jovanović', '+381642222222', 'marija@optima.rs'),
  ('Stefan Nikolić',   '+381643333333', 'stefan@optima.rs');

-- Usluge: KOSA
insert into services (name, category, duration_minutes, price) values
  ('Žensko šišanje', 'kosa', 45,  1500),
  ('Muško šišanje',  'kosa', 30,  1000),
  ('Feniranje',      'kosa', 30,  1200),
  ('Farbanje',       'kosa', 90,  3500),
  ('Pramenovi',      'kosa', 120, 4500);

-- Usluge: NOKTI
insert into services (name, category, duration_minutes, price) values
  ('Manikir',              'nokti', 45, 1200),
  ('Gel lak',              'nokti', 60, 1800),
  ('Nadogradnja noktiju',  'nokti', 90, 3000),
  ('Pedikir',              'nokti', 60, 2000);

-- Ko radi šta (Ana = mešovito kosa+nokti; Marija = nokti; Stefan = kosa)
insert into staff_services (staff_id, service_id)
select s.id, sv.id
from staff s
join services sv on (
     (s.full_name = 'Ana Petrović'     and sv.name in ('Žensko šišanje','Feniranje','Farbanje','Pramenovi','Manikir','Gel lak'))
  or (s.full_name = 'Marija Jovanović' and sv.name in ('Manikir','Gel lak','Nadogradnja noktiju','Pedikir'))
  or (s.full_name = 'Stefan Nikolić'   and sv.name in ('Muško šišanje','Žensko šišanje','Feniranje'))
);

-- Smene: svi rade pon–pet 09:00–17:00 (day_of_week 1..5)
insert into working_hours (staff_id, day_of_week, start_time, end_time)
select s.id, d, time '09:00', time '17:00'
from staff s
cross join generate_series(1, 5) as d
where s.full_name in ('Ana Petrović','Marija Jovanović','Stefan Nikolić');

-- Subota (6): Ana i Marija 09:00–14:00; Stefan ne radi subotom
insert into working_hours (staff_id, day_of_week, start_time, end_time)
select s.id, 6, time '09:00', time '14:00'
from staff s
where s.full_name in ('Ana Petrović','Marija Jovanović');
