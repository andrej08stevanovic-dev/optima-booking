import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { COOKIE_NAME, verifySessionCookieValue } from "@/lib/staff-session";

// Dva potpuno odvojena sistema provere, granata po putanji. Nijedno ne prihvata
// kredencijal onog drugog kao dokaz identiteta:
//  - /recepcija/*         -> STAFF kolačić (deljena lozinka, staff-session.ts)
//  - /moja-zakazivanja/*  -> Supabase Auth sesija (magic link)
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/recepcija")) {
    if (pathname === "/recepcija/login") {
      return NextResponse.next();
    }
    const cookie = request.cookies.get(COOKIE_NAME)?.value;
    const valid = await verifySessionCookieValue(cookie);
    if (!valid) {
      const url = request.nextUrl.clone();
      url.pathname = "/recepcija/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/moja-zakazivanja")) {
    // /prijava i /auth/callback NISU pod ovim matcher-om (vidi config ispod),
    // pa se ne diraju ovde.
    let response = NextResponse.next({ request });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            // Osveži i request i response kolačiće (standardni @supabase/ssr
            // middleware obrazac) — token refresh mora da stigne do klijenta.
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value);
            }
            response = NextResponse.next({ request });
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(name, value, options);
            }
          },
        },
      }
    );

    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      const url = request.nextUrl.clone();
      url.pathname = "/prijava";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/recepcija/:path*", "/moja-zakazivanja/:path*"],
};
