import { loginAction } from "./actions";

export default async function RecepcijaLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center font-[family-name:var(--font-serif)] text-3xl font-semibold sm:text-4xl">
          Recepcija
        </h1>
        <p className="mb-8 text-center text-[var(--color-charcoal)]/70">
          Unesi lozinku salona.
        </p>

        <form action={loginAction} className="flex flex-col gap-3">
          <input
            type="password"
            name="password"
            placeholder="Lozinka"
            required
            autoFocus
            className="w-full rounded-xl border border-[var(--color-beige)] bg-white/60 px-4 py-3 outline-none focus:ring-2 focus:ring-[var(--color-terracotta)]"
          />

          {params.error && (
            <p className="rounded-xl bg-[#fdece8] px-4 py-3 text-sm text-[var(--color-terracotta)]">
              Pogrešna lozinka.
            </p>
          )}

          <button
            type="submit"
            className="rounded-xl bg-[var(--color-terracotta)] px-6 py-3 font-medium text-white shadow-sm transition hover:opacity-90"
          >
            Uloguj se
          </button>
        </form>
      </div>
    </main>
  );
}
