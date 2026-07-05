import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-6 border-t border-[var(--color-beige)]">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3 text-[13px] text-[var(--color-charcoal)]/60 sm:px-6">
        <span>Salon Optima · Vranje</span>
        <Link
          href="/recepcija/login"
          className="transition hover:text-[var(--color-charcoal)]"
        >
          Ulaz za osoblje
        </Link>
      </div>
    </footer>
  );
}
