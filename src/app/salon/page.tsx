import { permanentRedirect } from "next/navigation";

// Tim i usluge su preseljeni na početnu stranicu (/) — ova ruta ostaje
// samo da stari linkovi ne puknu.
export default function SalonPage() {
  permanentRedirect("/");
}
