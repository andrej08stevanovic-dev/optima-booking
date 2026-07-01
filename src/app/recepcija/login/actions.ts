"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, SESSION_MAX_AGE_SECONDS, createSessionCookieValue } from "@/lib/staff-session";

// Konstantno-vremensko poređenje: hešuj oba ulaza na fiksnu dužinu (SHA-256, 32B)
// pa poredi heševe preko timingSafeEqual — tako dužina/sadržaj unete lozinke ne
// cure kroz vreme izvršavanja.
function passwordsMatch(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function loginAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const expected = process.env.STAFF_PASSWORD;
  if (!expected) {
    throw new Error("Nedostaje STAFF_PASSWORD u .env.local.");
  }

  if (!passwordsMatch(password, expected)) {
    // Minimalna brana na pogrešan pokušaj (kratak delay) — /recepcija/login je javan URL.
    // Pun rate-limiter nije potreban za v1.
    await new Promise((resolve) => setTimeout(resolve, 700));
    redirect("/recepcija/login?error=1");
  }

  const value = await createSessionCookieValue();
  const store = await cookies();
  store.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  redirect("/recepcija");
}
