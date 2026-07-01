import "server-only";

// Potpisana sesija za /recepcija (deljena lozinka, ne login po osobi).
// HMAC-SHA256 preko ugrađenog Web Crypto — radi i u Edge middleware-u i u
// Node server action-ima, bez dodatne biblioteke. Potpisni ključ (SESSION_SECRET)
// je NAMERNO odvojen od STAFF_PASSWORD — lozinka je kratka/pamtljiva pa je slaba
// kao kripto ključ, i promena lozinke ne bi trebalo da obori sve sesije.

export const COOKIE_NAME = "optima_staff_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dana

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "Nedostaje SESSION_SECRET u .env.local (dugačak nasumičan string; i u Vercel env za deploy)."
    );
  }
  return secret;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + ((4 - (str.length % 4)) % 4), "=");
  const binary = atob(padded);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncode(new Uint8Array(sig));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Payload nosi SAMO isteka — ništa osetljivo (binarno "osoblje da", bez identiteta).
export async function createSessionCookieValue(): Promise<string> {
  const payload = JSON.stringify({ exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 });
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(payload));
  const sig = await hmac(payloadB64);
  return `${payloadB64}.${sig}`;
}

export async function verifySessionCookieValue(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;
  const expectedSig = await hmac(payloadB64);
  if (!constantTimeEqual(sig, expectedSig)) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as { exp: number };
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}
