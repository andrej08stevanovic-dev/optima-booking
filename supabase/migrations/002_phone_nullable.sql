-- =====================================================================
-- Migracija 002 — Faza 4 (recepcija: ručno kreiranje / walk-in)
-- Pokreni ceo fajl u Supabase: SQL Editor -> New query -> Run.
-- Bezbedno za ponovno pokretanje (idempotentno).
-- =====================================================================

-- (a) customers.phone POSTAJE OPCIONO (walk-in mušterija bez broja),
--     ali jedinstven KAD postoji (online i dalje identifikuje po telefonu).
--     Parcijalni unique indeks: NULL redovi se ne indeksiraju, pa više
--     walk-in-ova bez broja mirno koegzistira; dve iste ne-NULL vrednosti su i dalje zabranjene.
alter table customers alter column phone drop not null;
alter table customers drop constraint if exists customers_phone_key;
create unique index if not exists customers_phone_unique
  on customers (phone) where phone is not null;

-- (b) bookings.note — opciona napomena recepcije uz konkretan termin.
alter table bookings add column if not exists note text;
