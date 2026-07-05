import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
      <Link
        href="/"
        className="font-[family-name:var(--font-serif)] text-xl font-semibold"
      >
        Optima
      </Link>
      <nav className="flex items-center gap-4 text-sm font-medium">
        <Link href="/zakazivanje" className="hover:text-[var(--color-terracotta)]">
          Zakaži termin
        </Link>
        <Link href="/prijava" className="hover:text-[var(--color-terracotta)]">
          Moji termini
        </Link>
      </nav>
    </header>
  );
}
