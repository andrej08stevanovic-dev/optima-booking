"use server";

import { DateTime } from "luxon";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { broadcastReceptionChange } from "@/lib/realtime";
import {
  computeAvailableSlots,
  type AvailabilityResult,
  type BusyInterval,
  type Slot,
  type WorkingWindow,
} from "./availability";
import type { MergedSlot } from "./types";

type Settings = {
  slot_interval_minutes: number;
  min_lead_minutes: number;
  max_horizon_days: number;
  timezone: string;
};

export type SlotsResponse =
  | { ok: true; slots: Slot[]; outOfRange: boolean }
  | { ok: false; error: string };

export type AnySlotsResponse =
  | { ok: true; slots: MergedSlot[]; outOfRange: boolean }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Interni helperi (deljena logika — jedan algoritam, jedno mesto za dohvat)
// ---------------------------------------------------------------------------

async function loadSettings(): Promise<Settings | null> {
  const res = await supabase
    .from("settings")
    .select("slot_interval_minutes, min_lead_minutes, max_horizon_days, timezone")
    .eq("id", 1)
    .single();
  return res.error || !res.data ? null : (res.data as Settings);
}

async function loadServiceDuration(serviceId: string): Promise<number | null> {
  const res = await supabase
    .from("services")
    .select("duration_minutes")
    .eq("id", serviceId)
    .single();
  return res.error || !res.data ? null : (res.data.duration_minutes as number);
}

// Slobodni termini JEDNOG radnika. Koristi POSTOJEĆU čistu funkciju kao crnu kutiju.
// settings + duration se prosleđuju spolja da se ne dohvataju N puta u "bilo ko" petlji.
async function slotsForOneStaff(params: {
  staffId: string;
  dateStr: string;
  durationMinutes: number;
  settings: Settings;
}): Promise<AvailabilityResult | null> {
  const { staffId, dateStr, durationMinutes, settings } = params;
  const tz = settings.timezone;

  const date = DateTime.fromISO(dateStr, { zone: tz });
  if (!date.isValid) return null;

  // Dan u nedelji U BEOGRADSKOJ ZONI -> naša konvencija (0=ned…6=sub).
  const dayOfWeek = date.weekday % 7; // Luxon: 1=pon…7=ned => 7%7=0 (ned), 6=sub

  const whRes = await supabase
    .from("working_hours")
    .select("start_time, end_time")
    .eq("staff_id", staffId)
    .eq("day_of_week", dayOfWeek);
  if (whRes.error) return null;
  const workingWindows: WorkingWindow[] = (whRes.data ?? []).map((w) => ({
    startTime: w.start_time as string,
    endTime: w.end_time as string,
  }));

  // Granice dana u UTC-u, da suzimo upit za bookings/time_off.
  const dayStartUtc = date.startOf("day").toUTC().toISO()!;
  const dayEndUtc = date.endOf("day").toUTC().toISO()!;

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
  if (bookingsRes.error || timeOffRes.error) return null;

  const busy: BusyInterval[] = [
    ...(bookingsRes.data ?? []),
    ...(timeOffRes.data ?? []),
  ].map((b) => ({
    startUtcISO: b.starts_at as string,
    endUtcISO: b.ends_at as string,
  }));

  return computeAvailableSlots({
    dateStr,
    durationMinutes,
    timezone: tz,
    slotIntervalMinutes: settings.slot_interval_minutes,
    minLeadMinutes: settings.min_lead_minutes,
    maxHorizonDays: settings.max_horizon_days,
    workingWindows,
    busy,
  });
}

// Aktivni radnici koji rade datu uslugu, poređani po imenu (deterministički redosled
// koji koristi i "bilo ko" dodela pri upisu).
async function staffForService(
  serviceId: string
): Promise<{ id: string; full_name: string }[] | null> {
  const linkRes = await supabase
    .from("staff_services")
    .select("staff_id")
    .eq("service_id", serviceId);
  if (linkRes.error) return null;
  const ids = (linkRes.data ?? []).map((r) => r.staff_id as string);
  if (ids.length === 0) return [];

  const staffRes = await supabase
    .from("staff")
    .select("id, full_name")
    .in("id", ids)
    .eq("is_active", true)
    .order("full_name");
  if (staffRes.error) return null;
  return (staffRes.data ?? []) as { id: string; full_name: string }[];
}

// ---------------------------------------------------------------------------
// Server action: slobodni termini za KONKRETNOG radnika (Faza 2 — netaknuto ponašanje)
// ---------------------------------------------------------------------------
export async function getAvailableSlots(
  staffId: string,
  serviceId: string,
  dateStr: string
): Promise<SlotsResponse> {
  if (!staffId || !serviceId || !dateStr) {
    return { ok: false, error: "Nedostaju podaci za pretragu termina." };
  }

  const settings = await loadSettings();
  if (!settings) {
    return { ok: false, error: "Ne mogu da učitam podešavanja salona." };
  }

  const durationMinutes = await loadServiceDuration(serviceId);
  if (durationMinutes == null) {
    return { ok: false, error: "Usluga nije pronađena." };
  }

  const result = await slotsForOneStaff({
    staffId,
    dateStr,
    durationMinutes,
    settings,
  });
  if (!result) {
    return { ok: false, error: "Ne mogu da izračunam termine." };
  }

  return { ok: true, slots: result.slots, outOfRange: result.outOfRange };
}

