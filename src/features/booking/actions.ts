"use server";

import { DateTime } from "luxon";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  computeAvailableSlots,
  type BusyInterval,
  type Slot,
  type WorkingWindow,
} from "./availability";

type Settings = {
  slot_interval_minutes: number;
  min_lead_minutes: number;
  max_horizon_days: number;
  timezone: string;
};

export type SlotsResponse =
  | { ok: true; slots: Slot[]; outOfRange: boolean }
  | { ok: false; error: string };

// Server action: izračunaj slobodne termine za radnika + uslugu + datum.
// Javna čitanja (settings, services, working_hours) idu anon klijentom;
// zaključane tabele (bookings, time_off) idu admin (service_role) klijentom.
export async function getAvailableSlots(
  staffId: string,
  serviceId: string,
  dateStr: string
): Promise<SlotsResponse> {
  if (!staffId || !serviceId || !dateStr) {
    return { ok: false, error: "Nedostaju podaci za pretragu termina." };
  }

  // 1) Settings (jedan red, id=1).
  const settingsRes = await supabase
    .from("settings")
    .select("slot_interval_minutes, min_lead_minutes, max_horizon_days, timezone")
    .eq("id", 1)
    .single();

  if (settingsRes.error || !settingsRes.data) {
    return { ok: false, error: "Ne mogu da učitam podešavanja salona." };
  }
  const settings = settingsRes.data as Settings;
  const tz = settings.timezone;

  // 2) Trajanje usluge (NE iz browsera).
  const serviceRes = await supabase
    .from("services")
    .select("duration_minutes")
    .eq("id", serviceId)
    .single();

  if (serviceRes.error || !serviceRes.data) {
    return { ok: false, error: "Usluga nije pronađena." };
  }
  const durationMinutes = serviceRes.data.duration_minutes as number;

  // 3) Dan u nedelji U BEOGRADSKOJ ZONI -> naša konvencija (0=ned…6=sub).
  const date = DateTime.fromISO(dateStr, { zone: tz });
  if (!date.isValid) {
    return { ok: false, error: "Neispravan datum." };
  }
  const dayOfWeek = date.weekday % 7; // Luxon: 1=pon…7=ned => 7%7=0 (ned), 6=sub

  // 4) Smene radnika za taj dan.
  const whRes = await supabase
    .from("working_hours")
    .select("start_time, end_time")
    .eq("staff_id", staffId)
    .eq("day_of_week", dayOfWeek);

  if (whRes.error) {
    return { ok: false, error: "Ne mogu da učitam radno vreme." };
  }
  const workingWindows: WorkingWindow[] = (whRes.data ?? []).map((w) => ({
    startTime: w.start_time as string,
    endTime: w.end_time as string,
  }));

  // Granice dana u UTC-u, da suzimo upit za bookings/time_off.
  const dayStartUtc = date.startOf("day").toUTC().toISO()!;
  const dayEndUtc = date.endOf("day").toUTC().toISO()!;

  // 5) Zauzeća (admin klijent — zaključane tabele).
  //    Sve što se PREKLAPA sa danom: ends_at > danStart AND starts_at < danEnd.
  const [bookingsRes, timeOffRes] = await Promise.all([
    supabaseAdmin
      .from("bookings")
      .select("starts_at, ends_at")
      .eq("staff_id", staffId)
      .neq("status", "cancelled")
      .lt("starts_at", dayEndUtc)
      .gt("ends_at", dayStartUtc),
    supabaseAdmin
      .from("time_off")
      .select("starts_at, ends_at")
      .eq("staff_id", staffId)
      .lt("starts_at", dayEndUtc)
      .gt("ends_at", dayStartUtc),
  ]);

  if (bookingsRes.error || timeOffRes.error) {
    return { ok: false, error: "Ne mogu da proverim zauzeća." };
  }

  const busy: BusyInterval[] = [
    ...(bookingsRes.data ?? []),
    ...(timeOffRes.data ?? []),
  ].map((b) => ({
    startUtcISO: b.starts_at as string,
    endUtcISO: b.ends_at as string,
  }));

  // 6) Algoritam.
  const result = computeAvailableSlots({
    dateStr,
    durationMinutes,
    timezone: tz,
    slotIntervalMinutes: settings.slot_interval_minutes,
    minLeadMinutes: settings.min_lead_minutes,
    maxHorizonDays: settings.max_horizon_days,
    workingWindows,
    busy,
  });

  return { ok: true, slots: result.slots, outOfRange: result.outOfRange };
}

