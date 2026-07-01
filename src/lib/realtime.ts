import "server-only";

import { supabaseAdmin } from "./supabase-admin";
import { RECEPTION_CHANNEL, RECEPTION_EVENT } from "./realtime-constants";

// Javni Realtime Broadcast kanal — NE postgres_changes na "bookings" (ta tabela je
// RLS-zaključana za anon, pa Realtime ne bi ni isporučio event anon klijentu).
// Umesto toga: posle uspešnog upisa server pošalje PRAZAN signal preko REST-a
// (httpSend, bez websocket životnog ciklusa — pogodno za kratkotrajni server action).
// Klijent (recepcija) na taj signal samo ponovo povuče dan preko admin klijenta —
// browser nikad ne dobija sadržaj bookings reda kroz Realtime.

export async function broadcastReceptionChange(): Promise<void> {
  const channel = supabaseAdmin.channel(RECEPTION_CHANNEL);
  try {
    await channel.httpSend(RECEPTION_EVENT, {});
  } catch {
    // Best-effort — signal koji ne stigne ne sme da obori uspešnu rezervaciju.
  } finally {
    await supabaseAdmin.removeChannel(channel);
  }
}
