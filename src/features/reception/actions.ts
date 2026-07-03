"use server";

import { DateTime } from "luxon";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hasValidStaffSession } from "@/lib/staff-guard";
import { loadDayCalendar } from "./data";
import type { DayCalendar } from "./types";

export type DayCalendarResponse =
  | { ok: true; data: DayCalendar }
  | { ok: false; error: string };

// Koristi se i za navigaciju datuma i za realtime refetch — isti mehanizam,
// jedan izvor istine. Čita telefone mušterija, pa je iza sesijske provere.
export async function getDayCalendar(dateStr: string): Promise<DayCalendarResponse> {
  if (!(await hasValidStaffSession())) {
    return { ok: false, error: "Sesija je istekla. Prijavi se ponovo." };
  }
  try {
    const data = await loadDayCalendar(dateStr);
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Ne mogu da učitam kalendar za taj dan." };
  }
}

export type ReceptionNow = { dateStr: string; timeStr: string };
export type ReceptionNowResponse =
  | { ok: true; now: ReceptionNow }
  | { ok: false };

// "Sada" za walk-in pretpopunu — RAČUNA SE NA SERVERU (izvor istine za beogradsko
// vreme), zaokruženo naviše na sledeći slot. Nikad new Date()/browser zona.
export async function getReceptionNow(): Promise<ReceptionNowResponse> {
  if (!(await hasValidStaffSession())) {
    return { ok: false };
  }
  const settingsRes = await supabaseAdmin
    .from("settings")
    .select("timezone, slot_interval_minutes")
    .eq("id", 1)
    .single();
  if (settingsRes.error || !settingsRes.data) {
    return { ok: false };
  }
  const tz = settingsRes.data.timezone as string;
  const slot = (settingsRes.data.slot_interval_minutes as number) || 15;

  const now = DateTime.now().setZone(tz);
  const minutesOfDay = now.hour * 60 + now.minute;
  const rounded = Math.ceil(minutesOfDay / slot) * slot;
  // Zaokruživanje može da pređe ponoć — dodaj razliku od početka dana.
  const slotDt = now.startOf("day").plus({ minutes: rounded });

  return {
    ok: true,
    now: { dateStr: slotDt.toISODate()!, timeStr: slotDt.toFormat("HH:mm") },
  };
}
