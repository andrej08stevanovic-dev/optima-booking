"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { findCustomerIdsByEmail } from "@/lib/email-match";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function sendMagicLink(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();

  if (email && /.+@.+\..+/.test(email)) {
    const ids = await findCustomerIdsByEmail(email);
    // Šalji SAMO ako je email stvarno vezan za postojećeg customer-a — čuva
    // ograničenu SMTP kvotu (free tier ~3-4/h) i ne pravi Supabase Auth naloge
    // za nasumične mejlove. NAPOMENA: "Allow new users to sign up" u Supabase
    // dashboardu MORA ostati UKLJUČENO — mušterija nema Auth nalog pre prvog
    // magic-link login-a, pa bi isključena opcija blokirala baš taj prvi put.
    // Ova provera ovde (customers tabela) je dovoljna brana protiv nepoznatih mejlova.
    if (ids && ids.length > 0) {
      // SSR (cookie-based) klijent NAMERNO — on čuva PKCE code_verifier u httpOnly
      // kolačiću, pa /auth/callback (exchangeCodeForSession) ima par za razmenu.
      // Običan anon klijent bi koristio implicit flow (token u URL fragmentu), što
      // naš server callback ne može da pročita.
      const supabase = await createSupabaseServerClient();
      const h = await headers();
      const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${origin}/auth/callback` },
      });
      // Ne menjamo poruku ka korisniku (ostaje generička) — ali logujemo na
      // serveru da otkažeš/dijagnostikuješ ako slanje ikad ne uspe (rate limit,
      // pogrešno podešen provider, itd).
      if (error) {
        console.error("sendMagicLink: signInWithOtp greška:", error.message);
      }
    }
  }

  // Redirect (ne prost povratak stringa) da refresh stranice ne ponovi slanje,
  // i da forma ima čist prazan input posle. Poruka je IDENTIČNA bez obzira na
  // granu iznad — vidi /prijava/page.tsx (parametar "poslato").
  redirect("/prijava?poslato=1");
}

export async function signOutCustomer(): Promise<void> {
  const supabaseServer = await createSupabaseServerClient();
  await supabaseServer.auth.signOut();
  redirect("/prijava");
}
