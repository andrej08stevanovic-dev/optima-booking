import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Supabase magic link vraća korisnika ovde sa ?code=... (PKCE). Razmena koda za
// sesiju postavlja Supabase Auth httpOnly kolačić preko cookie-bound server
// klijenta, pa /moja-zakazivanja odmah vidi prijavljenog korisnika.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL("/moja-zakazivanja", request.url));
    }
  }

  return NextResponse.redirect(new URL("/prijava?greska=1", request.url));
}
