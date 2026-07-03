"use server";

import { DateTime } from "luxon";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCustomerEmail } from "@/lib/customer-guard";
import { broadcastReceptionChange } from "@/lib/realtime";

export type CancelMyBookingResponse =
  | { ok: true }
  | {
      ok: false;
      reason: "unauthorized" | "not_found" | "not_cancellable" | "error";
      message: string;
    };

type BookingRow = {
  starts_at: string;
  status: string;
  customers: { email: string | null } | null;
};

// Otkazivanje termina OD STRANE MUŠTERIJE. Nikad ne veruje ničemu iz klijenta osim
// bookingId — identitet dolazi ISKLJUČIVO iz Supabase sesije, a vlasništvo se dokazuje
// lancem email(session) -> customers.email(booking) uživo iz baze.
export async function cancelMyBooking(bookingId: string): Promise<CancelMyBookingResponse> {
  // 1) Sesija (defense-in-depth pored proxy.ts) — sveža, verifikovana email adresa.
  const sessionEmail = await getCustomerEmail();
  if (!sessionEmail) {
    return { ok: false, reason: "unauthorized", message: "Sesija je istekla. Prijavite se ponovo." };
  }

  if (!bookingId) {
    return { ok: false, reason: "not_found", message: "Termin nije pronađen." };
  }

  // 2) Učitaj termin SA email-om njegovog customer-a (JOIN) — čitamo TRENUTNI email
  //    iz baze, ne bilo kakav keširan/prosleđen podatak.
  const res = await supabaseAdmin
    .from("bookings")
    .select("starts_at, status, customers(email)")
    .eq("id", bookingId)
    .maybeSingle();
  if (res.error) {
    return { ok: false, reason: "error", message: "Greška pri učitavanju termina." };
  }
  // supabase-js zaključi embedovani many-to-one kao niz; runtime je objekat.
  const booking = res.data as unknown as BookingRow | null;
  if (!booking) {
    return { ok: false, reason: "not_found", message: "Termin nije pronađen." };
  }

  // 3) VLASNIŠTVO: email iz sesije mora tačno (case-insensitive) da odgovara email-u
  //    customer-a NA TOM terminu. Ako ne — namerno vraćamo "nije pronađen" (isto kao
  //    da termin ne postoji), da prijavljena osoba ne može ni da potvrdi postojanje
  //    tuđeg termina pogađanjem ID-a, a kamoli da ga otkaže.
  const bookingEmail = booking.customers?.email?.toLowerCase() ?? null;
  if (!bookingEmail || bookingEmail !== sessionEmail) {
    return { ok: false, reason: "not_found", message: "Termin nije pronađen." };
  }

  // 4) OTKAZIVOST:
  //    a) status mora biti 'booked' ili 'confirmed' (ne već otkazan/završen/no_show).
  if (booking.status !== "booked" && booking.status !== "confirmed") {
    return {
      ok: false,
      reason: "not_cancellable",
      message: "Ovaj termin se ne može otkazati online.",
    };
  }
  //    b) starts_at mora biti u BUDUĆNOSTI (poređenje UTC trenutaka; "sada" u
  //       beogradskoj zoni je isti trenutak kao now u UTC, ali držimo se Luxon-a
  //       dosledno kroz projekat i nikad new Date()).
  //    NAPOMENA: ovde je mesto za buduće pravilo min_cancel_hours (npr. bez
  //    otkazivanja u zadnjih 2h) — NE gradimo ga sad (v1 = samo "mora u budućnost").
  const startsAt = DateTime.fromISO(booking.starts_at);
  const now = DateTime.now();
  if (startsAt <= now) {
    return {
      ok: false,
      reason: "not_cancellable",
      message: "Termin je već počeo ili prošao — za otkazivanje pozovite salon.",
    };
  }

  // 5) Otkaži (UPDATE, ne DELETE — čuvamo istoriju). Uslovom na status izbegavamo
  //    trku (npr. recepcija ga u međuvremenu prebacila u 'done').
  const upd = await supabaseAdmin
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId)
    .in("status", ["booked", "confirmed"])
    .select("id")
    .maybeSingle();
  if (upd.error) {
    return { ok: false, reason: "error", message: "Greška pri otkazivanju." };
  }
  if (!upd.data) {
    // Status se promenio između provere i upisa — više nije otkaziv.
    return {
      ok: false,
      reason: "not_cancellable",
      message: "Ovaj termin se ne može otkazati online.",
    };
  }

  // 6) Osvezi kalendar recepcije uživo (slot se oslobađa: EXCLUDE ima WHERE status
  //    <> 'cancelled', kao od Faze 2).
  await broadcastReceptionChange();

  return { ok: true };
}
