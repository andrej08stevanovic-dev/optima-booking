import "server-only";

import { cookies } from "next/headers";
import { COOKIE_NAME, verifySessionCookieValue } from "./staff-session";

// Provera staff sesije za server actions. NE oslanjamo se samo na proxy.ts —
// Next dokumentacija upozorava da refaktor rute može tiho skinuti proxy pokrivenost
// server actiona, pa svaki write action ovo zove kao prvu liniju (defense-in-depth).
export async function hasValidStaffSession(): Promise<boolean> {
  const store = await cookies();
  return verifySessionCookieValue(store.get(COOKIE_NAME)?.value);
}
