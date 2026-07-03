import "server-only";

import { DateTime } from "luxon";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { DayCalendar, ReceptionFormData } from "./types";

const DEFAULT_GRID_START_MINUTES = 8 * 60; // 08:00, ako nema smena tog dana
const DEFAULT_GRID_END_MINUTES = 20 * 60; // 20:00

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

type RawBooking = {
  id: string;
  staff_id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  note: string | null;
  customers: { full_name: string; phone: string } | null;
  services: { name: string } | null;
};

// Server-only: čita bookings/customers/time_off ISKLJUČIVO admin (service_role)
// klijentom. Anon ključ nikad ne dira ove tabele.
export async function loadDayCalendar(dateStr: string): Promise<DayCalendar> {
  const settingsRes = await supabaseAdmin
    .from("settings")
    .select("timezone")
    .eq("id", 1)
    .single();
  if (settingsRes.error || !settingsRes.data) {
    throw new Error("Ne mogu da učitam podešavanja salona.");
  }
  const tz = settingsRes.data.timezone as string;

  // "Dan" se definiše U BEOGRADSKOJ ZONI, ne po UTC danu servera.
  const date = DateTime.fromISO(dateStr, { zone: tz });
  if (!date.isValid) {
    throw new Error("Neispravan datum.");
  }
  const dayStartUtc = date.startOf("day").toUTC().toISO()!;
  const dayEndUtc = date.endOf("day").toUTC().toISO()!;
  const dayOfWeek = date.weekday % 7; // 0=ned…6=sub (ista konvencija kao u booking algoritmu)

  const [staffRes, whRes, bookingsRes, timeOffRes] = await Promise.all([
    supabaseAdmin.from("staff").select("id, full_name").eq("is_active", true).order("full_name"),
    supabaseAdmin
      .from("working_hours")
      .select("start_time, end_time")
      .eq("day_of_week", dayOfWeek),
    // Rezervacije KOJE POČINJU tog dana (u Beogradu) — usluge traju najviše par sati
    // i smene se ne protežu preko ponoći, pa je "dan" jednoznačno određen startom.
    supabaseAdmin
      .from("bookings")
      .select(
        "id, staff_id, service_id, starts_at, ends_at, note, customers(full_name, phone), services(name)"
      )
      .neq("status", "cancelled")
      .gte("starts_at", dayStartUtc)
      .lt("starts_at", dayEndUtc)
      .order("starts_at"),
    // time_off može da se proteže preko više dana -> PREKLAPANJE sa danom, ne samo start.
    supabaseAdmin
      .from("time_off")
      .select("id, staff_id, starts_at, ends_at, reason")
      .lt("starts_at", dayEndUtc)
      .gt("ends_at", dayStartUtc),
  ]);

  if (staffRes.error || whRes.error || bookingsRes.error || timeOffRes.error) {
    throw new Error("Greška pri učitavanju kalendara.");
  }

  let gridStartMinutes = DEFAULT_GRID_START_MINUTES;
  let gridEndMinutes = DEFAULT_GRID_END_MINUTES;
  const wh = whRes.data ?? [];
  if (wh.length > 0) {
    gridStartMinutes = Math.min(...wh.map((w) => toMinutes(w.start_time)));
    gridEndMinutes = Math.max(...wh.map((w) => toMinutes(w.end_time)));
  }

  const staff = (staffRes.data ?? []) as { id: string; full_name: string }[];

  // supabase-js zaključi embedovani many-to-one (customers/services) kao niz;
  // runtime je objekat (isti obrazac kao u /salon/page.tsx) — castujemo kroz unknown.
  const rawBookings = (bookingsRes.data ?? []) as unknown as RawBooking[];
  const bookings = rawBookings.map((b) => ({
    id: b.id,
    staffId: b.staff_id,
    serviceId: b.service_id,
    startUtcISO: b.starts_at,
    endUtcISO: b.ends_at,
    customerName: b.customers?.full_name ?? "",
    customerPhone: b.customers?.phone ?? "",
    serviceName: b.services?.name ?? "",
    note: b.note,
  }));

  const timeOff = (timeOffRes.data ?? []).map((t) => ({
    id: t.id as string,
    staffId: t.staff_id as string,
    startUtcISO: t.starts_at as string,
    endUtcISO: t.ends_at as string,
    reason: t.reason as string | null,
  }));

  // Mreža je izvedena iz working_hours, ALI recepcija sme da zakaže van smene (Faza 4) —
  // ako bi mreža ostala uska, takav termin bi dobio negativan/preveliki "top" i bio
  // NEVIDLJIV (renderovan van vidljivog kontejnera). Proširi granice da obuhvate SVAKI
  // termin i SVAKO odsustvo tog dana, pa zaokruži na pun sat radi čistog izgleda ose.
  const dayStart = date.startOf("day");
  const dayEndExclusive = dayStart.plus({ days: 1 });
  function dayMinutes(iso: string): number {
    return Math.round(DateTime.fromISO(iso).setZone(tz).diff(dayStart, "minutes").minutes);
  }
  for (const b of bookings) {
    gridStartMinutes = Math.min(gridStartMinutes, dayMinutes(b.startUtcISO));
    gridEndMinutes = Math.max(gridEndMinutes, dayMinutes(b.endUtcISO));
  }
  for (const t of timeOff) {
    // Isto klinovanje na granice OVOG dana kao što TimeOffBlock radi za prikaz —
    // višednevno odsustvo ne razvlači mrežu preko cele svoje dužine, samo dela koji
    // pada na ovaj dan.
    const clampedStart = DateTime.max(DateTime.fromISO(t.startUtcISO).setZone(tz), dayStart);
    const clampedEnd = DateTime.min(DateTime.fromISO(t.endUtcISO).setZone(tz), dayEndExclusive);
    gridStartMinutes = Math.min(gridStartMinutes, dayMinutes(clampedStart.toISO()!));
    gridEndMinutes = Math.max(gridEndMinutes, dayMinutes(clampedEnd.toISO()!));
  }
  gridStartMinutes = Math.floor(gridStartMinutes / 60) * 60;
  gridEndMinutes = Math.ceil(gridEndMinutes / 60) * 60;

  return { dateStr, staff, bookings, timeOff, gridStartMinutes, gridEndMinutes };
}

// Podaci za formu recepcije: SVI radnici (i neaktivni), aktivne usluge, veze radnik↔usluga.
export async function loadFormData(): Promise<ReceptionFormData> {
  const [staffRes, servicesRes, linksRes] = await Promise.all([
    supabaseAdmin.from("staff").select("id, full_name, is_active").order("full_name"),
    supabaseAdmin
      .from("services")
      .select("id, name, category, duration_minutes, price")
      .eq("is_active", true)
      .order("category")
      .order("name"),
    supabaseAdmin.from("staff_services").select("staff_id, service_id"),
  ]);

  if (staffRes.error || servicesRes.error || linksRes.error) {
    throw new Error("Greška pri učitavanju podataka za formu.");
  }

  return {
    staff: (staffRes.data ?? []) as ReceptionFormData["staff"],
    services: (servicesRes.data ?? []) as ReceptionFormData["services"],
    links: (linksRes.data ?? []) as ReceptionFormData["links"],
  };
}
