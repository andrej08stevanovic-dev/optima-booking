import { DateTime } from "luxon";

// Čista funkcija: izračunava slobodne početke termina za JEDNOG radnika, JEDAN datum.
// Bez Supabase, bez "use server" — samo logika + Luxon, da može da se testira izolovano.
// Server action (actions.ts) dohvati podatke iz baze i pozove ovu funkciju.

export type WorkingWindow = { startTime: string; endTime: string }; // "09:00:00"
export type BusyInterval = { startUtcISO: string; endUtcISO: string };

export type AvailabilityInput = {
  dateStr: string; // "2026-07-15" — tumači se u zoni `timezone`
  durationMinutes: number;
  timezone: string;
  slotIntervalMinutes: number;
  minLeadMinutes: number;
  maxHorizonDays: number;
  workingWindows: WorkingWindow[]; // SAMO prozori za taj dan u nedelji
  busy: BusyInterval[]; // bookings (status<>cancelled) + time_off, kao UTC ISO
  // Override "sada" za testove. Default: stvarno sada, u beogradskoj zoni.
  now?: DateTime;
};

export type Slot = {
  startUtcISO: string;
  endUtcISO: string;
  label: string; // beogradsko zidno vreme za prikaz, npr "09:15"
};

export type AvailabilityResult = {
  slots: Slot[];
  outOfRange: boolean; // datum pre danas ili posle horizonta
};

function overlaps(
  startMs: number,
  endMs: number,
  busy: BusyInterval[]
): boolean {
  for (const b of busy) {
    const bStart = DateTime.fromISO(b.startUtcISO).toMillis();
    const bEnd = DateTime.fromISO(b.endUtcISO).toMillis();
    // Intervali se seku ako (start1 < end2 AND start2 < end1).
    if (startMs < bEnd && bStart < endMs) return true;
  }
  return false;
}

export function computeAvailableSlots(
  input: AvailabilityInput
): AvailabilityResult {
  const {
    dateStr,
    durationMinutes,
    timezone: tz,
    slotIntervalMinutes,
    minLeadMinutes,
    maxHorizonDays,
    workingWindows,
    busy,
  } = input;

  // "sada" i "danas" ISKLJUČIVO u beogradskoj zoni — nikad sirovi new Date()/UTC.
  const now = (input.now ?? DateTime.now()).setZone(tz);

  const date = DateTime.fromISO(dateStr, { zone: tz });
  if (!date.isValid) return { slots: [], outOfRange: true };

  // Granice datuma u zoni: [danas, danas + horizont]. ISO YYYY-MM-DD se poredi leksikografski.
  const todayISO = now.toISODate()!;
  const maxISO = now.plus({ days: maxHorizonDays }).toISODate()!;
  const dISO = date.toISODate()!;
  if (dISO < todayISO || dISO > maxISO) return { slots: [], outOfRange: true };

  // Prag minimalne najave kao UTC trenutak (now u Beogradu -> UTC + lead).
  const leadCutoffMs = now.toUTC().plus({ minutes: minLeadMinutes }).toMillis();

  const slots: Slot[] = [];

  for (const w of workingWindows) {
    const [sh, sm] = w.startTime.split(":").map(Number);
    const [eh, em] = w.endTime.split(":").map(Number);

    const windowStart = date.set({
      hour: sh,
      minute: sm,
      second: 0,
      millisecond: 0,
    });
    const windowEnd = date.set({
      hour: eh,
      minute: em,
      second: 0,
      millisecond: 0,
    });

    let cand = windowStart;
    // Cela usluga mora da stane u prozor: (cand + duration) <= kraj prozora.
    while (
      cand.plus({ minutes: durationMinutes }).toMillis() <=
      windowEnd.toMillis()
    ) {
      const startUtc = cand.toUTC();
      const endUtc = cand.plus({ minutes: durationMinutes }).toUTC();
      const startMs = startUtc.toMillis();
      const endMs = endUtc.toMillis();

      const tooSoon = startMs < leadCutoffMs;
      const busyClash = overlaps(startMs, endMs, busy);

      if (!tooSoon && !busyClash) {
        slots.push({
          startUtcISO: startUtc.toISO()!,
          endUtcISO: endUtc.toISO()!,
          label: cand.toFormat("HH:mm"), // beogradsko vreme
        });
      }

      cand = cand.plus({ minutes: slotIntervalMinutes });
    }
  }

  // Sortiraj po vremenu (ako ima više prozora) i dedupe po startu.
  slots.sort((a, b) => a.startUtcISO.localeCompare(b.startUtcISO));
  const seen = new Set<string>();
  const unique = slots.filter((s) => {
    if (seen.has(s.startUtcISO)) return false;
    seen.add(s.startUtcISO);
    return true;
  });

  return { slots: unique, outOfRange: false };
}
