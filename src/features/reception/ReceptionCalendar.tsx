"use client";

import { useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import { supabase } from "@/lib/supabase";
import { DatePicker } from "@/components/DatePicker";
import { RECEPTION_CHANNEL, RECEPTION_EVENT } from "@/lib/realtime-constants";
import { getDayCalendar, getReceptionNow } from "./actions";
import { BookingForm, type FormMode } from "./BookingForm";
import { BookingDetail } from "./BookingDetail";
import type { DayCalendar, ReceptionBooking, ReceptionFormData } from "./types";

const TZ = "Europe/Belgrade";
const PX_PER_MINUTE = 1.6;
const REALTIME_DEBOUNCE_MS = 400;
const CLICK_SLOT_MINUTES = 15; // zaokruživanje klika na mreži
// Prostor na vrhu/dnu mreže da oznaka prvog/poslednjeg sata (vertikalno centrirana
// preko translateY) ne bude odsečena ivicom kontejnera. CSS padding ovde NE pomaže —
// apsolutno pozicionisana deca se pozicioniraju od ivice padding-a, ne posle njega —
// zato je razmak ugrađen direktno u "top" računicu (i za linije/oznake i za blokove).
const GRID_INSET_PX = 10;

type Props = {
  initialData: DayCalendar;
  todayISO: string;
  formData: ReceptionFormData;
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

export function ReceptionCalendar({ initialData, todayISO, formData }: Props) {
  const [dateStr, setDateStr] = useState(initialData.dateStr);
  const [data, setData] = useState<DayCalendar>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<ReceptionBooking | null>(null);
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

  // Eksplicitan refetch trenutnog dana (posle upisa iz forme — brže od čekanja broadcast-a).
  function reloadCurrent() {
    const target = dateStrRef.current;
    getDayCalendar(target).then((res) => {
      if (res.ok && dateStrRef.current === target) {
        setData(res.data);
        loadedDateRef.current = target;
      }
    });
  }

  function openNew() {
    setFormMode({ kind: "create", source: "reception", dateStr });
  }

  async function openWalkIn() {
    // "Sada" dolazi SA SERVERA (izvor istine za beogradsko vreme).
    const res = await getReceptionNow();
    if (res.ok) {
      setFormMode({
        kind: "create",
        source: "walk_in",
        dateStr: res.now.dateStr,
        timeStr: res.now.timeStr,
      });
    } else {
      setFormMode({ kind: "create", source: "walk_in", dateStr });
    }
  }

  // Klik na prazan prostor u koloni radnika -> pretpopuni tog radnika + to vreme.
  function openAtSlot(staffId: string, offsetY: number) {
    // offsetY je piksel unutar kontejnera; oduzmi GRID_INSET_PX da se poravna sa
    // istim pomerajem koji imaju linije/blokovi (vidi GRID_INSET_PX gore).
    const rawMinutes = data.gridStartMinutes + (offsetY - GRID_INSET_PX) / PX_PER_MINUTE;
    const rounded = Math.round(rawMinutes / CLICK_SLOT_MINUTES) * CLICK_SLOT_MINUTES;
    const clamped = Math.max(data.gridStartMinutes, Math.min(rounded, data.gridEndMinutes));
    setFormMode({
      kind: "create",
      source: "reception",
      staffId,
      dateStr,
      timeStr: formatMinutes(clamped),
    });
  }

  // "sr" lokal je podrazumevano ćirilica; ostatak aplikacije je latinica ("sr-Latn").
  const label = DateTime.fromISO(dateStr, { zone: TZ })
    .setLocale("sr-Latn")
    .toFormat("cccc, dd.MM.yyyy.");

  const totalMinutes = data.gridEndMinutes - data.gridStartMinutes;
  const gridHeight = totalMinutes * PX_PER_MINUTE + GRID_INSET_PX * 2;

  const hourMarks: number[] = [];
  for (let m = Math.ceil(data.gridStartMinutes / 60) * 60; m <= data.gridEndMinutes; m += 60) {
    hourMarks.push(m);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <DatePicker
          value={dateStr}
          onChange={setDateStr}
          timezone={TZ}
          variant="heading"
          displayText={label}
        />
        <div className="flex flex-wrap items-center gap-2">
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
          <button
            type="button"
            onClick={openWalkIn}
            className="rounded-lg px-4 py-2 font-medium ring-1 ring-[var(--color-beige)] transition hover:bg-[var(--color-beige)]"
          >
            Walk-in
          </button>
          <button
            type="button"
            onClick={openNew}
            className="rounded-lg bg-[var(--color-terracotta)] px-4 py-2 font-medium text-white shadow-sm transition hover:opacity-90"
          >
            + Novi termin
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
                {/* Vremenska osa. Nevidljivi red iznad MORA da postoji i da bude identičnih
                    klasa kao naslovni red kolona radnika (ime radnika) — inače osa "isklizne"
                    naviše za visinu tog reda i sati se ne poklapaju sa linijama u kolonama. */}
                <div className="shrink-0" style={{ width: 56 }}>
                  <div
                    className="invisible border-b px-2 py-2 text-center text-sm font-medium"
                    aria-hidden="true"
                  >
                    &nbsp;
                  </div>
                  <div className="relative" style={{ height: gridHeight }}>
                    {hourMarks.map((m) => (
                      <div
                        key={m}
                        className="absolute right-2 -translate-y-1/2 text-xs text-[var(--color-charcoal)]/50"
                        style={{ top: (m - data.gridStartMinutes) * PX_PER_MINUTE + GRID_INSET_PX }}
                      >
                        {formatMinutes(m)}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Kolone radnika */}
                {data.staff.map((s) => (
                  <div key={s.id} className="w-40 shrink-0 border-l border-[var(--color-beige)]">
                    <div className="border-b border-[var(--color-beige)] bg-[var(--color-cream)] px-2 py-2 text-center text-sm font-medium">
                      {s.full_name}
                    </div>
                    <div
                      className="relative cursor-pointer"
                      style={{ height: gridHeight }}
                      onClick={(e) =>
                        openAtSlot(
                          s.id,
                          e.clientY - e.currentTarget.getBoundingClientRect().top
                        )
                      }
                      title="Klikni za novi termin"
                    >
                      {hourMarks.map((m) => (
                        <div
                          key={m}
                          className="absolute left-0 right-0 border-t border-[var(--color-beige)]/60"
                          style={{ top: (m - data.gridStartMinutes) * PX_PER_MINUTE + GRID_INSET_PX }}
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
                          <BookingBlock
                            key={b.id}
                            booking={b}
                            gridStartMinutes={data.gridStartMinutes}
                            onSelect={() => setSelectedBooking(b)}
                          />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {formMode && (
        <BookingForm
          formData={formData}
          mode={formMode}
          onClose={() => setFormMode(null)}
          onSuccess={reloadCurrent}
        />
      )}

      {selectedBooking && (
        <BookingDetail
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onEdit={() => {
            setFormMode({ kind: "edit", booking: selectedBooking });
            setSelectedBooking(null);
          }}
          onCancelled={() => {
            setSelectedBooking(null);
            reloadCurrent();
          }}
        />
      )}
    </div>
  );
}

function BookingBlock({
  booking,
  gridStartMinutes,
  onSelect,
}: {
  booking: DayCalendar["bookings"][number];
  gridStartMinutes: number;
  onSelect: () => void;
}) {
  const start = minutesInTz(booking.startUtcISO);
  const end = minutesInTz(booking.endUtcISO);
  const top = (start - gridStartMinutes) * PX_PER_MINUTE + GRID_INSET_PX;
  const height = Math.max((end - start) * PX_PER_MINUTE, 20);

  return (
    <div
      className="absolute inset-x-1 cursor-pointer overflow-hidden rounded-md bg-[var(--color-terracotta)] px-2 py-1 text-xs text-white shadow-sm transition hover:brightness-110"
      style={{ top, height }}
      title={`${booking.customerName} · ${booking.customerPhone}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
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

  const top = (start - gridStartMinutes) * PX_PER_MINUTE + GRID_INSET_PX;
  const height = Math.max((end - start) * PX_PER_MINUTE, 16);

  return (
    <div
      className="absolute inset-x-1 flex items-center justify-center rounded-md border border-dashed border-[var(--color-charcoal)]/30 bg-[var(--color-beige)]/70 px-2 py-1 text-center text-xs text-[var(--color-charcoal)]/70"
      style={{ top, height }}
      onClick={(e) => e.stopPropagation()}
    >
      Pauza/Odsustvo
    </div>
  );
}
