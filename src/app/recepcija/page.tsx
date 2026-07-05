import { DateTime } from "luxon";
import { loadDayCalendar, loadFormData } from "@/features/reception/data";
import { ReceptionCalendar } from "@/features/reception/ReceptionCalendar";

export const dynamic = "force-dynamic";

const TZ = "Europe/Belgrade";

export default async function RecepcijaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const todayISO = DateTime.now().setZone(TZ).toISODate()!;
  const requested = params.date;
  const dateStr =
    requested && DateTime.fromISO(requested, { zone: TZ }).isValid ? requested : todayISO;

  let initialData;
  let formData;
  try {
    [initialData, formData] = await Promise.all([
      loadDayCalendar(dateStr),
      loadFormData(),
    ]);
  } catch {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-[var(--color-charcoal)]/80">
          Trenutno ne možemo da učitamo kalendar. Pokušaj ponovo malo kasnije.
        </p>
      </main>
    );
  }

  return (
    <main className="px-4 py-10 sm:px-6 sm:py-12">
      <ReceptionCalendar
        initialData={initialData}
        todayISO={todayISO}
        formData={formData}
      />
    </main>
  );
}
