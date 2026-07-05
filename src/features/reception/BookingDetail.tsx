"use client";

import { useState } from "react";
import { DateTime } from "luxon";
import type { ReceptionBooking } from "./types";
import { cancelBooking } from "./write-actions";

const TZ = "Europe/Belgrade";

type Props = {
  booking: ReceptionBooking;
  onClose: () => void;
  onEdit: () => void;
  onCancelled: () => void;
};

export function BookingDetail({ booking, onClose, onEdit, onCancelled }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = DateTime.fromISO(booking.startUtcISO).setZone(TZ);
  const end = DateTime.fromISO(booking.endUtcISO).setZone(TZ);

  async function doCancel() {
    setCancelling(true);
    setError(null);
    const res = await cancelBooking(booking.id);
    if (res.ok) {
      onCancelled();
    } else if (res.reason === "unauthorized") {
      setError("Sesija je istekla. Prijavi se ponovo.");
      setCancelling(false);
    } else {
      setError(res.message ?? "Greška pri otkazivanju.");
      setCancelling(false);
    }
  }

  return (
    <div
      className="animate-backdrop fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="animate-slide-up w-full max-w-sm rounded-2xl bg-[var(--color-cream)] p-6 shadow-[var(--shadow-lg)] ring-1 ring-[var(--color-beige)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 font-[family-name:var(--font-serif)] text-2xl font-semibold">
          {booking.customerName}
        </h2>

        <div className="mb-5 flex flex-col gap-1 text-sm text-[var(--color-charcoal)]/80">
          <div>{booking.serviceName}</div>
          <div>
            {start.setLocale("sr-Latn").toFormat("dd.MM.yyyy.")} u {start.toFormat("HH:mm")}–
            {end.toFormat("HH:mm")}
          </div>
          {booking.customerPhone && <div>{booking.customerPhone}</div>}
          {booking.note && <div className="italic">„{booking.note}”</div>}
        </div>

        {error && (
          <p className="mb-4 rounded-xl bg-[#fdece8] px-4 py-3 text-sm text-[var(--color-terracotta)]">
            {error}
          </p>
        )}

        {!confirming ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="btn-press w-full rounded-xl bg-[var(--color-terracotta)] px-6 py-2.5 font-medium text-white shadow-[var(--shadow-sm)] hover:opacity-90"
            >
              Izmeni
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="btn-press w-full rounded-xl border border-[var(--color-terracotta)] px-6 py-2.5 font-medium text-[var(--color-terracotta)] hover:bg-[#fdece8]"
            >
              Otkaži termin
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn-press w-full rounded-xl border border-[var(--color-beige)] px-6 py-2.5 font-medium text-[var(--color-charcoal)]/70 hover:bg-[var(--color-beige)]"
            >
              Zatvori
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[var(--color-charcoal)]/80">
              Otkazati termin za {booking.customerName} u {start.toFormat("HH:mm")}?
            </p>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={cancelling}
                className="btn-press rounded-xl border border-[var(--color-beige)] px-6 py-2.5 font-medium hover:bg-[var(--color-beige)] disabled:opacity-50"
              >
                Ne
              </button>
              <button
                type="button"
                onClick={doCancel}
                disabled={cancelling}
                className="btn-press flex-1 rounded-xl bg-[var(--color-terracotta)] px-6 py-2.5 font-medium text-white shadow-[var(--shadow-sm)] hover:opacity-90 disabled:opacity-60"
                style={cancelling ? { animation: "pulseOpacity 1.5s ease-in-out infinite" } : undefined}
              >
                {cancelling ? "Otkazujem…" : "Da, otkaži"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
