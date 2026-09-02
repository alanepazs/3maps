"use client";

// Tras soltar un drag de resize (manija ◢ del globo o borde del panel) el
// navegador dispara un `click` sintético. Si ese click cae sobre el **fondo del
// lienzo** (`.react-flow__pane`) o el **backdrop del panel**, deselecciona el
// globo o cierra el panel sin que el usuario lo haya pedido. Hay que tragarse
// **ese** click — y solo ese.
//
// F5-4c: antes se distinguía "sintético" de "real" por TIEMPO (ventana de 150ms
// desde que se armaba). Era frágil: un click real y rápido sobre otro control
// (el `⌄` del composer, un botón del toolbar) caía dentro de la ventana y se
// perdía → "el `⌄` pide doble clic" (F5-0 y F5-4b no lo terminaron de resolver).
// Ahora el discriminante es DÓNDE cae el click: se traga solo si el `target` es
// exactamente el fondo del lienzo o un backdrop marcado con `data-cierra-al-click`.
// Un click sobre cualquier botón/textarea/nodo pasa intacto.
const SELECTOR_DESCARTABLE = ".react-flow__pane, [data-cierra-al-click]";

export function tragarClickSintetico(): void {
  const desarmar = () => {
    window.removeEventListener("click", tragar, true);
    clearTimeout(backstop);
  };
  const tragar = (ev: MouseEvent) => {
    const t = ev.target as Element | null;
    // `matches`, no `closest`: los nodos viven DENTRO de `.react-flow__pane`, y
    // un click sobre el contenido de un nodo no debe tragarse. El click que
    // deselecciona / cierra tiene como target el elemento de fondo en sí.
    if (t && typeof t.matches === "function" && t.matches(SELECTOR_DESCARTABLE)) {
      ev.stopPropagation();
      ev.preventDefault();
      desarmar();
    }
    // Un click que NO cae en el fondo (p. ej. el sintético sobre la manija, o un
    // click real sobre otro control) se deja pasar y NO desarma: el sintético
    // "malo" sobre el fondo puede llegar justo después. El backstop corta igual.
  };
  // Si el puntero no generó ningún click sintético, desarmar y listo.
  const backstop = setTimeout(
    () => window.removeEventListener("click", tragar, true),
    400,
  );
  window.addEventListener("click", tragar, { capture: true });
}
