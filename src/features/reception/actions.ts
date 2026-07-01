"use server";

import { loadDayCalendar } from "./data";
import type { DayCalendar } from "./types";

export type DayCalendarResponse =
  | { ok: true; data: DayCalendar }
  | { ok: false; error: string };

// Koristi se i za navigaciju datuma i (Korak B) za realtime refetch —
// isti mehanizam, jedan izvor istine.
export async function getDayCalendar(dateStr: string): Promise<DayCalendarResponse> {
  try {
    const data = await loadDayCalendar(dateStr);
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Ne mogu da učitam kalendar za taj dan." };
  }
}
