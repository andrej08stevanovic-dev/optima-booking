"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// Tanka traka na vrhu (Linear/GitHub/YouTube stil) — daje INSTANT vizuelni
// odgovor na klik, dok server priprema sledeću stranicu (naše dinamičke rute
// idu do Supabase-a pre nego što pošalju i jedan bajt HTML-a, pa bez ovoga
// klik izgleda "zamrznuto" ~600ms+ pre nego što se nova stranica pojavi).
//
// Namerno BEZ useSearchParams() — nijedna naša navigacija ne menja samo query
// (recepcija menja dan preko lokalnog state-a i server action-a, ne URL-a),
// pa je usePathname() dovoljan i izbegava Suspense-boundary zahtev koji
// useSearchParams nosi sa sobom.
export function TopProgressBar() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [pct, setPct] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);

  // Ruta se STVARNO promenila (RSC stigao, novi sadržaj je na ekranu) -> dovrši traku.
  useEffect(() => {
    if (!startedRef.current) return;
    startedRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    setPct(100);
    const t = setTimeout(() => {
      setVisible(false);
      setPct(0);
    }, 200);
    return () => clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      // CAPTURE faza, namerno: next/link sam zove preventDefault() u svom
      // (bubble-faza, React-ov root listener) onClick-u da presretne navigaciju.
      // Da bismo videli klik PRE toga, moramo capture — inače je e.defaultPrevented
      // već true kad bismo slušali na bubble fazi i ovaj kod se nikad ne bi izvršio.
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement)?.closest?.("a");
      if (!anchor) return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

      startedRef.current = true;
      setVisible(true);
      setPct(15);
      if (timerRef.current) clearInterval(timerRef.current);
      // Približava se ka 85% ali ga nikad ne dostiže dok stvarna navigacija ne
      // završi (usePathname efekat gore dovršava na 100%) — klasičan
      // "nprogress" obrazac bez prave biblioteke.
      timerRef.current = setInterval(() => {
        setPct((p) => (p >= 85 ? p : p + (85 - p) * 0.15));
      }, 150);
    }
    document.addEventListener("click", onClick, { capture: true });
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed left-0 top-0 z-[100] h-[3px] bg-[var(--color-terracotta)] transition-[width,opacity] duration-200 ease-out"
      style={{ width: `${pct}%`, opacity: pct >= 100 ? 0 : 1 }}
      aria-hidden="true"
    />
  );
}