// ---------------------------------------------------------------------------
// Server action: SPOJENI slobodni termini SVIH radnika koji rade uslugu ("Bilo ko")
// ---------------------------------------------------------------------------
export async function getAvailableSlotsAnyStaff(
  serviceId: string,
  dateStr: string
): Promise<AnySlotsResponse> {
  if (!serviceId || !dateStr) {
    return { ok: false, error: "Nedostaju podaci za pretragu termina." };
  }

  const settings = await loadSettings();
  if (!settings) {
    return { ok: false, error: "Ne mogu da učitam podešavanja salona." };
  }

  const durationMinutes = await loadServiceDuration(serviceId);
  if (durationMinutes == null) {
    return { ok: false, error: "Usluga nije pronađena." };
  }

  const staff = await staffForService(serviceId);
  if (!staff) {
    return { ok: false, error: "Ne mogu da učitam radnike." };
  }

  // Za svakog radnika pozovi istu crnu kutiju; spoji po početnom vremenu.
  const perStaff = await Promise.all(
    staff.map(async (s) => ({
      staff: s,
      result: await slotsForOneStaff({
        staffId: s.id,
        dateStr,
        durationMinutes,
        settings,
      }),
    }))
  );

  if (perStaff.some((p) => p.result == null)) {
    return { ok: false, error: "Ne mogu da izračunam termine." };
  }

  // Spajanje: Map po startUtcISO -> { label, freeStaff[] }. Radnici mogu imati
  // različite početke smena, pa spajamo po svim različitim vremenima.
  const outOfRange = perStaff.some((p) => p.result!.outOfRange);
  const merged = new Map<string, MergedSlot>();
  for (const { staff: s, result } of perStaff) {
    for (const slot of result!.slots) {
      const existing = merged.get(slot.startUtcISO);
      if (existing) {
        existing.freeStaff.push({ id: s.id, ime: s.full_name });
      } else {
        merged.set(slot.startUtcISO, {
          startUtcISO: slot.startUtcISO,
          label: slot.label,
          freeStaff: [{ id: s.id, ime: s.full_name }],
        });
      }
    }
  }

  const slots = [...merged.values()].sort((a, b) =>
    a.startUtcISO.localeCompare(b.startUtcISO)
  );

  return { ok: true, slots, outOfRange };
}

// ---------------------------------------------------------------------------
// Upis rezervacije
// ---------------------------------------------------------------------------

export type CreateBookingInput = {
  serviceId: string;
  startUtcISO: string; // izabrani termin (UTC ISO) iz liste slobodnih
  origin: "specific" | "any"; // namera mušterije, NE trenutni broj slobodnih
  staffId?: string; // obavezno samo za 'specific'
  fullName: string;
  phone: string;
  email?: string;
};

export type CreateBookingResponse =
  | { ok: true; staffId: string; staffName: string }
  | { ok: false; reason: "taken" } // niko nije slobodan u tom trenutku
  | { ok: false; reason: "invalid"; message: string }
  | { ok: false; reason: "error"; message: string };

// Nađi mušteriju po telefonu (unique) ili je napravi. Vrati id.
// Ako mušterija već postoji i sada je unela DRUGAČIJI email, ažuriraj joj ga na
// najnoviji (Faza 5 odluka: magic-link identitet ide isključivo po email-u, pa
// stari/pogrešan email na postojećem redu blokira "Moja zakazivanja").
async function resolveCustomerId(
  fullName: string,
  phone: string,
  email: string | null
): Promise<{ ok: true; id: string } | { ok: false }> {
  const existing = await supabaseAdmin
    .from("customers")
    .select("id, email")
    .eq("phone", phone)
    .maybeSingle();
  if (existing.error) return { ok: false };
  if (existing.data) {
    if (email && email !== existing.data.email) {
      await supabaseAdmin.from("customers").update({ email }).eq("id", existing.data.id);
    }
    return { ok: true, id: existing.data.id };
  }

  const created = await supabaseAdmin
    .from("customers")
    .insert({ full_name: fullName, phone, email })
    .select("id")
    .single();
  if (!created.error) return { ok: true, id: created.data.id };

  // Trka: dve istovremene rezervacije istog broja -> unique violation, pa re-select.
  if (created.error.code === "23505") {
    const again = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("phone", phone)
      .single();
    if (!again.error && again.data) return { ok: true, id: again.data.id };
  }
  return { ok: false };
}

