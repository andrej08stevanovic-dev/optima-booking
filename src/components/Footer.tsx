import Link from "next/link";

export function Footer() {
  return (
    <footer className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-6 text-sm text-[var(--color-charcoal)]/60 sm:px-6">
      <span>Salon Optima · Vranje</span>
      <Link href="/recepcija/login" className="hover:text-[var(--color-charcoal)]">
        Ulaz za osoblje
      </Link>
    </footer>
  );
}
