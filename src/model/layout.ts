import type { Arbol, Intercambio, Rama } from "./intercambio";
import { buscar, hijos, raices } from "./intercambio";

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

// ── Ubicar UN globo nuevo sin pisar a ningún otro (fase 3) ─────────────────
//
// Al crear un hijo, se busca un lugar libre cerca del padre:
//   - "main"   → debajo del padre; si esa columna está ocupada (2ª "continuación"
//     del mismo padre = 2 troncos), se prueban columnas alternadas a los costados.
//   - "branch" → a un costado del padre, eligiendo el lado con MENOS ramas
//     (empate → derecha) para que el árbol quede parejo; si el lado preferido
//     está lleno, se prueba el otro y filas más abajo.
// El alto/ancho del globo nuevo todavía no se conoce (aún no se midió) → se usa
// un estimado. El botón "Ordenar" reacomoda todo prolijo después.

export type Medida = { w: number; h: number };
const W_NUEVO = ANCHO;
const H_NUEVO = 150;
const MARGEN = 28;

export function ubicarNuevoGlobo(
  a: Arbol,
  parentId: string,
  kind: "main" | "branch",
  medir: (id: string) => Medida,
): { x: number; y: number; rama: Rama } {
  const parent = buscar(a, parentId);
  if (!parent) return { x: 0, y: 0, rama: kind === "main" ? "main" : "branch-right" };
  const pm = medir(parentId);

  const rects = a.intercambios
    .filter((i) => i.id !== parentId)
    .map((i) => {
      const m = medir(i.id);
      return { x: i.x, y: i.y, w: m.w, h: m.h };
    });
  const choca = (r: { x: number; y: number; w: number; h: number }) =>
    rects.some(
      (o) =>
        r.x < o.x + o.w + MARGEN &&
        r.x + r.w + MARGEN > o.x &&
        r.y < o.y + o.h + MARGEN &&
        r.y + r.h + MARGEN > o.y,
    );
  const libre = (x: number, y: number) =>
    !choca({ x, y, w: W_NUEVO, h: H_NUEVO });

  if (kind === "main") {
    const baseY = parent.y + pm.h + GAP_Y;
    const cols = [0, 1, -1, 2, -2, 3, -3, 4, -4];
    for (let fila = 0; fila < 4; fila++) {
      const y = baseY + fila * (H_NUEVO + 200);
      for (const c of cols) {
        const x = parent.x + c * (W_NUEVO + 90);
        if (libre(x, y)) return { x, y, rama: "main" };
      }
    }
    return { x: parent.x, y: baseY, rama: "main" };
  }

  // Rama: lado con menos ramas primero (empate → derecha).
  const ramas = hijos(a, parentId).filter((h) => h.rama !== "main");
  const nDer = ramas.filter((h) => h.rama === "branch-right").length;
  const nIzq = ramas.filter((h) => h.rama === "branch-left").length;
  const orden: Rama[] =
    nDer <= nIzq
      ? ["branch-right", "branch-left"]
      : ["branch-left", "branch-right"];
  for (const rama of orden) {
    const x =
      rama === "branch-right"
        ? parent.x + pm.w + GAP_X
        : parent.x - (W_NUEVO + GAP_X);
    for (let k = 0; k < 12; k++) {
      const y = parent.y + k * (H_NUEVO + 80);
      if (libre(x, y)) return { x, y, rama };
    }
  }
  return { x: parent.x + pm.w + GAP_X, y: parent.y, rama: "branch-right" };
}
