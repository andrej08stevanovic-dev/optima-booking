"use client";

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import type { Service, StaffMember } from "./types";
import { createBooking, getAvailableSlots } from "./actions";
import type { Slot } from "./availability";

type Props = {
  services: Service[];
  staff: StaffMember[];
  links: { staff_id: string; service_id: string }[];
  timezone: string;
  maxHorizonDays: number;
};

type Screen = "picker" | "review" | "success";

function formatPrice(price: number) {
  return `${Number(price).toLocaleString("sr-RS")} din`;
}

function formatDuration(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function formatDate(dateStr: string) {
  const d = DateTime.fromISO(dateStr);
  return d.isValid ? d.toFormat("dd.MM.yyyy.") : dateStr;
}

export function BookingFlow({
  services,
  staff,
  links,
  timezone,
  maxHorizonDays,
}: Props) {
  const [screen, setScreen] = useState<Screen>("picker");

  const [service, setService] = useState<Service | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [date, setDate] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Podaci mušterije
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outOfRange, setOutOfRange] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [takenMsg, setTakenMsg] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  // Granice date inputa u beogradskoj zoni (UX; server svejedno reproverava).
  const todayISO = useMemo(
    () => DateTime.now().setZone(timezone).toISODate()!,
    [timezone]
  );
  const maxISO = useMemo(
    () =>
      DateTime.now().setZone(timezone).plus({ days: maxHorizonDays }).toISODate()!,
    [timezone, maxHorizonDays]
  );

  const kosa = services.filter((s) => s.category === "kosa");
  const nokti = services.filter((s) => s.category === "nokti");

  const staffName = staff.find((s) => s.id === staffId)?.full_name ?? "";

  // Radnici koji rade IZABRANU uslugu.
  const availableStaff = useMemo(() => {
    if (!service) return [];
    const ids = new Set(
      links.filter((l) => l.service_id === service.id).map((l) => l.staff_id)
    );
    return staff.filter((s) => ids.has(s.id));
  }, [service, links, staff]);

  // Učitaj termine kad su usluga + radnik + datum izabrani.
  useEffect(() => {
    if (!service || !staffId || !date) return;

    let cancelled = false;
    const serviceId = service.id;

    async function load() {
      setLoading(true);
      setError(null);
      setSelectedSlot(null);
      try {
        const res = await getAvailableSlots(staffId!, serviceId, date);
        if (cancelled) return;
        if (res.ok) {
          setSlots(res.slots);
          setOutOfRange(res.outOfRange);
        } else {
          setSlots([]);
          setError(res.error);
        }
        setLoaded(true);
      } catch {
        if (!cancelled) {
          setError("Došlo je do greške. Pokušaj ponovo.");
          setLoaded(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [service, staffId, date, reloadKey]);

  function chooseService(s: Service) {
    setService(s);
    setStaffId(null);
    setDate("");
    setSlots([]);
    setSelectedSlot(null);
    setLoaded(false);
    setTakenMsg(null);
  }

  function goToReview() {
    setFormError(null);
    if (!fullName.trim()) {
      setFormError("Unesi ime.");
      return;
    }
    if (!phone.trim()) {
      setFormError("Unesi broj telefona.");
      return;
    }
    if (email.trim() && !/.+@.+\..+/.test(email.trim())) {
      setFormError("Email nije ispravan (ili ga ostavi prazan).");
      return;
    }
    setScreen("review");
  }

  async function confirmBooking() {
    if (!service || !staffId || !selectedSlot) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await createBooking({
        staffId,
        serviceId: service.id,
        startUtcISO: selectedSlot.startUtcISO,
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
      });
      if (res.ok) {
        setScreen("success");
      } else if (res.reason === "taken") {
        // Termin je u međuvremenu zauzet — vrati na izbor i osveži listu.
        setTakenMsg("Termin je upravo zauzet, izaberi drugi.");
        setSelectedSlot(null);
        setScreen("picker");
        setReloadKey((k) => k + 1);
      } else {
        setFormError(res.message);
      }
    } catch {
      setFormError("Došlo je do greške. Pokušaj ponovo.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetAll() {
    setScreen("picker");
    setService(null);
    setStaffId(null);
    setDate("");
    setSelectedSlot(null);
    setSlots([]);
    setLoaded(false);
    setFullName("");
    setPhone("");
    setEmail("");
    setFormError(null);
    setTakenMsg(null);
  }

  const cardBase =
    "w-full rounded-xl bg-white/60 p-4 text-left shadow-sm ring-1 ring-[var(--color-beige)] transition hover:ring-[var(--color-terracotta)]";
  const cardActive = "ring-2 ring-[var(--color-terracotta)] bg-white";
  const inputBase =
    "w-full rounded-xl border border-[var(--color-beige)] bg-white/60 px-4 py-3 text-[var(--color-charcoal)] outline-none focus:ring-2 focus:ring-[var(--color-terracotta)]";

  // ---------------- EKRAN USPEHA ----------------
  if (screen === "success" && service && selectedSlot) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-[var(--color-beige)]">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-terracotta)] text-2xl text-white">
          ✓
        </div>
        <h2 className="font-[family-name:var(--font-serif)] text-3xl font-semibold">
          Termin je zakazan!
        </h2>
        <p className="mt-2 text-[var(--color-charcoal)]/70">
          Vidimo se u salonu Optima.
        </p>

        <div className="mt-6 rounded-xl bg-[var(--color-cream)] p-5 text-left">
          <Row label="Usluga" value={service.name} />
          <Row label="Radnik" value={staffName} />
          <Row
            label="Datum i vreme"
            value={`${formatDate(date)} u ${selectedSlot.label}`}
          />
          <Row label="Trajanje" value={formatDuration(service.duration_minutes)} />
          <Row label="Cena" value={formatPrice(service.price)} />
          <Row label="Ime" value={fullName.trim()} />
          <Row label="Telefon" value={phone.trim()} />
          {email.trim() && <Row label="Email" value={email.trim()} />}
        </div>

        <button
          type="button"
          onClick={resetAll}
          className="mt-6 rounded-xl bg-[var(--color-terracotta)] px-6 py-3 font-medium text-white shadow-sm transition hover:opacity-90"
        >
          Zakaži još jedan termin
        </button>
      </div>
    );
  }

  // ---------------- EKRAN PREGLEDA ----------------
  if (screen === "review" && service && selectedSlot) {
    return (
      <div className="flex flex-col gap-6">
        <h2 className="font-[family-name:var(--font-serif)] text-2xl font-semibold">
          Pregled rezervacije
        </h2>

        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-[var(--color-beige)]">
          <Row label="Usluga" value={service.name} />
          <Row label="Radnik" value={staffName} />
          <Row
            label="Datum i vreme"
            value={`${formatDate(date)} u ${selectedSlot.label}`}
          />
          <Row label="Trajanje" value={formatDuration(service.duration_minutes)} />
          <Row label="Cena" value={formatPrice(service.price)} />
          <div className="my-3 h-px bg-[var(--color-beige)]" />
          <Row label="Ime" value={fullName.trim()} />
          <Row label="Telefon" value={phone.trim()} />
          {email.trim() && <Row label="Email" value={email.trim()} />}
        </div>

        {formError && (
          <p className="rounded-xl bg-[#fdece8] px-5 py-4 text-[var(--color-terracotta)]">
            {formError}
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => setScreen("picker")}
            disabled={submitting}
            className="rounded-xl border border-[var(--color-beige)] px-6 py-3 font-medium text-[var(--color-charcoal)] transition hover:bg-[var(--color-beige)] disabled:opacity-50"
          >
            Nazad
          </button>
          <button
            type="button"
            onClick={confirmBooking}
            disabled={submitting}
            className="flex-1 rounded-xl bg-[var(--color-terracotta)] px-6 py-3 font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Zakazujem…" : "Potvrdi"}
          </button>
        </div>
      </div>
    );
  }

  // ---------------- EKRAN IZBORA (koraci 1–5) ----------------
  return (
    <div className="flex flex-col gap-10">
      {takenMsg && (
        <p className="rounded-xl bg-[#fdece8] px-5 py-4 text-[var(--color-terracotta)]">
          {takenMsg}
        </p>
      )}

      {/* 1) USLUGA */}
      <section>
        <StepTitle n={1} title="Izaberi uslugu" />
        <div className="flex flex-col gap-6">
          <ServiceGroup
            title="Kosa"
            items={kosa}
            selectedId={service?.id ?? null}
            onPick={chooseService}
          />
          <ServiceGroup
            title="Nokti"
            items={nokti}
            selectedId={service?.id ?? null}
            onPick={chooseService}
          />
        </div>
      </section>

      {/* 2) RADNIK */}
      {service && (
        <section>
          <StepTitle n={2} title="Izaberi radnika" />
          {availableStaff.length === 0 ? (
            <p className="rounded-xl bg-[var(--color-beige)] px-5 py-4 text-[var(--color-charcoal)]/80">
              Trenutno nema radnika za ovu uslugu.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {availableStaff.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setStaffId(m.id);
                    setTakenMsg(null);
                  }}
                  className={`${cardBase} ${staffId === m.id ? cardActive : ""}`}
                >
                  <span className="font-medium">{m.full_name}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 3) DATUM */}
      {service && staffId && (
        <section>
          <StepTitle n={3} title="Izaberi datum" />
          <input
            type="date"
            value={date}
            min={todayISO}
            max={maxISO}
            onChange={(e) => {
              setDate(e.target.value);
              setTakenMsg(null);
            }}
            className={inputBase}
          />
        </section>
      )}

      {/* 4) TERMINI */}
      {service && staffId && date && (
        <section>
          <StepTitle n={4} title="Izaberi termin" />

          {loading && (
            <p className="text-[var(--color-charcoal)]/70">Učitavam termine…</p>
          )}

          {!loading && error && (
            <p className="rounded-xl bg-[#fdece8] px-5 py-4 text-[var(--color-terracotta)]">
              {error}
            </p>
          )}

          {!loading && !error && loaded && outOfRange && (
            <p className="rounded-xl bg-[var(--color-beige)] px-5 py-4 text-[var(--color-charcoal)]/80">
              Datum je van perioda za zakazivanje.
            </p>
          )}

          {!loading && !error && loaded && !outOfRange && slots.length === 0 && (
            <p className="rounded-xl bg-[var(--color-beige)] px-5 py-4 text-[var(--color-charcoal)]/80">
              Nema slobodnih termina tog dana.
            </p>
          )}

          {!loading && !error && slots.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((slot) => (
                <button
                  key={slot.startUtcISO}
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className={`rounded-lg px-3 py-2 text-center font-medium ring-1 transition ${
                    selectedSlot?.startUtcISO === slot.startUtcISO
                      ? "bg-[var(--color-terracotta)] text-white ring-[var(--color-terracotta)]"
                      : "bg-white/60 ring-[var(--color-beige)] hover:ring-[var(--color-terracotta)]"
                  }`}
                >
                  {slot.label}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 5) PODACI MUŠTERIJE */}
      {selectedSlot && service && (
        <section>
          <StepTitle n={5} title="Tvoji podaci" />
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm text-[var(--color-charcoal)]/70">
                Ime i prezime <span className="text-[var(--color-terracotta)]">*</span>
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
              <label className="mb-1 block text-sm text-[var(--color-charcoal)]/70">
                Telefon <span className="text-[var(--color-terracotta)]">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="npr. 064 123 4567"
                className={inputBase}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[var(--color-charcoal)]/70">
                Email (opciono)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="npr. jovana@primer.rs"
                className={inputBase}
              />
            </div>

            {formError && (
              <p className="rounded-xl bg-[#fdece8] px-5 py-3 text-[var(--color-terracotta)]">
                {formError}
              </p>
            )}

            <button
              type="button"
              onClick={goToReview}
              className="mt-2 rounded-xl bg-[var(--color-terracotta)] px-6 py-3 font-medium text-white shadow-sm transition hover:opacity-90"
            >
              Pregledaj termin
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-sm text-[var(--color-charcoal)]/60">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="mb-4 flex items-center gap-3 font-[family-name:var(--font-serif)] text-2xl font-semibold">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-terracotta)] text-base text-white">
        {n}
      </span>
      {title}
    </h2>
  );
}

function ServiceGroup({
  title,
  items,
  selectedId,
  onPick,
}: {
  title: string;
  items: Service[];
  selectedId: string | null;
  onPick: (s: Service) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-3 text-sm font-medium uppercase tracking-[0.15em] text-[var(--color-terracotta)]">
        {title}
      </h3>
      <div className="flex flex-col gap-2">
        {items.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s)}
            className={`flex w-full items-center justify-between gap-4 rounded-xl bg-white/60 px-5 py-4 text-left shadow-sm ring-1 ring-[var(--color-beige)] transition hover:ring-[var(--color-terracotta)] ${
              selectedId === s.id
                ? "ring-2 ring-[var(--color-terracotta)] bg-white"
                : ""
            }`}
          >
            <span>
              <span className="block font-medium">{s.name}</span>
              <span className="block text-sm text-[var(--color-charcoal)]/60">
                {s.duration_minutes < 60
                  ? `${s.duration_minutes} min`
                  : `${Math.floor(s.duration_minutes / 60)} h${
                      s.duration_minutes % 60 ? ` ${s.duration_minutes % 60} min` : ""
                    }`}
              </span>
            </span>
            <span className="shrink-0 font-medium">{formatPrice(s.price)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
