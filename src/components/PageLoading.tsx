export function PageLoading() {
  return (
    <div className="animate-fade-in flex flex-1 flex-col items-center justify-center gap-3 py-24">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-beige)] border-t-[var(--color-terracotta)]"
        aria-hidden="true"
      />
      <p className="text-sm text-[var(--color-charcoal)]/50">Učitavam…</p>
    </div>
  );
}
