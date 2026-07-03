import { sendMagicLink } from "@/features/customer-auth/actions";

const GENERIC_MESSAGE =
  "Ako imate zakazan termin kod nas sa ovom e-mail adresom, poslali smo vam link za prijavu. Proverite inbox (i spam folder).";

export default async function PrijavaPage({
  searchParams,
}: {
  searchParams: Promise<{ poslato?: string; greska?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center font-[family-name:var(--font-serif)] text-3xl font-semibold">
          Moja zakazivanja
        </h1>
        <p className="mb-8 text-center text-[var(--color-charcoal)]/70">
          Unesite e-mail koji ste ostavili prilikom zakazivanja — poslaćemo vam
          link za prijavu.
        </p>

        {params.greska && (
          <p className="mb-4 rounded-xl bg-[#fdece8] px-4 py-3 text-sm text-[var(--color-terracotta)]">
            Link je istekao ili je već iskorišćen. Zatražite novi ispod.
          </p>
        )}

        {params.poslato ? (
          <p className="rounded-xl bg-[var(--color-beige)] px-4 py-3 text-sm text-[var(--color-charcoal)]/80">
            {GENERIC_MESSAGE}
          </p>
        ) : (
          <form action={sendMagicLink} className="flex flex-col gap-3">
            <input
              type="email"
              name="email"
              placeholder="vas@email.com"
              required
              autoFocus
              className="w-full rounded-xl border border-[var(--color-beige)] bg-white/60 px-4 py-3 outline-none focus:ring-2 focus:ring-[var(--color-terracotta)]"
            />
            <button
              type="submit"
              className="rounded-xl bg-[var(--color-terracotta)] px-6 py-3 font-medium text-white shadow-sm transition hover:opacity-90"
            >
              Pošalji link
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