// Pokušaj upisa za KONKRETNOG radnika. EXCLUDE constraint je konačni sudija.
async function tryInsertBooking(params: {
  customerId: string;
  staffId: string;
  serviceId: string;
  startsAt: string;
  endsAt: string;
}): Promise<"ok" | "taken" | "error"> {
  const ins = await supabaseAdmin.from("bookings").insert({
    customer_id: params.customerId,
    staff_id: params.staffId,
    service_id: params.serviceId,
    starts_at: params.startsAt,
    ends_at: params.endsAt,
    status: "booked",
    source: "online",
  });
  if (!ins.error) return "ok";
  // 23P01 = exclusion_violation => taj radnik je u međuvremenu zauzet.
  if (ins.error.code === "23P01") return "taken";
  return "error";
}

export async function createBooking(
  input: CreateBookingInput
): Promise<CreateBookingResponse> {
  const fullName = input.fullName?.trim();
  const phone = input.phone?.trim();
  const email = input.email?.trim() || null;

  if (!input.serviceId || !input.startUtcISO) {
    return { ok: false, reason: "invalid", message: "Nedostaju podaci." };
  }
  if (input.origin === "specific" && !input.staffId) {
    return { ok: false, reason: "invalid", message: "Nedostaje radnik." };
  }
  if (!fullName) {
    return { ok: false, reason: "invalid", message: "Ime je obavezno." };
  }
  if (!phone) {
    return { ok: false, reason: "invalid", message: "Telefon je obavezan." };
  }

  const settings = await loadSettings();
  if (!settings) {
    return { ok: false, reason: "error", message: "Ne mogu da učitam podešavanja." };
  }

  // Trajanje iz baze — NE veruj browseru; ends_at računamo na serveru.
  const durationMinutes = await loadServiceDuration(input.serviceId);
  if (durationMinutes == null) {
    return { ok: false, reason: "error", message: "Usluga nije pronađena." };
  }

  const start = DateTime.fromISO(input.startUtcISO);
  if (!start.isValid) {
    return { ok: false, reason: "invalid", message: "Neispravno vreme." };
  }
  const startsAt = start.toUTC().toISO()!;
  const endsAt = start.toUTC().plus({ minutes: durationMinutes }).toISO()!;

  const customer = await resolveCustomerId(fullName, phone, email);
  if (!customer.ok) {
    return { ok: false, reason: "error", message: "Greška pri obradi mušterije." };
  }

  // ----- KONKRETAN radnik: pokušaj upis; ako baza odbije, radnika NE menjaj. -----
  if (input.origin === "specific") {
    const staffId = input.staffId!;
    const res = await tryInsertBooking({
      customerId: customer.id,
      staffId,
      serviceId: input.serviceId,
      startsAt,
      endsAt,
    });
    if (res === "taken") return { ok: false, reason: "taken" };
    if (res === "error") {
      return { ok: false, reason: "error", message: "Greška pri upisu rezervacije." };
    }
    const staffRes = await supabase
      .from("staff")
      .select("full_name")
      .eq("id", staffId)
      .single();
    await broadcastReceptionChange();
    return {
      ok: true,
      staffId,
      staffName: (staffRes.data?.full_name as string) ?? "",
    };
  }

  // ----- "BILO KO": reizračunaj ko je slobodan i probaj SVE tim redom. -----
  // Datum izvedi iz termina U BEOGRADSKOJ ZONI (za dohvat smena/zauzeća).
  const dateStr = start.setZone(settings.timezone).toISODate();
  if (!dateStr) {
    return { ok: false, reason: "invalid", message: "Neispravno vreme." };
  }

  const staff = await staffForService(input.serviceId);
  if (!staff) {
    return { ok: false, reason: "error", message: "Ne mogu da učitam radnike." };
  }

  // Ko je slobodan baš u ovom trenutku (deterministički redosled po imenu).
  const freeStaff: { id: string; full_name: string }[] = [];
  for (const s of staff) {
    const result = await slotsForOneStaff({
      staffId: s.id,
      dateStr,
      durationMinutes,
      settings,
    });
    if (result && result.slots.some((sl) => sl.startUtcISO === startsAt)) {
      freeStaff.push(s);
    }
  }

  // Probaj redom; race (23P01) -> sledeći; svakog najviše jednom.
  for (const s of freeStaff) {
    const res = await tryInsertBooking({
      customerId: customer.id,
      staffId: s.id,
      serviceId: input.serviceId,
      startsAt,
      endsAt,
    });
    if (res === "ok") {
      await broadcastReceptionChange();
      return { ok: true, staffId: s.id, staffName: s.full_name };
    }
    if (res === "error") {
      return { ok: false, reason: "error", message: "Greška pri upisu rezervacije." };
    }
    // res === "taken" -> probaj sledećeg slobodnog
  }

  // Niko nije slobodan (ili su se svi zauzeli u međuvremenu).
  return { ok: false, reason: "taken" };
}
