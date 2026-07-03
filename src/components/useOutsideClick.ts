"use client";

import { useEffect } from "react";

// Zatvara popover na klik van njega ili na Escape. Deljeno između DatePicker i
// TimePicker — identična logika, nema smisla duplirati.
export function useOutsideClick(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  onOutside: () => void
) {
  useEffect(() => {
    if (!active) return;

    function handlePointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOutside();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onOutside();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [active, ref, onOutside]);
}
