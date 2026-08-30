import type { Arbol, Intercambio } from "./intercambio";
import { hijos, raices } from "./intercambio";

// Auto-layout del árbol a su forma canónica (fase 3.4, botón "Ordenar"):
//
//   - Tronco principal (cadena de `rama: "main"` desde la raíz) en VERTICAL.
//   - Cada rama (`branch-left` / `branch-right`) + su subárbol → en una COLUMNA
//     al costado (izq / der según su `rama`), con su propio tronco `main`
//     bajando en vertical y sus sub-ramas más al costado todavía.
//   - Varias ramas del mismo lado se apilan hacia abajo.
//   - Varias raíces se apilan una debajo de la otra.
//
// Función pura: recibe el árbol + cómo medir el alto de cada globo (React Flow
// mide los nodos → `getNode(id)?.measured?.height`) y devuelve las posiciones
// nuevas. El caller las escribe al árbol y a los nodos.

const ANCHO = 260; // ancho fijo del globo (MessageNode)
const GAP_X = 140; // separación horizontal entre un globo y su columna de rama
const GAP_Y = 64; // separación vertical entre globos apilados
const ALTO_FALLBACK = 130; // si el nodo todavía no fue medido

export function calcularLayout(
  a: Arbol,
  alturaDe: (id: string) => number | undefined,
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const vistos = new Set<string>();
  const alto = (ic: Intercambio) => alturaDe(ic.id) ?? ALTO_FALLBACK;

  // Coloca `ic` en (x, y) y todo su subárbol. Devuelve el `y` inferior que
  // ocupó el subárbol (para apilar lo que venga después).
  function ubicar(ic: Intercambio, x: number, y: number): number {
    if (vistos.has(ic.id)) return y; // guarda anti-ciclo
    vistos.add(ic.id);
    pos.set(ic.id, { x, y });

    const hs = hijos(a, ic.id);
    const izq = hs.filter((h) => h.rama === "branch-left");
    const der = hs.filter((h) => h.rama === "branch-right");
    const mains = hs.filter((h) => h.rama === "main");

    let fondo = y + alto(ic);

    // Ramas: columnas al costado, alineadas arriba con este globo.
    let yIzq = y;
    for (const b of izq) {
      yIzq = ubicar(b, x - (ANCHO + GAP_X), yIzq) + GAP_Y;
      fondo = Math.max(fondo, yIzq - GAP_Y);
    }
    let yDer = y;
    for (const b of der) {
      yDer = ubicar(b, x + (ANCHO + GAP_X), yDer) + GAP_Y;
      fondo = Math.max(fondo, yDer - GAP_Y);
    }

    // Tronco: sigue derecho hacia abajo, debajo del alto real de este globo.
    let yMain = y + alto(ic) + GAP_Y;
    for (const m of mains) {
      yMain = ubicar(m, x, yMain) + GAP_Y;
      fondo = Math.max(fondo, yMain - GAP_Y);
    }

    return fondo;
  }

  let y = 0;
  for (const r of raices(a)) {
    y = ubicar(r, 0, y) + GAP_Y * 2;
  }
  return pos;
}
