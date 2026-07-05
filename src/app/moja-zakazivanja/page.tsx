import { redirect } from "next/navigation";
import Link from "next/link";
import { DateTime } from "luxon";
import { SiteHeader } from "@/components/SiteHeader";
import { getCustomerEmail } from "@/lib/customer-guard";
import { loadMyBookings } from "@/features/customer-bookings/data";
import { signOutCustomer } from "@/features/customer-auth/actions";
import { CancelBookingButton } from "@/features/customer-bookings/CancelBookingButton";
import type { MyBooking } from "@/features/customer-bookings/types";

// Uvek sveže — termini se menjaju (otkazivanje u Koraku B), ne keširaj na build-u.
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<MyBooking["status"], string> = {
  booked: "Zakazano",
  confirmed: "Potvrđeno",
  done: "Završeno",
  cancelled: "Otkazano",
  no_show: "Nije se pojavio/la",
};

export default async function MojaZakazivanjaPage() {
  const email = await getCustomerEmail();
  if (!email) redirect("/prijava");

  let tz: string;
  let bookings: MyBooking[];
  try {
    const data = await loadMyBookings(email);
    tz = data.tz;
    bookings = data.bookings;
  } catch {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="max-w-md">
          <h1 className="mb-3 font-[family-name:var(--font-serif)] text-3xl font-semibold">
            Greška pri učitavanju
          </h1>
          <p className="text-[var(--color-charcoal)]/80">
            Trenutno ne možemo da učitamo vaše termine. Pokušajte ponovo malo
            kasnije.
          </p>
        </div>
      </main>
    );
  }

  const now = DateTime.now().setZone(tz);
  const upcoming = bookings
    .filter(
      (b) =>
        (b.status === "booked" || b.status === "confirmed") &&
        DateTime.fromISO(b.startUtcISO).setZone(tz) >= now
    )
    .sort((a, b) => a.startUtcISO.localeCompare(b.startUtcISO));
  const upcomingIds = new Set(upcoming.map((b) => b.id));
  // Ostatak je već opadajuće sortiran (order by starts_at desc iz loadMyBookings).
  const past = bookings.filter((b) => !upcomingIds.has(b.id));

  return (
    <>
      <SiteHeader />
      <main className="px-4 py-10 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-serif)] text-3xl font-semibold sm:text-4xl">
              Moja zakazivanja
            </h1>
            <p className="mt-1 text-sm text-[var(--color-charcoal)]/70">{email}</p>
          </div>
          <form action={signOutCustomer}>
            <button
              type="submit"
              className="shrink-0 rounded-xl px-4 py-2 text-sm font-medium text-[var(--color-charcoal)]/70 ring-1 ring-[var(--color-beige)] transition hover:bg-white/60"
            >
              Odjava
            </button>
          </form>
        </header>

        {bookings.length === 0 ? (
          <div className="rounded-xl bg-[var(--color-beige)] px-5 py-8 text-center">
            <p className="text-[var(--color-charcoal)]/80">
              Nemate zakazanih termina.
            </p>
            <Link
              href="/zakazivanje"
              className="mt-4 inline-block rounded-xl bg-[var(--color-terracotta)] px-6 py-3 font-medium text-white shadow-sm transition hover:opacity-90"
            >
              Zakaži termin
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            <section>
              <h2 className="mb-4 font-[family-name:var(--font-serif)] text-2xl font-semibold">
                Predstojeći termini
              </h2>
              {upcoming.length === 0 ? (
                <p className="text-sm text-[var(--color-charcoal)]/60">
                  Nemate predstojećih termina.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {upcoming.map((b) => (
                    <BookingCard key={b.id} booking={b} tz={tz} cancellable />
                  ))}
                </div>
              )}
            </section>

            {past.length > 0 && (
              <section>
                <h2 className="mb-4 font-[family-name:var(--font-serif)] text-2xl font-semibold">
                  Prošli i otkazani termini
                </h2>
                <div className="flex flex-col gap-3">
                  {past.map((b) => (
                    <BookingCard key={b.id} booking={b} tz={tz} muted />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
      </main>
    </>
  );
}

function BookingCard({
  booking,
  tz,
  muted,
  cancellable,
}: {
  booking: MyBooking;
  tz: string;
  muted?: boolean;
  cancellable?: boolean;
}) {
  const start = DateTime.fromISO(booking.startUtcISO).setZone(tz);
  const end = DateTime.fromISO(booking.endUtcISO).setZone(tz);

  return (
    <div
      className={`rounded-xl bg-white/60 p-5 shadow-sm ring-1 ring-[var(--color-beige)] ${
        muted ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">{booking.serviceName}</p>
          <p className="text-sm text-[var(--color-charcoal)]/60">
            {booking.staffName}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--color-beige)] px-3 py-1 text-xs font-medium text-[var(--color-charcoal)]/80">
          {STATUS_LABELS[booking.status]}
        </span>
      </div>
      <p className="mt-3 text-sm text-[var(--color-charcoal)]/80">
        {start.setLocale("sr-Latn").toFormat("dd.MM.yyyy.")} u{" "}
        {start.toFormat("HH:mm")}–{end.toFormat("HH:mm")}
      </p>
      {cancellable && <CancelBookingButton bookingId={booking.id} />}
    </div>
  );
}
