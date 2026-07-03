import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { findCustomerIdsByEmail } from "@/lib/email-match";
import type { MyBooking, MyBookingsData } from "./types";

type RawBooking = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  services: { name: string } | null;
  staff: { full_name: string } | null;
};

// Termini PRIJAVLJENE mušterije, po email-u iz Supabase sesije (customer-guard.ts).
// customer_id se NIKAD ne prosleđuje spolja — email -> findCustomerIdsByEmail ->
// bookings.customer_id IN (...) je jedini lanac. Admin klijent (bookings/customers
// su bez anon RLS politike, kao i za recepciju).
export async function loadMyBookings(email: string): Promise<MyBookingsData> {
  const settingsRes = await supabaseAdmin.from("settings").select("timezone").eq("id", 1).single();
  if (settingsRes.error || !settingsRes.data) {
    throw new Error("Ne mogu da učitam podešavanja salona.");
  }
  const tz = settingsRes.data.timezone as string;

  const customerIds = await findCustomerIdsByEmail(email);
  if (customerIds === null) {
    throw new Error("Greška pri pretrazi mušterije.");
  }
  if (customerIds.length === 0) {
    return { tz, bookings: [] };
  }

  const res = await supabaseAdmin
    .from("bookings")
    .select("id, starts_at, ends_at, status, services(name), staff(full_name)")
    .in("customer_id", customerIds)
    .order("starts_at", { ascending: false });
  if (res.error) {
    throw new Error("Greška pri učitavanju termina.");
  }

  // supabase-js zaključi embedovani many-to-one kao niz; runtime je objekat
  // (isti obrazac kao /salon/page.tsx i reception/data.ts) — castujemo kroz unknown.
  const raw = (res.data ?? []) as unknown as RawBooking[];
  const bookings: MyBooking[] = raw.map((b) => ({
    id: b.id,
    startUtcISO: b.starts_at,
    endUtcISO: b.ends_at,
    status: b.status as MyBooking["status"],
    serviceName: b.services?.name ?? "",
    staffName: b.staff?.full_name ?? "",
  }));

  return { tz, bookings };
}
