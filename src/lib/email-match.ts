import "server-only";

import { supabaseAdmin } from "./supabase-admin";

// Eskejpuje ILIKE specijalne karaktere (%, _, \) tako da `ilike` sa OVIM stringom
// radi kao case-insensitive TAČNO poklapanje, ne kao wildcard pretraga. Bez ovoga
// bi email sa donjom crtom (npr. "jo_n@x.com") lažno poklapao "john@x.com".
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// Svi customer id-jevi čiji je email (case-insensitive) TAČNO jednak datom.
// Vraća SVE poklapanja (namerno) — ista mušterija je mogla dobiti dva različita
// customer reda (različit telefon, isti email) jer se identitet pri zakazivanju
// vezuje za telefon, ne email. "Moja zakazivanja" mora da pokrije oba reda.
export async function findCustomerIdsByEmail(email: string): Promise<string[] | null> {
  const escaped = escapeLikePattern(email.trim());
  const res = await supabaseAdmin
    .from("customers")
    .select("id")
    .ilike("email", escaped);
  if (res.error) return null;
  return (res.data ?? []).map((r) => r.id as string);
}
