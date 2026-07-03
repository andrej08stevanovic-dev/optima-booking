import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Supabase klijent (anon ključ) vezan za Next `cookies()` — čita/piše Supabase Auth
// sesijske kolačiće mušterije. Potpuno odvojen od staff sesije (staff-session.ts,
// staff-guard.ts) — ovaj klijent ne zna ništa o STAFF_PASSWORD/SESSION_SECRET,
// i obrnuto. Koristi se SAMO za /moja-zakazivanja i /prijava.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // U Server Component-i (bez pratećeg action-a) ovo sme da baci — Next to
          // zabranjuje van server actiona/route handlera. proxy.ts osvežava token,
          // pa je bezbedno ignorisati grešku ovde (isti obrazac kao Supabase docs).
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // ignoriši — vidi komentar iznad
          }
        },
      },
    }
  );
}
