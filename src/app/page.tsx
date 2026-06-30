export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <span className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--color-terracotta)]">
          Frizerski salon · Vranje
        </span>

        <h1 className="font-[family-name:var(--font-serif)] text-5xl font-semibold leading-tight text-[var(--color-charcoal)] sm:text-6xl">
          Optima
        </h1>

        <div className="h-px w-16 bg-[var(--color-terracotta)]" />

        <p className="text-lg leading-relaxed text-[var(--color-charcoal)]/80">
          Online zakazivanje za kosu i nokte stiže uskoro.
        </p>
      </div>
    </main>
  );
}
