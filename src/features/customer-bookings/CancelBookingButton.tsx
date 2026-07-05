"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelMyBooking } from "./actions";

// Dugme "Otkaži" na predstojećem terminu. Traži potvrdu, zove server action, pa
// router.refresh() da server komponenta ponovo pročita termine — otkazani odmah
// sklizne u "prošli/otkazani". Sva prava provera (vlasništvo, status, budućnost)
// je NA SERVERU; ovo je samo UX.
export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function doCancel() {
    setError(null);
    startTransition(async () => {
      const res = await cancelMyBooking(bookingId);
      if (res.ok) {
        setConfirming(false);
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  if (!confirming) {
    return (
      <div className="mt-4">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          className="rounded-xl border border-[var(--color-terracotta)] px-5 py-2 text-sm font-medium text-[var(--color-terracotta)] transition hover:bg-[#fdece8]"
        >
          Otkaži termin
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <p className="text-sm text-[var(--color-charcoal)]/80">
        Da li ste sigurni da želite da otkažete ovaj termin?
      </p>
      {error && (
        <p className="rounded-xl bg-[#fdece8] px-4 py-3 text-sm text-[var(--color-terracotta)]">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={isPending}
          className="rounded-xl border border-[var(--color-beige)] px-5 py-2 text-sm font-medium transition hover:bg-[var(--color-beige)] disabled:opacity-50"
        >
          Ne, zadrži
        </button>
        <button
          type="button"
          onClick={doCancel}
          disabled={isPending}
          className="flex-1 rounded-xl bg-[var(--color-terracotta)] px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
        >
          {isPending ? "Otkazujem…" : "Da, otkaži"}
        </button>
      </div>
    </div>
  );
}
