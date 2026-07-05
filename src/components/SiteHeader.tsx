import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-[var(--color-beige)]">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="font-[family-name:var(--font-serif)] text-xl font-bold tracking-[-0.01em]"
        >
          Optima
        </Link>
        <nav className="flex items-center gap-5 text-sm font-medium">
          <Link
            href="/zakazivanje"
            className="border-b-2 border-transparent pb-0.5 transition hover:border-[var(--color-terracotta)] hover:text-[var(--color-terracotta)]"
          >
            Zakaži termin
          </Link>
          <Link
            href="/prijava"
            className="border-b-2 border-transparent pb-0.5 transition hover:border-[var(--color-terracotta)] hover:text-[var(--color-terracotta)]"
          >
            Moji termini
          </Link>
        </nav>
      </div>
    </header>
  );
}
