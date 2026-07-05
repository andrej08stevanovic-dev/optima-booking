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
type WorkingHoursRow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

const DAY_NAMES: Record<number, string> = {
  0: "Nedelja",
  1: "Ponedeljak",
  2: "Utorak",
  3: "Sreda",
  4: "Četvrtak",
  5: "Petak",
  6: "Subota",
};

// Prikazni redosled: ponedeljak prvi, nedelja poslednja (naša konvencija u bazi
// je 0=nedelja…6=subota, ovo je samo redosled ZA PRIKAZ).
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function formatTime(t: string) {
  return t.slice(0, 5); // "09:00:00" -> "09:00"
}

function formatPrice(price: number) {
  return `${Number(price).toLocaleString("sr-RS")} din`;
}

// Spaja smene svih aktivnih radnika u jedno "radno vreme salona" po danu:
// najranija smena kao početak, najkasnija kao kraj tog dana. Dani bez ijednog
// radnika su "Zatvoreno". Susedni dani sa istim rasponom se prikazuju spojeno
// (npr. "Ponedeljak–Petak").
function buildSalonHours(rows: WorkingHoursRow[]) {
  const byDay = new Map<number, { start: string; end: string }>();
  for (const row of rows) {
    const existing = byDay.get(row.day_of_week);
    if (!existing) {
      byDay.set(row.day_of_week, { start: row.start_time, end: row.end_time });
    } else {
      if (row.start_time < existing.start) existing.start = row.start_time;
      if (row.end_time > existing.end) existing.end = row.end_time;
    }
  }

  const dayLabel = (day: number) => {
    const wh = byDay.get(day);
    return wh ? `${formatTime(wh.start)}–${formatTime(wh.end)}` : "Zatvoreno";
  };

  const groups: { start: number; end: number; label: string }[] = [];
  for (const day of DISPLAY_ORDER) {
    const label = dayLabel(day);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.end = day;
    } else {
      groups.push({ start: day, end: day, label });
    }
  }

  return groups.map((g) => ({
    days: g.start === g.end ? DAY_NAMES[g.start] : `${DAY_NAMES[g.start]}–${DAY_NAMES[g.end]}`,
    hours: g.label,
  }));
}

export default async function Home() {
  const [staffRes, servicesRes, whRes] = await Promise.all([
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
    supabase
      .from("working_hours")
      .select("day_of_week, start_time, end_time, staff!inner(is_active)")
      .eq("staff.is_active", true),
  ]);

  // Greška ka bazi — nikad beli ekran.
  if (staffRes.error || servicesRes.error || whRes.error) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
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

  // supabase-js zaključi embedovani `services`/`staff` kao niz; runtime je
  // objekat (many-to-one preko FK), pa castujemo kroz unknown.
  const staff = (staffRes.data ?? []) as unknown as StaffRow[];
  const services = (servicesRes.data ?? []) as unknown as Service[];
  const workingHours = (whRes.data ?? []) as unknown as WorkingHoursRow[];
  const kosa = services.filter((s) => s.category === "kosa");
  const nokti = services.filter((s) => s.category === "nokti");
  const salonHours = buildSalonHours(workingHours);

  const isEmpty = staff.length === 0 && services.length === 0;

  return (
    <main className="px-4 py-10 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        {/* Hero */}
        <header className="mb-10 text-center">
          <span className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--color-terracotta)]">
            Frizerski salon · Vranje
          </span>
          <h1 className="mt-2 font-[family-name:var(--font-serif)] text-5xl font-semibold tracking-[-0.02em] sm:text-6xl">
            Optima
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[var(--color-charcoal)]/70">
            Frizerski salon i studio za nokte, u srcu Vranja.
          </p>

          <div className="mt-6 flex flex-col items-center gap-3">
            <Link
              href="/zakazivanje"
              className="btn-press rounded-xl bg-[var(--color-terracotta)] px-8 py-3.5 font-medium text-white shadow-[var(--shadow-md)] hover:opacity-90"
            >
              Zakaži termin
            </Link>
            <Link
              href="/prijava"
              className="border-b border-transparent text-sm font-medium text-[var(--color-charcoal)]/70 transition hover:border-[var(--color-terracotta)] hover:text-[var(--color-terracotta)]"
            >
              Moji termini
            </Link>
          </div>

          {/* Radno vreme */}
          {workingHours.length === 0 ? (
            <p className="mt-8 rounded-xl bg-[var(--color-beige)] px-5 py-4 text-sm text-[var(--color-charcoal)]/80">
              Radimo po dogovoru — pozovite ili zakažite online.
            </p>
          ) : (
            <div className="mt-8 rounded-2xl bg-white/60 p-5 shadow-[var(--shadow-md)] ring-1 ring-[var(--color-beige)]">
              <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-terracotta)]">
                Radno vreme
              </h2>
              <dl className="flex flex-col gap-1 text-sm">
                {salonHours.map((row) => (
                  <div key={row.days} className="flex items-center justify-between gap-4">
                    <dt className="text-[var(--color-charcoal)]/70">{row.days}</dt>
                    <dd
                      className={
                        row.hours === "Zatvoreno"
                          ? "font-medium text-[#b0574a]"
                          : "font-medium tabular-nums"
                      }
                    >
                      {row.hours}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </header>

        {isEmpty ? (
          <p className="rounded-xl bg-[var(--color-beige)] px-5 py-8 text-center text-[var(--color-charcoal)]/80">
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
                      className="rounded-2xl bg-white/60 p-5 shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-beige)]"
                    >
                      <h3 className="text-lg font-semibold">
                        {member.full_name}
                      </h3>
                      {usluge.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {usluge.map((u) => (
                            <span
                              key={u}
                              className="rounded-full bg-[var(--color-terracotta)]/8 px-3 py-1 text-[13px] text-[var(--color-charcoal)]/80"
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
