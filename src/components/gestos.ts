"use client";

// Arrastre con **pointer capture**. Al capturar el puntero en `handle`, el
// navegador re-dirige a `handle` todos los eventos siguientes del puntero —
// incluido el `click` sintético que dispara al soltar un drag. Sin capture ese
// `click` cae sobre lo que quede debajo del cursor (el fondo del lienzo → el
// globo se deselecciona; el backdrop del panel → el panel se cierra).
//
// Reemplaza al viejo `tragarClickSintetico` (un swallower global de `click` en
// `window`, armado tras cada resize). Era frágil: distinguir el click sintético
// "malo" del click real del usuario sobre otro control (el `⌄` del composer, un
// botón) nunca terminó de funcionar — F5-0, F5-4b, F5-4c y otra vuelta más.
//
// `handle` debería además llevar `onClick={(e) => e.stopPropagation()}` por si
// el `click` reencaminado igual burbujea hasta un handler de arriba.
export function arrastrarConCaptura(
  e: { currentTarget: Element; pointerId: number },
  onMove: (ev: PointerEvent) => void,
  onEnd: () => void,
): void {
  const handle = e.currentTarget;
  const id = e.pointerId;
  try {
    handle.setPointerCapture(id);
  } catch {
    // puntero ya inactivo (raro) — el drag sigue por los listeners de window
  }
  const move = (ev: PointerEvent) => {
    if (ev.pointerId === id) onMove(ev);
  };
  const fin = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", fin);
    window.removeEventListener("pointercancel", fin);
    try {
      handle.releasePointerCapture(id);
    } catch {
      /* ya liberado */
    }
    onEnd();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", fin);
  window.addEventListener("pointercancel", fin);
}
