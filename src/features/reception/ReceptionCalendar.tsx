"use client";

import { useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import { supabase } from "@/lib/supabase";
import { RECEPTION_CHANNEL, RECEPTION_EVENT } from "@/lib/realtime-constants";
import { getDayCalendar } from "./actions";
import type { DayCalendar } from "./types";

const TZ = "Europe/Belgrade";
const PX_PER_MINUTE = 1.6;
const REALTIME_DEBOUNCE_MS = 400;

type Props = {
  initialData: DayCalendar;
  todayISO: string;
};

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function minutesInTz(utcISO: string): number {
  const dt = DateTime.fromISO(utcISO).setZone(TZ);
  return dt.hour * 60 + dt.minute;
}

export function ReceptionCalendar({ initialData, todayISO }: Props) {
  const [dateStr, setDateStr] = useState(initialData.dateStr);
  const [data, setData] = useState<DayCalendar>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedDateRef = useRef(initialData.dateStr);
  const dateStrRef = useRef(initialData.dateStr);

  useEffect(() => {
    dateStrRef.current = dateStr;
  }, [dateStr]);

  useEffect(() => {
    if (dateStr === loadedDateRef.current) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDayCalendar(dateStr).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setData(res.data);
        loadedDateRef.current = dateStr;
      } else {
        setError(res.error);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [dateStr]);

  // Realtime: prazan "nešto se promenilo" signal -> ponovo povuci TRENUTNO prikazani
  // dan preko admin klijenta (server action). Browser nikad ne čita bookings direktno.
  // Debounce da više event-a u kratkom roku da JEDAN refetch, ne treperenje.
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel(RECEPTION_CHANNEL)
      .on("broadcast", { event: RECEPTION_EVENT }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const target = dateStrRef.current;
          getDayCalendar(target).then((res) => {
            // Odbaci ako je korisnik u međuvremenu prešao na drugi dan.
            if (res.ok && dateStrRef.current === target) {
              setData(res.data);
              loadedDateRef.current = target;
            }
          });
        }, REALTIME_DEBOUNCE_MS);
      })
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  function goTo(offsetDays: number) {
    const next = DateTime.fromISO(dateStr, { zone: TZ }).plus({ days: offsetDays }).toISODate()!;
    setDateStr(next);
  }

  function goToday() {
    setDateStr(todayISO);
  }

  // "sr" lokal je podrazumevano ćirilica; ostatak aplikacije je latinica ("sr-Latn").
  const label = DateTime.fromISO(dateStr, { zone: TZ })
    .setLocale("sr-Latn")
    .toFormat("cccc, dd.MM.yyyy.");

  const totalMinutes = data.gridEndMinutes - data.gridStartMinutes;
  const gridHeight = totalMinutes * PX_PER_MINUTE;

  const hourMarks: number[] = [];
  for (let m = Math.ceil(data.gridStartMinutes / 60) * 60; m <= data.gridEndMinutes; m += 60) {
    hourMarks.push(m);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-[family-name:var(--font-serif)] text-2xl font-semibold capitalize sm:text-3xl">
          {label}
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goTo(-1)}
            className="rounded-lg px-3 py-2 ring-1 ring-[var(--color-beige)] transition hover:bg-[var(--color-beige)]"
            aria-label="Prethodni dan"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg px-4 py-2 font-medium ring-1 ring-[var(--color-beige)] transition hover:bg-[var(--color-beige)]"
          >
            Danas
          </button>
          <button
            type="button"
            onClick={() => goTo(1)}
            className="rounded-lg px-3 py-2 ring-1 ring-[var(--color-beige)] transition hover:bg-[var(--color-beige)]"
            aria-label="Sledeći dan"
          >
            ›
          </button>
        </div>
      </header>

      {error && (
        <p className="rounded-xl bg-[#fdece8] px-5 py-4 text-[var(--color-terracotta)]">{error}</p>
      )}

      {/* Prigušivanje umesto ubacivanja/uklanjanja teksta u tok — sprečava skok layout-a
          pri navigaciji datuma (učitavanje ne menja visinu stranice). */}
      <div className={`transition-opacity ${loading ? "opacity-50" : "opacity-100"}`}>
        {data.staff.length === 0 ? (
          <p className="rounded-xl bg-[var(--color-beige)] px-5 py-6 text-center text-[var(--color-charcoal)]/80">
            Nema aktivnih radnika.
          </p>
        ) : (
          <>
            {data.bookings.length === 0 && (
              <p className="mb-6 rounded-xl bg-[var(--color-beige)] px-5 py-3 text-center text-sm text-[var(--color-charcoal)]/70">
                Nema zakazanih termina za ovaj dan.
              </p>
            )}

            <div className="overflow-x-auto rounded-xl ring-1 ring-[var(--color-beige)] bg-white/40">
              <div className="flex" style={{ minWidth: 56 + data.staff.length * 160 }}>
                {/* Vremenska osa */}
                <div className="relative shrink-0" style={{ width: 56, height: gridHeight }}>
                  {hourMarks.map((m) => (
                    <div
                      key={m}
                      className="absolute right-2 -translate-y-1/2 text-xs text-[var(--color-charcoal)]/50"
                      style={{ top: (m - data.gridStartMinutes) * PX_PER_MINUTE }}
                    >
                      {formatMinutes(m)}
                    </div>
                  ))}
                </div>

                {/* Kolone radnika */}
                {data.staff.map((s) => (
                  <div key={s.id} className="w-40 shrink-0 border-l border-[var(--color-beige)]">
                    <div className="border-b border-[var(--color-beige)] bg-[var(--color-cream)] px-2 py-2 text-center text-sm font-medium">
                      {s.full_name}
                    </div>
                    <div className="relative" style={{ height: gridHeight }}>
                      {hourMarks.map((m) => (
                        <div
                          key={m}
                          className="absolute left-0 right-0 border-t border-[var(--color-beige)]/60"
                          style={{ top: (m - data.gridStartMinutes) * PX_PER_MINUTE }}
                        />
                      ))}

                      {data.timeOff
                        .filter((t) => t.staffId === s.id)
                        .map((t) => (
                          <TimeOffBlock
                            key={t.id}
                            timeOff={t}
                            gridStartMinutes={data.gridStartMinutes}
                            dateStr={data.dateStr}
                          />
                        ))}

                      {data.bookings
                        .filter((b) => b.staffId === s.id)
                        .map((b) => (
                          <BookingBlock key={b.id} booking={b} gridStartMinutes={data.gridStartMinutes} />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BookingBlock({
  booking,
  gridStartMinutes,
}: {
  booking: DayCalendar["bookings"][number];
  gridStartMinutes: number;
}) {
  const start = minutesInTz(booking.startUtcISO);
  const end = minutesInTz(booking.endUtcISO);
  const top = (start - gridStartMinutes) * PX_PER_MINUTE;
  const height = Math.max((end - start) * PX_PER_MINUTE, 20);

  return (
    <div
      className="absolute inset-x-1 overflow-hidden rounded-md bg-[var(--color-terracotta)] px-2 py-1 text-xs text-white shadow-sm"
      style={{ top, height }}
      title={`${booking.customerName} · ${booking.customerPhone}`}
    >
      <div className="font-medium">
        {formatMinutes(start)}–{formatMinutes(end)}
      </div>
      <div className="truncate">{booking.customerName}</div>
      <div className="truncate opacity-90">{booking.serviceName}</div>
      <div className="truncate text-[10px] opacity-75">{booking.customerPhone}</div>
    </div>
  );
}

function TimeOffBlock({
  timeOff,
  gridStartMinutes,
  dateStr,
}: {
  timeOff: DayCalendar["timeOff"][number];
  gridStartMinutes: number;
  dateStr: string;
}) {
  // time_off može da se proteže preko više dana — klinuj prikaz na granice OVOG dana.
  const dayStart = DateTime.fromISO(dateStr, { zone: TZ }).startOf("day");
  const dayEnd = dayStart.plus({ days: 1 });
  const rawStart = DateTime.fromISO(timeOff.startUtcISO).setZone(TZ);
  const rawEnd = DateTime.fromISO(timeOff.endUtcISO).setZone(TZ);
  const clampedStart = rawStart < dayStart ? dayStart : rawStart;
  const clampedEnd = rawEnd > dayEnd ? dayEnd : rawEnd;

  const start = Math.round(clampedStart.diff(dayStart, "minutes").minutes);
  const end = Math.round(clampedEnd.diff(dayStart, "minutes").minutes);

  const top = (start - gridStartMinutes) * PX_PER_MINUTE;
  const height = Math.max((end - start) * PX_PER_MINUTE, 16);

  return (
    <div
      className="absolute inset-x-1 flex items-center justify-center rounded-md border border-dashed border-[var(--color-charcoal)]/30 bg-[var(--color-beige)]/70 px-2 py-1 text-center text-xs text-[var(--color-charcoal)]/70"
      style={{ top, height }}
    >
      Pauza/Odsustvo
    </div>
  );
}
