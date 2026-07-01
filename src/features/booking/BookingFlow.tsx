"use client";

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import type { MergedSlot, Service, StaffMember } from "./types";
import {
  createBooking,
  getAvailableSlots,
  getAvailableSlotsAnyStaff,
} from "./actions";
import type { Slot } from "./availability";

type Props = {
  services: Service[];
  staff: StaffMember[];
  links: { staff_id: string; service_id: string }[];
  timezone: string;
  maxHorizonDays: number;
};

type Screen = "picker" | "review" | "success";
type SelectedSlot = { startUtcISO: string; label: string };
// Dodela prati NAMERU mušterije, ne trenutni broj slobodnih:
//  - 'specific': kliknula konkretno ime radnika (korak 2)
//  - 'any': izabrala "Bilo ko slobodan" — sistem NIKAD ne pita kod koga;
//    server dodeljuje konkretnog radnika tek pri potvrdi.
type Assignment = { origin: "specific"; staffId: string; staffName: string } | { origin: "any" } | null;

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
  const [staffId, setStaffId] = useState<string | null>(null); // konkretan izbor
  const [anyMode, setAnyMode] = useState(false); // "Bilo ko slobodan"
  const [date, setDate] = useState<string>("");

  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [assignment, setAssignment] = useState<Assignment>(null);
  const [confirmedStaffName, setConfirmedStaffName] = useState<string | null>(null);
  const [confirmedWasAny, setConfirmedWasAny] = useState(false);

  // Podaci mušterije
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [slots, setSlots] = useState<Slot[]>([]); // specific
  const [anySlots, setAnySlots] = useState<MergedSlot[]>([]); // any
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

  const concreteStaffName = staff.find((s) => s.id === staffId)?.full_name ?? "";

  // Radnici koji rade IZABRANU uslugu.
  const availableStaff = useMemo(() => {
    if (!service) return [];
    const ids = new Set(
      links.filter((l) => l.service_id === service.id).map((l) => l.staff_id)
    );
    return staff.filter((s) => ids.has(s.id));
  }, [service, links, staff]);

  const hasStaffPick = staffId !== null || anyMode;

  // Učitavanje termina — KONKRETAN radnik.
  useEffect(() => {
    if (anyMode || !service || !staffId || !date) return;
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
  }, [anyMode, service, staffId, date, reloadKey]);

  // Učitavanje termina — "BILO KO" (spojeno).
  useEffect(() => {
    if (!anyMode || !service || !date) return;
    let cancelled = false;
    const serviceId = service.id;
    async function load() {
      setLoading(true);
      setError(null);
      setSelectedSlot(null);
      setAssignment(null);
      try {
        const res = await getAvailableSlotsAnyStaff(serviceId, date);
        if (cancelled) return;
        if (res.ok) {
          setAnySlots(res.slots);
          setOutOfRange(res.outOfRange);
        } else {
          setAnySlots([]);
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
  }, [anyMode, service, date, reloadKey]);

  function resetSelectionState() {
    setDate("");
    setSlots([]);
    setAnySlots([]);
    setSelectedSlot(null);
    setAssignment(null);
    setLoaded(false);
    setTakenMsg(null);
  }

  function chooseService(s: Service) {
    setService(s);
    setStaffId(null);
    setAnyMode(false);
    resetSelectionState();
  }

  function chooseConcreteStaff(id: string) {
    setStaffId(id);
    setAnyMode(false);
    resetSelectionState();
  }

  function chooseAny() {
    setAnyMode(true);
    setStaffId(null);
    resetSelectionState();
  }

  function onDateChange(value: string) {
    setDate(value);
    setSelectedSlot(null);
    setAssignment(null);
    setTakenMsg(null);
  }

  // Izbor vremena — konkretan radnik.
  function pickSpecificTime(slot: Slot) {
    setSelectedSlot({ startUtcISO: slot.startUtcISO, label: slot.label });
    setAssignment({
      origin: "specific",
      staffId: staffId!,
      staffName: concreteStaffName,
    });
  }

  // Izbor vremena — "bilo ko". Sistem NIKAD ne pita kod koga; dodela ide
  // pri potvrdi, server-side.
  function pickAnyTime(m: MergedSlot) {
    setSelectedSlot({ startUtcISO: m.startUtcISO, label: m.label });
    setAssignment({ origin: "any" });
  }

  function goToReview() {
    setFormError(null);
    if (!fullName.trim()) return setFormError("Unesi ime.");
    if (!phone.trim()) return setFormError("Unesi broj telefona.");
    if (email.trim() && !/.+@.+\..+/.test(email.trim())) {
      return setFormError("Email nije ispravan (ili ga ostavi prazan).");
    }
    setScreen("review");
  }

  async function confirmBooking() {
    if (!service || !selectedSlot || !assignment) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await createBooking({
        serviceId: service.id,
        startUtcISO: selectedSlot.startUtcISO,
        origin: assignment.origin,
        staffId:
          assignment.origin === "specific" ? assignment.staffId : undefined,
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
      });
      if (res.ok) {
        setConfirmedStaffName(res.staffName);
        setConfirmedWasAny(assignment.origin === "any");
        setScreen("success");
      } else if (res.reason === "taken") {
        setTakenMsg("Termin je upravo zauzet, izaberi drugi.");
        setSelectedSlot(null);
        setAssignment(null);
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
    setAnyMode(false);
    resetSelectionState();
    setFullName("");
    setPhone("");
    setEmail("");
    setFormError(null);
    setConfirmedStaffName(null);
    setConfirmedWasAny(false);
  }

  const cardBase =
    "w-full rounded-xl bg-white/60 p-4 text-left shadow-sm ring-1 ring-[var(--color-beige)] transition hover:ring-[var(--color-terracotta)]";
  const cardActive = "ring-2 ring-[var(--color-terracotta)] bg-white";
  const inputBase =
    "w-full rounded-xl border border-[var(--color-beige)] bg-white/60 px-4 py-3 text-[var(--color-charcoal)] outline-none focus:ring-2 focus:ring-[var(--color-terracotta)]";

  const staffLineForReview =
    assignment?.origin === "specific"
      ? assignment.staffName
      : assignment?.origin === "any"
        ? "Dodeljujemo vam slobodnog radnika"
        : "";

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

        {confirmedWasAny && confirmedStaffName && (
          <p className="mt-3 font-medium text-[var(--color-terracotta)]">
            Vaš termin je kod {confirmedStaffName}.
          </p>
        )}

        <div className="mt-6 rounded-xl bg-[var(--color-cream)] p-5 text-left">
          <Row label="Usluga" value={service.name} />
          <Row label="Radnik" value={confirmedStaffName ?? ""} />
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
  if (screen === "review" && service && selectedSlot && assignment) {
    return (
      <div className="flex flex-col gap-6">
        <h2 className="font-[family-name:var(--font-serif)] text-2xl font-semibold">
          Pregled rezervacije
        </h2>

        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-[var(--color-beige)]">
          <Row label="Usluga" value={service.name} />
          <Row label="Radnik" value={staffLineForReview} />
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

  // ---------------- EKRAN IZBORA ----------------
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
              {/* "Bilo ko" ima smisla samo kad ima >1 radnika za uslugu. */}
              {availableStaff.length > 1 && (
                <button
                  type="button"
                  onClick={chooseAny}
                  className={`${cardBase} ${anyMode ? cardActive : ""} sm:col-span-2`}
                >
                  <span className="font-medium">Bilo ko slobodan</span>
                  <span className="mt-0.5 block text-sm text-[var(--color-charcoal)]/60">
                    Prikaži termine svih radnika za ovu uslugu
                  </span>
                </button>
              )}
              {availableStaff.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => chooseConcreteStaff(m.id)}
                  className={`${cardBase} ${
                    !anyMode && staffId === m.id ? cardActive : ""
                  }`}
                >
                  <span className="font-medium">{m.full_name}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 3) DATUM */}
      {service && hasStaffPick && (
        <section>
          <StepTitle n={3} title="Izaberi datum" />
          <input
            type="date"
            value={date}
            min={todayISO}
            max={maxISO}
            onChange={(e) => onDateChange(e.target.value)}
            className={inputBase}
          />
        </section>
      )}

      {/* 4) TERMINI */}
      {service && hasStaffPick && date && (
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

          {!loading &&
            !error &&
            loaded &&
            !outOfRange &&
            (anyMode ? anySlots.length === 0 : slots.length === 0) && (
              <p className="rounded-xl bg-[var(--color-beige)] px-5 py-4 text-[var(--color-charcoal)]/80">
                Nema slobodnih termina tog dana.
              </p>
            )}

          {/* Konkretan radnik */}
          {!loading && !error && !anyMode && slots.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((slot) => (
                <TimeButton
                  key={slot.startUtcISO}
                  label={slot.label}
                  active={selectedSlot?.startUtcISO === slot.startUtcISO}
                  onClick={() => pickSpecificTime(slot)}
                />
              ))}
            </div>
          )}

          {/* "Bilo ko" — samo vremena; koga dobija se ne pita, dodela ide pri potvrdi */}
          {!loading && !error && anyMode && anySlots.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {anySlots.map((m) => (
                <TimeButton
                  key={m.startUtcISO}
                  label={m.label}
                  active={selectedSlot?.startUtcISO === m.startUtcISO}
                  onClick={() => pickAnyTime(m)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* PODACI MUŠTERIJE — kad je termin + dodela razrešena */}
      {selectedSlot && assignment && service && (
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

function TimeButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-center font-medium ring-1 transition ${
        active
          ? "bg-[var(--color-terracotta)] text-white ring-[var(--color-terracotta)]"
          : "bg-white/60 ring-[var(--color-beige)] hover:ring-[var(--color-terracotta)]"
      }`}
    >
      {label}
    </button>
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
                {formatDuration(s.duration_minutes)}
              </span>
            </span>
            <span className="shrink-0 font-medium">{formatPrice(s.price)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
