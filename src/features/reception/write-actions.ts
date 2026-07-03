"use server";

import { DateTime } from "luxon";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hasValidStaffSession } from "@/lib/staff-guard";
import { broadcastReceptionChange } from "@/lib/realtime";
import type { ReceptionSource } from "./types";

export type CreateReceptionBookingInput = {
  staffId: string;
  serviceId: string;
  dateStr: string; // "2026-07-02" — zidni datum (Beograd)
  timeStr: string; // "14:30" — zidno vreme (Beograd)
  fullName: string;
  phone?: string; // OPCIONO za recepciju
  note?: string;
  source: ReceptionSource;
};

export type ReceptionWriteResponse =
  | { ok: true; bookingId: string }
  | {
      ok: false;
      reason: "unauthorized" | "taken" | "invalid" | "error";
      message?: string;
    };

// Mušterija: sa telefonom -> nađi/napravi po telefonu (kao online). Bez telefona ->
// uvek nova mušterija sa imenom (phone=null; parcijalni unique ignoriše NULL).
async function resolveReceptionCustomer(
  fullName: string,
  phone: string | null
): Promise<string | null> {
  if (phone) {
    const existing = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (existing.error) return null;
    if (existing.data) return existing.data.id;

    const created = await supabaseAdmin
      .from("customers")
      .insert({ full_name: fullName, phone })
      .select("id")
      .single();
    if (!created.error) return created.data.id;
    // Trka: dve istovremene sa istim brojem -> unique violation, pa re-select.
    if (created.error.code === "23505") {
      const again = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("phone", phone)
        .single();
      return again.error ? null : again.data.id;
    }
    return null;
  }

  const created = await supabaseAdmin
    .from("customers")
    .insert({ full_name: fullName, phone: null })
    .select("id")
    .single();
  return created.error ? null : created.data.id;
}

// Timezone (za zidno->UTC) + trajanje usluge — deljeno između create i update.
async function loadTzAndDuration(
  serviceId: string
): Promise<{ ok: true; tz: string; duration: number } | { ok: false; message: string }> {
  const settingsRes = await supabaseAdmin.from("settings").select("timezone").eq("id", 1).single();
  if (settingsRes.error || !settingsRes.data) {
    return { ok: false, message: "Ne mogu da učitam podešavanja." };
  }
  const serviceRes = await supabaseAdmin
    .from("services")
    .select("duration_minutes")
    .eq("id", serviceId)
    .single();
  if (serviceRes.error || !serviceRes.data) {
    return { ok: false, message: "Usluga nije pronađena." };
  }
  return {
    ok: true,
    tz: settingsRes.data.timezone as string,
    duration: serviceRes.data.duration_minutes as number,
  };
}

// Radnik MORA da radi tu uslugu — SERVER-SIDE (is_active se NE proverava: recepcija
// sme da zakaže/izmeni i kod trenutno neaktivnog radnika).
async function staffDoesService(staffId: string, serviceId: string): Promise<boolean | null> {
  const linkRes = await supabaseAdmin
    .from("staff_services")
    .select("staff_id")
    .eq("staff_id", staffId)
    .eq("service_id", serviceId)
    .maybeSingle();
  if (linkRes.error) return null;
  return !!linkRes.data;
}

export async function createReceptionBooking(
  input: CreateReceptionBookingInput
): Promise<ReceptionWriteResponse> {
  // 1) Sesija PRE svega (write action iza login zaštite).
  if (!(await hasValidStaffSession())) {
    return { ok: false, reason: "unauthorized" };
  }

  const fullName = input.fullName?.trim();
  const phone = input.phone?.trim() || null;
  const note = input.note?.trim() || null;

  if (!input.staffId || !input.serviceId || !input.dateStr || !input.timeStr) {
    return { ok: false, reason: "invalid", message: "Nedostaju podaci." };
  }
  if (!fullName) {
    return { ok: false, reason: "invalid", message: "Ime je obavezno." };
  }
  if (input.source !== "reception" && input.source !== "walk_in") {
    return { ok: false, reason: "invalid", message: "Nepoznat izvor." };
  }

  // 2) Timezone + trajanje usluge (ends_at se računa NA SERVERU).
  const tzDuration = await loadTzAndDuration(input.serviceId);
  if (!tzDuration.ok) {
    return { ok: false, reason: "invalid", message: tzDuration.message };
  }
  const { tz, duration } = tzDuration;

  // 3) Radnik↔usluga.
  const does = await staffDoesService(input.staffId, input.serviceId);
  if (does === null) {
    return { ok: false, reason: "error", message: "Greška pri proveri radnika." };
  }
  if (!does) {
    return { ok: false, reason: "invalid", message: "Taj radnik ne radi izabranu uslugu." };
  }

  // 4) Zidno vreme (Beograd) -> UTC preko Luxon. Bez min_lead/horizont provere
  //    (recepcija sme odmah i van smene). EXCLUDE u bazi ostaje jedina tvrda zaštita.
  const wall = DateTime.fromISO(`${input.dateStr}T${input.timeStr}`, { zone: tz });
  if (!wall.isValid) {
    return { ok: false, reason: "invalid", message: "Neispravan datum ili vreme." };
  }
  const startsAt = wall.toUTC().toISO()!;
  const endsAt = wall.toUTC().plus({ minutes: duration }).toISO()!;

  // 5) Mušterija.
  const customerId = await resolveReceptionCustomer(fullName, phone);
  if (!customerId) {
    return { ok: false, reason: "error", message: "Greška pri obradi mušterije." };
  }

  // 6) Upis. EXCLUDE constraint = konačni sudija za sudare (23P01 -> zauzeto).
  const ins = await supabaseAdmin
    .from("bookings")
    .insert({
      customer_id: customerId,
      staff_id: input.staffId,
      service_id: input.serviceId,
      starts_at: startsAt,
      ends_at: endsAt,
      status: "booked",
      source: input.source,
      note,
    })
    .select("id")
    .single();

  if (ins.error) {
    if (ins.error.code === "23P01") return { ok: false, reason: "taken" };
    return { ok: false, reason: "error", message: "Greška pri upisu rezervacije." };
  }

  await broadcastReceptionChange();
  return { ok: true, bookingId: ins.data.id };
}

