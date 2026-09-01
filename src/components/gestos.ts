"use client";

// Tras soltar un drag (manija de resize del globo o del panel), el navegador
// dispara un `click` sintético cuyo `target` puede ser el fondo del canvas —
// deseleccionaría el globo o cerraría el panel. Hay que tragarse **ese** click.
//
// El bug que arregla F5-0: antes se armaba `{ once: true }`, que se come el
// PRÓXIMO click sea cuando sea → si redimensionabas algo y después clickeabas
// otra cosa (típico: la flecha `⌄` que esconde el composer), ese click se perdía
// y parecía que la UI "no responde / pide doble clic".
//
// Distinción: el click sintético post-drag NO viene precedido de un `pointerdown`
// nuevo; un click real del usuario SÍ. Así que si llega un `pointerdown` antes
// del click, desarmamos. Timeout de respaldo por si no llega ningún click.
export function tragarClickSintetico(): void {
  const tragar = (ev: Event) => {
    ev.stopPropagation();
    ev.preventDefault();
    limpiar();
  };
  const limpiar = () => {
    clearTimeout(t);
    window.removeEventListener("click", tragar, true);
    window.removeEventListener("pointerdown", limpiar, true);
  };
  const t = setTimeout(limpiar, 500);
  window.addEventListener("click", tragar, { capture: true });
  window.addEventListener("pointerdown", limpiar, { capture: true });
}
