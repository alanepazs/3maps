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

  // ── Rama: a un costado del padre ────────────────────────────────────────
  // Posición ideal (la misma que arma "Ordenar"): pegada al lado del padre y
  // alineada arriba con él. Si está ocupada, se abre en anillos CERCA del
  // padre — prueba el otro lado y hasta 2 columnas más afuera, y unas pocas
  // filas arriba/abajo. Nunca se va lejos: si no hay lugar cerca, cae pegada
  // al lado preferido y `resolverSuperposiciones` / "Ordenar" la bajan por su
  // columna. (Antes caminaba hasta ~2700px hacia abajo buscando un hueco y el
  // globo quedaba suelto, lejísimo del padre — el bug de ramificar una rama.)
  const ramasHijas = hijos(a, parentId).filter((h) => h.rama !== "main");
  const nDer = ramasHijas.filter((h) => h.rama === "branch-right").length;
  const nIzq = ramasHijas.filter((h) => h.rama === "branch-left").length;
  const preferido: Rama = nDer <= nIzq ? "branch-right" : "branch-left";
  const opuesto: Rama =
    preferido === "branch-right" ? "branch-left" : "branch-right";

  const xLado = (rama: Rama, anillo: number) => {
    const afuera = anillo * (W_NUEVO + GAP_X);
    return rama === "branch-right"
      ? parent.x + pm.w + GAP_X + afuera
      : parent.x - (W_NUEVO + GAP_X) - afuera;
  };
  const PASO_Y = H_NUEVO + 40;

  let mejor: { x: number; y: number; rama: Rama } | null = null;
  let mejorCosto = Infinity;
  for (let anillo = 0; anillo <= 2; anillo++) {
    for (const rama of [preferido, opuesto]) {
      const x = xLado(rama, anillo);
      for (const fila of [0, 1, -1, 2, -2, 3, -3]) {
        const y = parent.y + fila * PASO_Y;
        if (!libre(x, y)) continue;
        // Bajar mucho por la columna del padre (fila grande) lo deja "suelto"
        // entre otras ramas; salir una columna al costado (anillo) a la altura
        // del padre se lee mejor como rama. Por eso `fila` pesa más que `anillo`.
        const costo =
          Math.abs(fila) * 1.5 +
          anillo * 2 +
          (rama === preferido ? 0 : 3) +
          (fila < 0 ? 0.5 : 0); // a igualdad, mejor bajar que subir
        if (costo < mejorCosto) {
          mejorCosto = costo;
          mejor = { x, y, rama };
        }
      }
    }
  }
  if (mejor) return mejor;
  // Todo ocupado cerca: pegada al lado preferido; el solapador la baja.
  return { x: xLado(preferido, 0), y: parent.y, rama: preferido };
}

// ── Empujar los globos que se PISAN, mínimamente (fase 3) ──────────────────
//
// Cuando una respuesta larga termina de llegar el globo crece más que el
// estimado y puede pisar a un hermano; al traer un árbol de otro dispositivo las
// posiciones son de otra pantalla. Esto empuja hacia abajo SOLO los que quedaron
// solapados (respeta la posición manual del resto). No re-acomoda el árbol como
// "Ordenar" — solo saca el solape. Pura.

const MARGEN_SOLAPE = 24;

export function resolverSuperposiciones(
  a: Arbol,
  medir: (id: string) => Medida,
): Map<string, { x: number; y: number }> | null {
  if (a.intercambios.length < 2) return null;
  const raiz = new Set(raices(a).map((r) => r.id));
  const pos = new Map(
    a.intercambios.map((i) => [i.id, { x: i.x, y: i.y }] as const),
  );
  const dim = new Map(a.intercambios.map((i) => [i.id, medir(i.id)] as const));
  const M = MARGEN_SOLAPE;
  let cambio = false;

  for (let pasada = 0; pasada < 8; pasada++) {
    const ids = [...pos.keys()].sort((x, y) => pos.get(x)!.y - pos.get(y)!.y);
    let movio = false;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const idA = ids[i];
        const idB = ids[j];
        const pa = pos.get(idA)!;
        const pb = pos.get(idB)!;
        const da = dim.get(idA)!;
        const db = dim.get(idB)!;
        const solapan =
          pa.x < pb.x + db.w + M &&
          pa.x + da.w + M > pb.x &&
          pa.y < pb.y + db.h + M &&
          pa.y + da.h + M > pb.y;
        if (!solapan) continue;
        // Mover el de más abajo (idB por el sort); si es raíz y idA no, mover idA.
        const [quieto, mueve] =
          raiz.has(idB) && !raiz.has(idA) ? [idB, idA] : [idA, idB];
        const q = pos.get(quieto)!;
        const qd = dim.get(quieto)!;
        pos.set(mueve, { x: pos.get(mueve)!.x, y: q.y + qd.h + M });
        movio = true;
        cambio = true;
      }
    }
    if (!movio) break;
  }
  return cambio ? new Map(pos) : null;
}
