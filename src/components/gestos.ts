"use client";

// Tras soltar un drag (manija de resize del globo o del panel), el navegador
// dispara un `click` sintético cuyo `target` puede ser el fondo del canvas —
// deseleccionaría el globo o cerraría el panel. Hay que tragarse **ese** click.
//
// El click sintético post-drag llega prácticamente pegado al `pointerup` (mismo
// task / microtask). Un click REAL del usuario viene bastante después (bajar +
// soltar el mouse, mover a otro control). Así que: se traga el primer `click`
// solo si llega dentro de una ventana corta desde que se armó; después, o si no
// llega ninguno, se desarma.
//
// F5-0 / re-fix: antes era un `{ once: true }` que se comía el PRÓXIMO click sin
// importar cuándo → si redimensionabas algo y después clickeabas otra cosa (el
// `⌄` que esconde el composer), ese click se perdía y parecía "no responde /
// pide doble clic".
export function tragarClickSintetico(): void {
  const t0 =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const ahora = () =>
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const tragar = (ev: Event) => {
    window.removeEventListener("click", tragar, true);
    clearTimeout(backstop);
    if (ahora() - t0 < 150) {
      // Es el sintético del drag: tragarlo.
      ev.stopPropagation();
      ev.preventDefault();
    }
    // Si llegó más tarde, es un click real → se deja pasar.
  };
  const backstop = setTimeout(
    () => window.removeEventListener("click", tragar, true),
    400,
  );
  window.addEventListener("click", tragar, { capture: true });
}
