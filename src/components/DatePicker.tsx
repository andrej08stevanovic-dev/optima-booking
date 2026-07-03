"use client";

import { useRef, useState } from "react";
import { DateTime } from "luxon";
import { useOutsideClick } from "./useOutsideClick";

type Props = {
  value: string; // "" ili "YYYY-MM-DD"
  onChange: (dateStr: string) => void;
  timezone: string;
  minDateISO?: string;
  maxDateISO?: string;
  placeholder?: string;
  // "field": izgleda kao ostala polja forme. "heading": veliki naslov (klikabilan datum u zaglavlju kalendara).
  variant?: "field" | "heading";
  // Override prikaza na dugmetu (npr. sa nazivom dana). Podrazumevano "dd.MM.yyyy.".
  displayText?: string;
};

const WEEKDAY_LABELS = ["Pon", "Uto", "Sre", "Čet", "Pet", "Sub", "Ned"];

function formatDisplay(dateStr: string): string {
  const d = DateTime.fromISO(dateStr);
  return d.isValid ? d.setLocale("sr-Latn").toFormat("dd.MM.yyyy.") : "";
}

export function DatePicker({
  value,
  onChange,
  timezone,
  minDateISO,
  maxDateISO,
  placeholder = "Izaberi datum",
  variant = "field",
  displayText,
}: Props) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() =>
    (value ? DateTime.fromISO(value, { zone: timezone }) : DateTime.now().setZone(timezone)).startOf(
      "month"
    )
  );
  const wrapperRef = useRef<HTMLDivElement>(null);

  useOutsideClick(wrapperRef, open, () => setOpen(false));

  // Kad se popover otvori, skoči na mesec trenutne vrednosti (ne u efektu —
  // menja se u event handler-u da izbegnemo kaskadni render).
  function toggleOpen() {
    setOpen((wasOpen) => {
      const willOpen = !wasOpen;
      if (willOpen) {
        const base = value
          ? DateTime.fromISO(value, { zone: timezone })
          : DateTime.now().setZone(timezone);
        if (base.isValid) setViewMonth(base.startOf("month"));
      }
      return willOpen;
    });
  }

  const todayISO = DateTime.now().setZone(timezone).toISODate()!;

  function isDisabled(dateStr: string) {
    if (minDateISO && dateStr < minDateISO) return true;
    if (maxDateISO && dateStr > maxDateISO) return true;
    return false;
  }

  function pick(dateStr: string) {
    if (isDisabled(dateStr)) return;
    onChange(dateStr);
    setOpen(false);
  }

  function goToday() {
    pick(todayISO);
    setViewMonth(DateTime.now().setZone(timezone).startOf("month"));
  }

  // Mreža: ponedeljak prvi dan. Luxon weekday: 1=pon…7=ned -> offset 0..6.
  const firstOfMonth = viewMonth;
  const leadingBlanks = firstOfMonth.weekday - 1;
  const daysInMonth = firstOfMonth.daysInMonth ?? 30;
  const cells: (string | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => firstOfMonth.plus({ days: i }).toISODate()!),
  ];

  const monthLabel = firstOfMonth.setLocale("sr-Latn").toFormat("LLLL yyyy.");

  const triggerClassName =
    variant === "heading"
      ? "inline-flex items-center gap-2 font-[family-name:var(--font-serif)] text-2xl font-semibold capitalize sm:text-3xl text-left transition hover:text-[var(--color-terracotta)]"
      : "w-full rounded-xl border border-[var(--color-beige)] bg-white px-4 py-2.5 text-left text-[var(--color-charcoal)] outline-none transition focus:ring-2 focus:ring-[var(--color-terracotta)]";

  return (
    <div className="relative" ref={wrapperRef}>
      <button type="button" onClick={toggleOpen} className={triggerClassName}>
        {/* Diskretna ikonica SAMO na naslovu — signalizira da je datum klikabilan
            (bez nje se to ne vidi, tekst izgleda kao obična statična oznaka). */}
        {variant === "heading" && (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-[var(--color-terracotta)]/70"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <line x1="8" y1="3" x2="8" y2="7" />
            <line x1="16" y1="3" x2="16" y2="7" />
          </svg>
        )}
        {value ? (
          (displayText ?? formatDisplay(value))
        ) : (
          <span className="text-[var(--color-charcoal)]/50">{placeholder}</span>
        )}
      </button>

      {open && (
        <div className="absolute z-20 mt-2 w-72 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-[var(--color-beige)]">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth((m) => m.minus({ months: 1 }))}
              className="rounded-lg px-2 py-1 text-[var(--color-charcoal)]/60 transition hover:bg-[var(--color-beige)]"
              aria-label="Prethodni mesec"
            >
              ‹
            </button>
            <span className="font-medium capitalize">{monthLabel}</span>
            <button
              type="button"
              onClick={() => setViewMonth((m) => m.plus({ months: 1 }))}
              className="rounded-lg px-2 py-1 text-[var(--color-charcoal)]/60 transition hover:bg-[var(--color-beige)]"
              aria-label="Sledeći mesec"
            >
              ›
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-[var(--color-charcoal)]/50">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((dateStr, i) => {
              if (!dateStr) return <span key={`blank-${i}`} />;
              const disabled = isDisabled(dateStr);
              const isSelected = dateStr === value;
              const isToday = dateStr === todayISO;
              const dayNum = DateTime.fromISO(dateStr).day;
              return (
                <button
                  key={dateStr}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(dateStr)}
                  className={`aspect-square rounded-lg text-sm transition ${
                    isSelected
                      ? "bg-[var(--color-terracotta)] font-medium text-white"
                      : disabled
                        ? "text-[var(--color-charcoal)]/25"
                        : isToday
                          ? "ring-1 ring-[var(--color-terracotta)] hover:bg-[var(--color-beige)]"
                          : "hover:bg-[var(--color-beige)]"
                  }`}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={goToday}
            disabled={isDisabled(todayISO)}
            className="mt-3 w-full rounded-lg py-1.5 text-center text-sm font-medium text-[var(--color-terracotta)] transition hover:bg-[var(--color-beige)] disabled:opacity-40"
          >
            Danas
          </button>
        </div>
      )}
    </div>
  );
}
