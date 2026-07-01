import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { BookingFlow } from "@/features/booking/BookingFlow";
import type { Service, StaffMember } from "@/features/booking/types";

// Uvek sveže iz baze.
export const dynamic = "force-dynamic";

export default async function ZakazivanjePage() {
  const [servicesRes, staffRes, linkRes, settingsRes] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, category, duration_minutes, price")
      .eq("is_active", true)
      .order("category")
      .order("name"),
    supabase
      .from("staff")
      .select("id, full_name")
      .eq("is_active", true)
      .order("full_name"),
    supabase.from("staff_services").select("staff_id, service_id"),
    supabase
      .from("settings")
      .select("timezone, max_horizon_days")
      .eq("id", 1)
      .single(),
  ]);

  if (
    servicesRes.error ||
    staffRes.error ||
    linkRes.error ||
    settingsRes.error
  ) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
        <div className="max-w-md">
          <h1 className="mb-3 font-[family-name:var(--font-serif)] text-3xl font-semibold">
            Greška pri učitavanju
          </h1>
          <p className="text-[var(--color-charcoal)]/80">
            Trenutno ne možemo da učitamo usluge i tim. Pokušaj ponovo malo
            kasnije.
          </p>
        </div>
      </main>
    );
  }

  const services = (servicesRes.data ?? []) as Service[];
  const staff = (staffRes.data ?? []) as StaffMember[];
  const links = (linkRes.data ?? []) as {
    staff_id: string;
    service_id: string;
  }[];
  const settings = settingsRes.data as {
    timezone: string;
    max_horizon_days: number;
  };

  return (
    <main className="min-h-dvh px-6 py-12">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-8 text-center">
          <Link
            href="/salon"
            className="text-sm text-[var(--color-terracotta)] hover:underline"
          >
            ← Tim i usluge
          </Link>
          <h1 className="mt-3 font-[family-name:var(--font-serif)] text-4xl font-semibold sm:text-5xl">
            Zakaži termin
          </h1>
          <p className="mt-2 text-[var(--color-charcoal)]/70">
            Izaberi uslugu, radnika i vreme.
          </p>
        </header>

        <BookingFlow
          services={services}
          staff={staff}
          links={links}
          timezone={settings.timezone}
          maxHorizonDays={settings.max_horizon_days}
        />
      </div>
    </main>
  );
}