// ---------------------------------------------------------------------------
// Otkazivanje
// ---------------------------------------------------------------------------

export type CancelBookingResponse =
  | { ok: true }
  | { ok: false; reason: "unauthorized" | "error"; message?: string };

export async function cancelBooking(bookingId: string): Promise<CancelBookingResponse> {
  if (!(await hasValidStaffSession())) {
    return { ok: false, reason: "unauthorized" };
  }
  if (!bookingId) {
    return { ok: false, reason: "error", message: "Nedostaje termin." };
  }

  // NE brišemo red — čuvamo istoriju. cancelled ne blokira slot (WHERE u EXCLUDE-u).
  const upd = await supabaseAdmin
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId)
    .select("id")
    .maybeSingle();

  if (upd.error) {
    return { ok: false, reason: "error", message: "Greška pri otkazivanju." };
  }
  if (!upd.data) {
    return { ok: false, reason: "error", message: "Termin nije pronađen." };
  }

  await broadcastReceptionChange();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Izmena / pomeranje
// ---------------------------------------------------------------------------

export type UpdateReceptionBookingInput = {
  bookingId: string;
  staffId: string;
  serviceId: string;
  dateStr: string;
  timeStr: string;
  fullName: string;
  phone?: string;
  note?: string;
};

export async function updateReceptionBooking(
  input: UpdateReceptionBookingInput
): Promise<ReceptionWriteResponse> {
  if (!(await hasValidStaffSession())) {
    return { ok: false, reason: "unauthorized" };
  }

  const fullName = input.fullName?.trim();
  const phone = input.phone?.trim() || null;
  const note = input.note?.trim() || null;

  if (!input.bookingId || !input.staffId || !input.serviceId || !input.dateStr || !input.timeStr) {
    return { ok: false, reason: "invalid", message: "Nedostaju podaci." };
  }
  if (!fullName) {
    return { ok: false, reason: "invalid", message: "Ime je obavezno." };
  }

  const existing = await supabaseAdmin
    .from("bookings")
    .select("customer_id")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (existing.error) {
    return { ok: false, reason: "error", message: "Greška pri učitavanju termina." };
  }
  if (!existing.data) {
    return { ok: false, reason: "invalid", message: "Termin nije pronađen." };
  }

  const tzDuration = await loadTzAndDuration(input.serviceId);
  if (!tzDuration.ok) {
    return { ok: false, reason: "invalid", message: tzDuration.message };
  }
  const { tz, duration } = tzDuration;

  const does = await staffDoesService(input.staffId, input.serviceId);
  if (does === null) {
    return { ok: false, reason: "error", message: "Greška pri proveri radnika." };
  }
  if (!does) {
    return { ok: false, reason: "invalid", message: "Taj radnik ne radi izabranu uslugu." };
  }

  const wall = DateTime.fromISO(`${input.dateStr}T${input.timeStr}`, { zone: tz });
  if (!wall.isValid) {
    return { ok: false, reason: "invalid", message: "Neispravan datum ili vreme." };
  }
  const startsAt = wall.toUTC().toISO()!;
  const endsAt = wall.toUTC().plus({ minutes: duration }).toISO()!;

  // Ažuriraj mušteriju (ime/telefon) — isti customer_id, samo popravljeni podaci.
  const custUpd = await supabaseAdmin
    .from("customers")
    .update({ full_name: fullName, phone })
    .eq("id", existing.data.customer_id);
  if (custUpd.error) {
    if (custUpd.error.code === "23505") {
      return { ok: false, reason: "error", message: "Taj telefon već pripada drugoj mušteriji." };
    }
    return { ok: false, reason: "error", message: "Greška pri izmeni mušterije." };
  }

  // UPDATE istog reda (NE delete+insert) — EXCLUDE constraint ne poredi red sam sa
  // sobom, pa pomeranje termina proverava sudar SAMO sa DRUGIM rezervacijama.
  const upd = await supabaseAdmin
    .from("bookings")
    .update({
      staff_id: input.staffId,
      service_id: input.serviceId,
      starts_at: startsAt,
      ends_at: endsAt,
      note,
    })
    .eq("id", input.bookingId)
    .select("id")
    .single();

  if (upd.error) {
    if (upd.error.code === "23P01") return { ok: false, reason: "taken" };
    return { ok: false, reason: "error", message: "Greška pri izmeni termina." };
  }

  await broadcastReceptionChange();
  return { ok: true, bookingId: upd.data.id };
}
