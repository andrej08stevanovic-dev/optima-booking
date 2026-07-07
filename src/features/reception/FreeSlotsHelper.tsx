"use client";

import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import type { DayCalendar, ReceptionFormData } from "./types";

const TZ = "Europe/Belgrade";

type Props = {
  dayCalendar: DayCalendar;
  formData: ReceptionFormData;
  onSelectSlot: (staffId: string, timeStr: string, dateStr: string) => void;
};

function minutesInTz(utcISO: string): number {
  const dt = DateTime.fromISO(utcISO).setZone(TZ);
  return dt.hour * 60 + dt.minute;
}

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function FreeSlotsHelper({ dayCalendar, formData, onSelectSlot }: Props) {
  const [selectedStaffId, setSelectedStaffId] = useState<string>("all");
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");

  // Get selected service details (to check duration)
  const selectedService = useMemo(() => {
    return formData.services.find((s) => s.id === selectedServiceId);
  }, [selectedServiceId, formData.services]);

  const serviceDuration = selectedService?.duration_minutes ?? 0;

  // Filter staff to display
  const staffToDisplay = useMemo(() => {
    if (selectedStaffId === "all") {
      return dayCalendar.staff;
    }
    return dayCalendar.staff.filter((s) => s.id === selectedStaffId);
  }, [selectedStaffId, dayCalendar.staff]);

  // Calculate free blocks for each staff member
  const staffFreeBlocks = useMemo(() => {
    const map = new Map<string, { start: number; end: number; duration: number }[]>();
    
    for (const s of dayCalendar.staff) {
      const bookings = dayCalendar.bookings.filter((b) => b.staffId === s.id);
      const timeOff = dayCalendar.timeOff.filter((t) => t.staffId === s.id);

      const busy = [
        ...bookings.map((b) => ({
          start: minutesInTz(b.startUtcISO),
          end: minutesInTz(b.endUtcISO),
        })),
        ...timeOff.map((t) => {
          const rawStart = DateTime.fromISO(t.startUtcISO).setZone(TZ);
          const rawEnd = DateTime.fromISO(t.endUtcISO).setZone(TZ);
          const dayStart = DateTime.fromISO(dayCalendar.dateStr, { zone: TZ }).startOf("day");
          const dayEnd = dayStart.plus({ days: 1 });
          const clampedStart = rawStart < dayStart ? dayStart : rawStart;
          const clampedEnd = rawEnd > dayEnd ? dayEnd : rawEnd;
          return {
            start: clampedStart.hour * 60 + clampedStart.minute,
            end: clampedEnd.hour * 60 + clampedEnd.minute,
          };
        }),
      ].filter((b) => b.start < b.end);

      busy.sort((a, b) => a.start - b.start);

      const free: { start: number; end: number; duration: number }[] = [];
      let current = dayCalendar.gridStartMinutes;

      for (const b of busy) {
        if (b.start <= current) {
          current = Math.max(current, b.end);
          continue;
        }
        const gap = b.start - current;
        if (gap >= 15) {
          free.push({ start: current, end: b.start, duration: gap });
        }
        current = Math.max(current, b.end);
      }

      if (dayCalendar.gridEndMinutes - current >= 15) {
        free.push({
          start: current,
          end: dayCalendar.gridEndMinutes,
          duration: dayCalendar.gridEndMinutes - current,
        });
      }

      map.set(s.id, free);
    }

    return map;
  }, [dayCalendar]);

  // Generate starting slot suggestions based on block size and service duration
  const getSuggestions = (start: number, end: number, duration: number) => {
    const suggestions: number[] = [];
    const step = 15; // default step
    let cand = start;
    while (cand + duration <= end) {
      suggestions.push(cand);
      cand += step;
    }
    return suggestions;
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-white/60 p-5 ring-1 ring-[var(--color-beige)] shadow-[var(--shadow-sm)] backdrop-blur-md">
      <div>
        <h3 className="font-[family-name:var(--font-serif)] text-lg font-semibold flex items-center gap-2 text-[var(--color-charcoal)]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5 text-[var(--color-terracotta)]"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
          Pomoćnik za termine
        </h3>
        <p className="text-xs text-[var(--color-charcoal)]/60 mt-0.5">
          Pregled slobodnog vremena za telefonske upite
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2.5 border-t border-[var(--color-beige)]/40 pt-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-charcoal)]/70">Usluga</label>
          <select
            value={selectedServiceId}
            onChange={(e) => setSelectedServiceId(e.target.value)}
            className="w-full rounded-xl border border-[var(--color-beige)] bg-white/80 px-3 py-2 text-sm outline-none transition focus:border-[var(--color-terracotta)]"
          >
            <option value="">— izaberi uslugu za proveru —</option>
            {formData.services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.duration_minutes} min
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-charcoal)]/70">Radnik</label>
          <select
            value={selectedStaffId}
            onChange={(e) => setSelectedStaffId(e.target.value)}
            className="w-full rounded-xl border border-[var(--color-beige)] bg-white/80 px-3 py-2 text-sm outline-none transition focus:border-[var(--color-terracotta)]"
          >
            <option value="all">Svi radnici</option>
            {dayCalendar.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results List */}
      <div className="flex flex-col gap-3.5 overflow-y-auto max-h-[350px] pr-1 mt-1 border-t border-[var(--color-beige)]/40 pt-3">
        {staffToDisplay.map((s) => {
          const blocks = staffFreeBlocks.get(s.id) ?? [];
          
          // Filter blocks if a service is selected
          const filteredBlocks = serviceDuration
            ? blocks.filter((b) => b.duration >= serviceDuration)
            : blocks;

          return (
            <div key={s.id} className="flex flex-col gap-1.5">
              <div className="text-xs font-semibold text-[var(--color-charcoal)]/80 flex items-center justify-between">
                <span>{s.full_name}</span>
                {filteredBlocks.length === 0 && (
                  <span className="text-[10px] text-[var(--color-terracotta)] bg-[#fdece8] px-1.5 py-0.5 rounded-full font-normal">
                    Nema termina
                  </span>
                )}
              </div>

              {filteredBlocks.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {filteredBlocks.map((b, idx) => {
                    const startLabel = formatMinutes(b.start);
                    const endLabel = formatMinutes(b.end);
                    const durationLabel = formatDuration(b.duration);
                    
                    const suggestions = serviceDuration
                      ? getSuggestions(b.start, b.end, serviceDuration)
                      : [];

                    return (
                      <div
                        key={idx}
                        className="rounded-xl border border-[var(--color-beige)] bg-white/40 p-2.5 hover:bg-white/70 transition-all duration-200"
                      >
                        <div className="flex justify-between items-center text-xs text-[var(--color-charcoal)]">
                          <span className="font-semibold tabular-nums">
                            {startLabel} – {endLabel}
                          </span>
                          <span className="text-[var(--color-charcoal)]/50 text-[10px]">
                            {durationLabel} slobodno
                          </span>
                        </div>

                        {/* Suggestions */}
                        {suggestions.length > 0 && (
                          <div className="mt-2">
                            <div className="text-[10px] text-[var(--color-charcoal)]/40 mb-1">
                              Predloženi počeci ({suggestions.length}):
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {suggestions.slice(0, 5).map((sug) => {
                                const timeStr = formatMinutes(sug);
                                return (
                                  <button
                                    key={sug}
                                    type="button"
                                    onClick={() => onSelectSlot(s.id, timeStr, dayCalendar.dateStr)}
                                    className="rounded-full bg-[var(--color-terracotta)]/5 hover:bg-[var(--color-terracotta)] hover:text-white px-2 py-0.5 text-[10px] tabular-nums font-medium text-[var(--color-terracotta)] transition cursor-pointer"
                                    title="Zakaži u ovo vreme"
                                  >
                                    {timeStr}
                                  </button>
                                );
                              })}
                              {suggestions.length > 5 && (
                                <span className="text-[9px] text-[var(--color-charcoal)]/40 self-center ml-0.5">
                                  +{suggestions.length - 5} još
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* General booking button if no service is selected */}
                        {suggestions.length === 0 && (
                          <button
                            type="button"
                            onClick={() => onSelectSlot(s.id, startLabel, dayCalendar.dateStr)}
                            className="mt-2 w-full text-center text-[10px] text-[var(--color-terracotta)] font-medium hover:underline flex justify-center items-center gap-0.5 cursor-pointer"
                          >
                            Započni unos u {startLabel}
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                              className="w-3 h-3"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[10px] text-[var(--color-charcoal)]/40 italic pl-1 py-1">
                  Nema slobodnih blokova {serviceDuration > 0 ? "dovoljne dužine" : ""}.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
