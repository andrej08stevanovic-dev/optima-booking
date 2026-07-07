import "server-only";

import { createClient } from "@supabase/supabase-js";

// SERVER-ONLY Supabase klijent sa service_role ključem.
// Čita zaključane tabele (bookings, time_off) i upisuje rezervacije.
// NIKAD se ne uvozi u client komponentu — `server-only` gore to fizički osigurava.
// Ključ NEMA NEXT_PUBLIC_ prefiks => nikad ne ide u browser bundle.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder";

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
