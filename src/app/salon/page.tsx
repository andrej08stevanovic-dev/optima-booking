import Link from "next/link";
import { supabase } from "@/lib/supabase";

// Uvek čitaj sveže iz baze (ne keširaj na build-u).
export const dynamic = "force-dynamic";

type ServiceLite = { id: string; name: string; category: string };
type StaffRow = {
  id: string;
  full_name: string;
  staff_services: { services: ServiceLite | null }[];
};
type Service = {
  id: string;
  name: string;
  category: "kosa" | "nokti";
  duration_minutes: number;
  price: number;
};

function formatPrice(price: number) {
  return `${Number(price).toLocaleString("sr-RS")} din`;
}

export default async function SalonPage() {
  const [staffRes, servicesRes] = await Promise.all([
    supabase
      .from("staff")
      .select("id, full_name, staff_services(services(id, name, category))")
      .eq("is_active", true)
      .order("full_name"),
    supabase
      .from("services")
      .select("id, name, category, duration_minutes, price")
      .eq("is_active", true)
      .order("category")
      .order("name"),
  ]);

  // Greška ka bazi — nikad beli ekran.
  if (staffRes.error || servicesRes.error) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
        <div className="max-w-md">
          <h1 className="mb-3 font-[family-name:var(--font-serif)] text-3xl font-semibold">
            Greška pri učitavanju
          </h1>
          <p className="text-[var(--color-charcoal)]/80">
            Trenutno ne možemo da učitamo podatke salona. Pokušaj ponovo malo
            kasnije.
          </p>
        </div>
      </main>
    );
  }

  // supabase-js zaključi embedovani `services` kao niz; runtime je objekat
  // (many-to-one preko FK), pa castujemo kroz unknown.
  const staff = (staffRes.data ?? []) as unknown as StaffRow[];
  const services = (servicesRes.data ?? []) as unknown as Service[];
  const kosa = services.filter((s) => s.category === "kosa");
  const nokti = services.filter((s) => s.category === "nokti");

  const isEmpty = staff.length === 0 && services.length === 0;

  return (
    <main className="min-h-dvh px-6 py-12">
      <div className="mx-auto w-full max-w-2xl">
        {/* Zaglavlje */}
        <header className="mb-10 text-center">
          <span className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--color-terracotta)]">
            Frizerski salon · Vranje
          </span>
          <h1 className="mt-2 font-[family-name:var(--font-serif)] text-4xl font-semibold sm:text-5xl">
            Optima
          </h1>
          <p className="mt-2 text-[var(--color-charcoal)]/70">
            Naš tim i usluge
          </p>
          <Link
            href="/zakazivanje"
            className="mt-5 inline-block rounded-xl bg-[var(--color-terracotta)] px-6 py-3 font-medium text-white shadow-sm transition hover:opacity-90"
          >
            Zakaži termin
          </Link>
        </header>

        {isEmpty ? (
          <p className="rounded-xl bg-[var(--color-beige)] px-5 py-6 text-center text-[var(--color-charcoal)]/80">
            Još nema unetih podataka o timu i uslugama.
          </p>
        ) : (
          <div className="flex flex-col gap-12">
            {/* Tim */}
            <section>
              <h2 className="mb-4 font-[family-name:var(--font-serif)] text-2xl font-semibold">
                Naš tim
              </h2>
              <div className="flex flex-col gap-4">
                {staff.map((member) => {
                  const usluge = member.staff_services
                    .map((ss) => ss.services?.name)
                    .filter((n): n is string => Boolean(n));
                  return (
                    <div
                      key={member.id}
                      className="rounded-xl bg-white/60 p-5 shadow-sm ring-1 ring-[var(--color-beige)]"
                    >
                      <h3 className="text-lg font-semibold">
                        {member.full_name}
                      </h3>
                      {usluge.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {usluge.map((u) => (
                            <span
                              key={u}
                              className="rounded-full bg-[var(--color-beige)] px-3 py-1 text-sm text-[var(--color-charcoal)]/80"
                            >
                              {u}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-[var(--color-charcoal)]/60">
                          Još nema dodeljenih usluga.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Usluge po kategoriji */}
            <section>
              <h2 className="mb-4 font-[family-name:var(--font-serif)] text-2xl font-semibold">
                Usluge
              </h2>
              <div className="flex flex-col gap-8">
                <ServiceGroup title="Kosa" items={kosa} />
                <ServiceGroup title="Nokti" items={nokti} />
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function ServiceGroup({ title, items }: { title: string; items: Service[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-3 text-sm font-medium uppercase tracking-[0.15em] text-[var(--color-terracotta)]">
        {title}
      </h3>
      <ul className="overflow-hidden rounded-xl ring-1 ring-[var(--color-beige)]">
        {items.map((s, i) => (
          <li
            key={s.id}
            className={`flex items-center justify-between gap-4 bg-white/60 px-5 py-4 ${
              i > 0 ? "border-t border-[var(--color-beige)]" : ""
            }`}
          >
            <div>
              <p className="font-medium">{s.name}</p>
              <p className="text-sm text-[var(--color-charcoal)]/60">
                {s.duration_minutes} min
              </p>
            </div>
            <span className="shrink-0 font-medium text-[var(--color-charcoal)]">
              {formatPrice(s.price)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
