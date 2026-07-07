"use client";

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { DatePicker } from "@/components/DatePicker";
import { TimePicker } from "@/components/TimePicker";
import type { DayCalendar, ReceptionBooking, ReceptionFormData, ReceptionSource } from "./types";
import { createReceptionBooking, updateReceptionBooking } from "./write-actions";
import { getDayCalendar } from "./actions";

const TZ = "Europe/Belgrade";

export type FormMode =
  | {
      kind: "create";
      source: ReceptionSource;
      staffId?: string;
      dateStr?: string;
      timeStr?: string;
    }
  | { kind: "edit"; booking: ReceptionBooking };

type Props = {
  formData: ReceptionFormData;
  mode: FormMode;
  currentDayCalendar: DayCalendar;
  onClose: () => void;
  onSuccess: () => void; // parent refetch
};

const inputBase =
  "w-full rounded-xl border border-[var(--color-beige)] bg-white/60 px-4 py-2.5 text-base text-[var(--color-charcoal)] outline-none transition focus:border-[var(--color-terracotta)] focus:ring-[3px] focus:ring-[var(--color-terracotta)]/15";
const labelBase = "mb-1 block text-sm text-[var(--color-charcoal)]/70";

export function BookingForm({ formData, mode, currentDayCalendar, onClose, onSuccess }: Props) {
  const isEdit = mode.kind === "edit";
  const editBooking = isEdit ? mode.booking : null;
  const editStart = editBooking ? DateTime.fromISO(editBooking.startUtcISO).setZone(TZ) : null;

  const [staffId, setStaffId] = useState(
    isEdit ? mode.booking.staffId : (mode.staffId ?? "")
  );
  const [serviceId, setServiceId] = useState(isEdit ? mode.booking.serviceId : "");
  const [dateStr, setDateStr] = useState(
    isEdit ? editStart!.toISODate()! : (mode.dateStr ?? "")
  );
  const [timeStr, setTimeStr] = useState(
    isEdit ? editStart!.toFormat("HH:mm") : (mode.timeStr ?? "")
  );
  const [fullName, setFullName] = useState(isEdit ? mode.booking.customerName : "");
  const [phone, setPhone] = useState(isEdit ? mode.booking.customerPhone : "");
  const [note, setNote] = useState(isEdit ? (mode.booking.note ?? "") : "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // States for checking available slots
  const [dayData, setDayData] = useState<DayCalendar | null>(() => {
    const initialDate = isEdit ? editStart!.toISODate()! : (mode.dateStr ?? "");
    if (currentDayCalendar && currentDayCalendar.dateStr === initialDate) {
      return currentDayCalendar;
    }
    return null;
  });
  const [showAllTimes, setShowAllTimes] = useState(false);

  // Fetch day calendar data if the selected date changes to something else
  useEffect(() => {
    if (!dateStr) return;
    if (currentDayCalendar && currentDayCalendar.dateStr === dateStr) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDayData(currentDayCalendar);
      return;
    }
    let cancelled = false;
    getDayCalendar(dateStr).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setDayData(res.data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dateStr, currentDayCalendar]);

  const selectedService = useMemo(() => {
    return formData.services.find((s) => s.id === serviceId);
  }, [serviceId, formData.services]);
  const duration = selectedService?.duration_minutes ?? 0;

  const busyIntervals = useMemo(() => {
    if (!dayData || !staffId) return [];

    const bookings = dayData.bookings.filter((b) => {
      if (isEdit && editBooking && b.id === editBooking.id) return false;
      return b.staffId === staffId;
    });

    const timeOff = dayData.timeOff.filter((t) => t.staffId === staffId);

    return [
      ...bookings.map((b) => ({ startUtcISO: b.startUtcISO, endUtcISO: b.endUtcISO })),
      ...timeOff.map((t) => ({ startUtcISO: t.startUtcISO, endUtcISO: t.endUtcISO })),
    ];
  }, [dayData, staffId, isEdit, editBooking]);

  const isSlotDisabled = (time: string) => {
    if (showAllTimes) return false;
    if (!duration) return false;

    const candStart = DateTime.fromISO(`${dateStr}T${time}`, { zone: TZ });
    if (!candStart.isValid) return false;
    const candEnd = candStart.plus({ minutes: duration });

    const startMs = candStart.toMillis();
    const endMs = candEnd.toMillis();

    for (const b of busyIntervals) {
      const bStart = DateTime.fromISO(b.startUtcISO).toMillis();
      const bEnd = DateTime.fromISO(b.endUtcISO).toMillis();
      if (startMs < bEnd && bStart < endMs) {
        return true;
      }
    }
    return false;
  };

  const isWalkIn = !isEdit && mode.source === "walk_in";
  const title = isEdit ? "Izmeni termin" : isWalkIn ? "Walk-in termin" : "Novi termin";

  // Usluge koje IZABRANI radnik radi (staff_services). UI filter; server ponovo proverava.
  const availableServices = useMemo(() => {
    if (!staffId) return [];
    const ids = new Set(
      formData.links.filter((l) => l.staff_id === staffId).map((l) => l.service_id)
    );
    return formData.services.filter((s) => ids.has(s.id));
  }, [staffId, formData]);

  function onStaffChange(id: string) {
    setStaffId(id);
    // Ako izabrana usluga više nije u ponudi za novog radnika, resetuj.
    const ids = new Set(
      formData.links.filter((l) => l.staff_id === id).map((l) => l.service_id)
    );
    if (serviceId && !ids.has(serviceId)) setServiceId("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!staffId) return setError("Izaberi radnika.");
    if (!serviceId) return setError("Izaberi uslugu.");
    if (!dateStr) return setError("Izaberi datum.");
    if (!timeStr) return setError("Izaberi vreme.");
    if (!fullName.trim()) return setError("Unesi ime mušterije.");

    setSubmitting(true);
    try {
      const res = isEdit
        ? await updateReceptionBooking({
            bookingId: mode.booking.id,
            staffId,
            serviceId,
            dateStr,
            timeStr,
            fullName: fullName.trim(),
            phone: phone.trim() || undefined,
            note: note.trim() || undefined,
          })
        : await createReceptionBooking({
            staffId,
            serviceId,
            dateStr,
            timeStr,
            fullName: fullName.trim(),
            phone: phone.trim() || undefined,
            note: note.trim() || undefined,
            source: mode.source,
          });

      if (res.ok) {
        onSuccess();
        onClose();
      } else if (res.reason === "taken") {
        setError("Radnik je u to vreme zauzet. Izaberi drugo vreme.");
        onSuccess(); // osveži kalendar da recepcija vidi zašto
      } else if (res.reason === "unauthorized") {
        setError("Sesija je istekla. Prijavi se ponovo.");
      } else {
        setError(res.message ?? "Greška pri upisu.");
      }
    } catch {
      setError("Došlo je do greške. Pokušaj ponovo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="animate-backdrop fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="animate-slide-up w-full max-w-md rounded-2xl bg-[var(--color-cream)] p-6 shadow-[var(--shadow-lg)] ring-1 ring-[var(--color-beige)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-5 font-[family-name:var(--font-serif)] text-2xl font-semibold">
          {title}
        </h2>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <label className={labelBase}>
              Radnik <span className="text-[var(--color-terracotta)]">*</span>
            </label>
            <select
              value={staffId}
              onChange={(e) => onStaffChange(e.target.value)}
              className={inputBase}
            >
              <option value="">— izaberi —</option>
              {formData.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                  {s.is_active ? "" : " (neaktivan)"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelBase}>
              Usluga <span className="text-[var(--color-terracotta)]">*</span>
            </label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              disabled={!staffId}
              className={`${inputBase} disabled:opacity-50`}
            >
              <option value="">
                {staffId ? "— izaberi —" : "prvo izaberi radnika"}
              </option>
              {availableServices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.duration_minutes} min
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelBase}>
                Datum <span className="text-[var(--color-terracotta)]">*</span>
              </label>
              <DatePicker value={dateStr} onChange={setDateStr} timezone={TZ} />
            </div>
            <div className="w-32">
              <label className={labelBase}>
                Vreme <span className="text-[var(--color-terracotta)]">*</span>
              </label>
              <TimePicker
                value={timeStr}
                onChange={setTimeStr}
                isSlotDisabled={isSlotDisabled}
              />
            </div>
          </div>

          {/* Override checkbox */}
          {duration > 0 && staffId && (
            <div className="flex items-center justify-end -mt-1">
              <label className="flex items-center gap-2 text-xs text-[var(--color-charcoal)]/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAllTimes}
                  onChange={(e) => setShowAllTimes(e.target.checked)}
                  className="rounded border-[var(--color-beige)] text-[var(--color-terracotta)] focus:ring-[var(--color-terracotta)]/20"
                />
                Prikaži sve slotove (dozvoli preklapanje)
              </label>
            </div>
          )}

          <div>
            <label className={labelBase}>
              Ime mušterije <span className="text-[var(--color-terracotta)]">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="npr. Jovana Petrović"
              className={inputBase}
            />
          </div>

          <div>
            <label className={labelBase}>Telefon (opciono)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="npr. 064 123 4567"
              className={inputBase}
            />
          </div>

          <div>
            <label className={labelBase}>Napomena (opciono)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="npr. bojenje, duže traje"
              className={inputBase}
            />
          </div>

          {error && (
            <p className="rounded-xl bg-[#fdece8] px-4 py-3 text-sm text-[var(--color-terracotta)]">
              {error}
            </p>
          )}

          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-press rounded-xl border border-[var(--color-beige)] px-6 py-2.5 font-medium hover:bg-[var(--color-beige)] disabled:opacity-50"
            >
              Zatvori
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-press flex-1 rounded-xl bg-[var(--color-terracotta)] px-6 py-2.5 font-medium text-white shadow-[var(--shadow-sm)] hover:opacity-90 disabled:opacity-60"
              style={submitting ? { animation: "pulseOpacity 1.5s ease-in-out infinite" } : undefined}
            >
              {submitting ? "Čuvam…" : isEdit ? "Sačuvaj izmene" : "Zakaži"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