// ---------------------------------------------------------------------------
// Upis rezervacije
// ---------------------------------------------------------------------------

export type CreateBookingInput = {
  staffId: string;
  serviceId: string;
  startUtcISO: string; // izabrani termin (UTC ISO) iz liste slobodnih
  fullName: string;
  phone: string;
  email?: string;
};

export type CreateBookingResponse =
  | { ok: true }
  | { ok: false; reason: "taken" } // EXCLUDE sudar — termin upravo zauzet
  | { ok: false; reason: "invalid"; message: string }
  | { ok: false; reason: "error"; message: string };

export async function createBooking(
  input: CreateBookingInput
): Promise<CreateBookingResponse> {
  const fullName = input.fullName?.trim();
  const phone = input.phone?.trim();
  const email = input.email?.trim() || null;

  if (!input.staffId || !input.serviceId || !input.startUtcISO) {
    return { ok: false, reason: "invalid", message: "Nedostaju podaci." };
  }
  if (!fullName) {
    return { ok: false, reason: "invalid", message: "Ime je obavezno." };
  }
  if (!phone) {
    return { ok: false, reason: "invalid", message: "Telefon je obavezan." };
  }

  // Trajanje iz baze — NE veruj browseru; ends_at računamo na serveru.
  const serviceRes = await supabase
    .from("services")
    .select("duration_minutes")
    .eq("id", input.serviceId)
    .single();
  if (serviceRes.error || !serviceRes.data) {
    return { ok: false, reason: "error", message: "Usluga nije pronađena." };
  }

  const start = DateTime.fromISO(input.startUtcISO);
  if (!start.isValid) {
    return { ok: false, reason: "invalid", message: "Neispravno vreme." };
  }
  const startsAt = start.toUTC().toISO()!;
  const endsAt = start
    .toUTC()
    .plus({ minutes: serviceRes.data.duration_minutes })
    .toISO()!;

  // Mušterija: identifikacija BROJEM telefona (unique). Nađi ili napravi.
  let customerId: string;
  const existing = await supabaseAdmin
    .from("customers")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (existing.error) {
    return { ok: false, reason: "error", message: "Greška pri proveri mušterije." };
  }
  if (existing.data) {
    customerId = existing.data.id;
  } else {
    const created = await supabaseAdmin
      .from("customers")
      .insert({ full_name: fullName, phone, email })
      .select("id")
      .single();
    if (created.error) {
      // Trka: dve istovremene rezervacije istog broja -> unique violation, pa re-select.
      if (created.error.code === "23505") {
        const again = await supabaseAdmin
          .from("customers")
          .select("id")
          .eq("phone", phone)
          .single();
        if (again.error || !again.data) {
          return { ok: false, reason: "error", message: "Greška pri kreiranju mušterije." };
        }
        customerId = again.data.id;
      } else {
        return { ok: false, reason: "error", message: "Greška pri kreiranju mušterije." };
      }
    } else {
      customerId = created.data.id;
    }
  }

  // Upis rezervacije. EXCLUDE constraint u bazi je konačni sudija za sudare.
  const ins = await supabaseAdmin.from("bookings").insert({
    customer_id: customerId,
    staff_id: input.staffId,
    service_id: input.serviceId,
    starts_at: startsAt,
    ends_at: endsAt,
    status: "booked",
    source: "online",
  });

  if (ins.error) {
    // 23P01 = exclusion_violation => termin je u međuvremenu zauzet.
    if (ins.error.code === "23P01") {
      return { ok: false, reason: "taken" };
    }
    return { ok: false, reason: "error", message: "Greška pri upisu rezervacije." };
  }

  return { ok: true };
}
