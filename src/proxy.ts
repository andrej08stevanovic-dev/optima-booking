import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME, verifySessionCookieValue } from "@/lib/staff-session";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/recepcija/login") {
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

export const config = {
  matcher: ["/recepcija/:path*"],
};
