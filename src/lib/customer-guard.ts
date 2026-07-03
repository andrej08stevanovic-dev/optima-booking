import "server-only";

import { createSupabaseServerClient } from "./supabase-server";

// Provera mušterijske (Supabase Auth) sesije za server actions/stranice pod
// /moja-zakazivanja. Analogno hasValidStaffSession() iz staff-guard.ts, ali
// POTPUNO odvojeno — ovo nikad ne čita staff kolačić i obrnuto.
//
// getUser() (ne getSession()) namerno — validira JWT NA Supabase Auth serveru,
// ne samo lokalno dekodiranje kolačića.
export async function getCustomerEmail(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) return null;
  return data.user.email.toLowerCase();
}
