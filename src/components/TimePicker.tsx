"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useOutsideClick } from "./useOutsideClick";

type Props = {
  value: string; // "" ili "HH:mm"
  onChange: (timeStr: string) => void;
  startMinutes?: number; // podrazumevano 07:00
  endMinutes?: number; // podrazumevano 22:00
  stepMinutes?: number; // podrazumevano 15
  placeholder?: string;
};

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function TimePicker({
  value,
  onChange,
  startMinutes = 7 * 60,
  endMinutes = 22 * 60,
  stepMinutes = 15,
  placeholder = "Izaberi vreme",
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useOutsideClick(wrapperRef, open, () => setOpen(false));

  useEffect(() => {
    if (open) selectedRef.current?.scrollIntoView({ block: "center" });
  }, [open]);

  const options = useMemo(() => {
    const list: string[] = [];
    for (let m = startMinutes; m <= endMinutes; m += stepMinutes) {
      list.push(formatMinutes(m));
    }
    return list;
  }, [startMinutes, endMinutes, stepMinutes]);

  function pick(t: string) {
    onChange(t);
    setOpen(false);
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded-xl border border-[var(--color-beige)] bg-white px-4 py-2.5 text-left text-[var(--color-charcoal)] outline-none transition focus:ring-2 focus:ring-[var(--color-terracotta)]"
      >
        {value || <span className="text-[var(--color-charcoal)]/50">{placeholder}</span>}
      </button>

      {open && (
        <div className="absolute z-20 mt-2 max-h-64 w-40 overflow-y-auto rounded-2xl bg-white p-2 shadow-xl ring-1 ring-[var(--color-beige)]">
          <div className="grid grid-cols-2 gap-1">
            {options.map((t) => {
              const isSelected = t === value;
              return (
                <button
                  key={t}
                  ref={isSelected ? selectedRef : undefined}
                  type="button"
                  onClick={() => pick(t)}
                  className={`rounded-lg px-2 py-1.5 text-center text-sm transition ${
                    isSelected
                      ? "bg-[var(--color-terracotta)] font-medium text-white"
                      : "hover:bg-[var(--color-beige)]"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
