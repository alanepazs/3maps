import type { Edge, Node } from "@xyflow/react";

// Modelo de datos de fase 1. Un **intercambio** = un globo del canvas = una
// pregunta + su respuesta. El árbol de intercambios es la fuente de la verdad;
// los nodos/edges de React Flow se derivan de él (ver `arbolAVista`).
//
// La forma acá coincide con el frontmatter del `.md` de la spec (§3):
// `id`, `padre_id`, `rama`, `x`, `y`, `proveedor`, `fecha` + `## Pregunta` /
// `## Respuesta`. Ver `toMarkdown` / `parseMarkdown`.

export type Rama = "main" | "branch-left" | "branch-right";

// Un archivo adjuntado a un intercambio (T16). Vive en el `.md` del intercambio,
// en el frontmatter como JSON en una línea. Se manda a la IA SOLO en el turno de
// ese intercambio (no se re-manda cuando el globo es contexto de un hijo).
export type TipoAdjunto = "texto" | "imagen" | "pdf";
export type Adjunto = {
  nombre: string; // "notas.md", "captura.png"
  tipo: TipoAdjunto;
  mime: string; // "text/markdown", "image/png", "application/pdf"
  // tipo "texto": el contenido del archivo tal cual (UTF-8).
  // tipo "imagen" | "pdf": base64 SIN el prefijo `data:...;base64,` ni saltos de línea.
  contenido: string;
};
export type Proveedor =
  | "claude"
  | "deepseek"
  | "gpt"
  | "gemini"
  | "groq"
  | "openrouter"
  | "huggingface";

export const RAMAS: readonly Rama[] = ["main", "branch-left", "branch-right"];

// Color del globo (B1). Paleta fija de 6 slots + null (sin color). Se guarda por
// SLUG en el `.md` (`color: ambar`) — legible y estable. El hex para pintar vive
// en `MessageNode`. Se marca en la esquina del header del globo.
export const COLORES_GLOBO = [
  "ambar",
  "verde",
  "rojo",
  "cian",
  "violeta",
  "rosa",
] as const;
export type ColorGlobo = (typeof COLORES_GLOBO)[number];

export const PROVEEDORES: readonly Proveedor[] = [
  "claude",
  "deepseek",
  "gpt",
  "gemini",
  "groq",
  "openrouter",
  "huggingface",
];

export type Intercambio = {
  id: string;
  // null = raíz del árbol. El `padreId` define las flechas (no hay tabla de edges).
  padreId: string | null;
  // De qué lado sale la flecha del padre. `main` = tronco (por abajo);
  // `branch-*` = rama (por un costado). El usuario lo cambia arrastrando.
  rama: Rama;
  // Posición manual en el canvas. Solo se sugiere una al crear el nodo.
  x: number;
  y: number;
  // Tamaño manual del globo (fase 3.10). `null` = automático. Va al `.md` como
  // `x`/`y` → sincroniza entre dispositivos.
  ancho: number | null;
  alto: number | null;
  // Color del globo (B1). `null` = sin color. Se toma el de la CABEZA del tramo.
  color: ColorGlobo | null;
  // null hasta que una IA responde de verdad.
  proveedor: Proveedor | null;
  fecha: string; // ISO
  pregunta: string;
  respuesta: string | null;
  // La respuesta está en curso (llamada a la IA disparada, sin volver todavía).
  pending: boolean;
  // Último error al intentar responder este intercambio (para poder reintentar).
  error: string | null;
  // Tokens que reportó el proveedor en la última respuesta (T11). `null` si el
  // proveedor no devolvió `usage`. Van al `.md` como `tokens_in` / `tokens_out`.
  tokensEntrada: number | null;
  tokensSalida: number | null;
  // Archivos adjuntados a la pregunta (T16). `[]` = ninguno.
  adjuntos: Adjunto[];
};

export type Arbol = {
  // Orden de inserción. No tiene significado semántico (la estructura la define
  // `padreId`), pero se mantiene estable para render y serialización.
  intercambios: Intercambio[];
};

// ── Identidad ──────────────────────────────────────────────────────────────

export function nuevoId(): string {
  const hex =
    typeof crypto !== "undefined" && crypto.getRandomValues
      ? Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("")
      : Math.random().toString(16).slice(2, 10).padStart(8, "0");
  return `nodo-${hex}`;
}

export function crearIntercambio(campos: {
  id?: string;
  padreId: string | null;
  rama: Rama;
  pregunta: string;
  respuesta?: string | null;
  proveedor?: Proveedor | null;
  x: number;
  y: number;
  fecha?: string;
  pending?: boolean;
  error?: string | null;
  adjuntos?: Adjunto[];
}): Intercambio {
  return {
    id: campos.id ?? nuevoId(),
    padreId: campos.padreId,
    rama: campos.rama,
    x: campos.x,
    y: campos.y,
    ancho: null,
    alto: null,
    color: null,
    proveedor: campos.proveedor ?? null,
    fecha: campos.fecha ?? new Date().toISOString(),
    pregunta: campos.pregunta,
    respuesta: campos.respuesta ?? null,
    pending: campos.pending ?? false,
    error: campos.error ?? null,
    tokensEntrada: null,
    tokensSalida: null,
    adjuntos: campos.adjuntos ?? [],
  };
}

// ── Consultas (puras) ──────────────────────────────────────────────────────

export function buscar(a: Arbol, id: string): Intercambio | null {
  return a.intercambios.find((i) => i.id === id) ?? null;
}

export function padre(a: Arbol, id: string): Intercambio | null {
  const ic = buscar(a, id);
  return ic?.padreId ? buscar(a, ic.padreId) : null;
}

export function hijos(a: Arbol, id: string): Intercambio[] {
  return a.intercambios.filter((i) => i.padreId === id);
}

export function descendientes(a: Arbol, id: string): Intercambio[] {
  const out: Intercambio[] = [];
  const pila = [...hijos(a, id)];
  while (pila.length) {
    const ic = pila.pop() as Intercambio;
    out.push(ic);
    pila.push(...hijos(a, ic.id));
  }
  return out;
}

export function raices(a: Arbol): Intercambio[] {
  return a.intercambios.filter((i) => i.padreId === null);
}

// Camino de intercambios desde la raíz hasta `id` (inclusive). Lo usa el armado
// de contexto para la IA (spec §4): solo este camino, nunca el árbol entero.
export function caminoRaizA(a: Arbol, id: string): Intercambio[] {
  const camino: Intercambio[] = [];
  const vistos = new Set<string>();
  let ic = buscar(a, id);
  while (ic && !vistos.has(ic.id)) {
    camino.unshift(ic);
    vistos.add(ic.id);
    ic = ic.padreId ? buscar(a, ic.padreId) : null;
  }
  return camino;
}

// ── Tramos (Fase 5) ────────────────────────────────────────────────────────
// Un **tramo** = una cadena maximal de intercambios unidos por `rama: "main"`,
// empezando en la raíz o en el destino de una rama. Es la unidad VISUAL (un
// globo = un tramo); el intercambio sigue siendo la unidad de datos. Las ramas
// (`rama != "main"`) salen de cualquier intercambio del tramo sin cortarlo.

export type Tramo = { cabezaId: string; intercambios: Intercambio[] };

// El primer hijo `main` de cada intercambio (la continuación del tramo). Si hay
// 2+ hijos `main` del mismo padre (raro: "continuar" desde el medio), solo el
// primero continúa; los demás quedan como cabeza de su propio tramo.
function continuacionesMain(a: Arbol): Map<string, string> {
  const cont = new Map<string, string>();
  for (const ic of a.intercambios) {
    if (ic.padreId && ic.rama === "main" && !cont.has(ic.padreId)) {
      cont.set(ic.padreId, ic.id);
    }
  }
  return cont;
}

export function calcularTramos(a: Arbol): Tramo[] {
  const cont = continuacionesMain(a);
  const esCont = new Set(cont.values());
  const porId = new Map(a.intercambios.map((ic) => [ic.id, ic]));
  const tramos: Tramo[] = [];
  for (const ic of a.intercambios) {
    if (esCont.has(ic.id)) continue; // no es cabeza
    const chain: Intercambio[] = [];
    const visto = new Set<string>();
    let cur: Intercambio | undefined = ic;
    while (cur && !visto.has(cur.id)) {
      chain.push(cur);
      visto.add(cur.id);
      const sig = cont.get(cur.id);
      cur = sig ? porId.get(sig) : undefined;
    }
    tramos.push({ cabezaId: ic.id, intercambios: chain });
  }
  return tramos;
}

// Los intercambios del tramo cuya cabeza es `cabezaId` (o `[]` si no existe).
export function tramoDesde(a: Arbol, cabezaId: string): Intercambio[] {
  const cont = continuacionesMain(a);
  const porId = new Map(a.intercambios.map((ic) => [ic.id, ic]));
  const chain: Intercambio[] = [];
  const visto = new Set<string>();
  let cur = porId.get(cabezaId);
  while (cur && !visto.has(cur.id)) {
    chain.push(cur);
    visto.add(cur.id);
    const sig = cont.get(cur.id);
    cur = sig ? porId.get(sig) : undefined;
  }
  return chain;
}

// La cabeza del tramo que contiene `id` (subiendo mientras `rama === "main"`).
export function cabezaDeTramo(a: Arbol, id: string): string {
  let cur = buscar(a, id);
  const visto = new Set<string>();
  while (cur?.padreId && cur.rama === "main" && !visto.has(cur.id)) {
    visto.add(cur.id);
    cur = buscar(a, cur.padreId);
  }
  return cur?.id ?? id;
}

export function esDescendiente(
  a: Arbol,
  id: string,
  posibleAncestro: string,
): boolean {
  let ic = buscar(a, id);
  const vistos = new Set<string>();
  while (ic?.padreId && !vistos.has(ic.id)) {
    if (ic.padreId === posibleAncestro) return true;
    vistos.add(ic.id);
    ic = buscar(a, ic.padreId);
  }
  return false;
}

// ── Mutaciones (puras: devuelven un Arbol nuevo) ───────────────────────────

export function agregar(a: Arbol, ic: Intercambio): Arbol {
  return { intercambios: [...a.intercambios, ic] };
}

export function quitarSubarbol(a: Arbol, id: string): Arbol {
  const fuera = new Set([id, ...descendientes(a, id).map((i) => i.id)]);
  return { intercambios: a.intercambios.filter((i) => !fuera.has(i.id)) };
}

function mapear(
  a: Arbol,
  id: string,
  f: (ic: Intercambio) => Intercambio,
): Arbol {
  return { intercambios: a.intercambios.map((i) => (i.id === id ? f(i) : i)) };
}

export function conPosicion(a: Arbol, id: string, x: number, y: number): Arbol {
  return mapear(a, id, (i) => (i.x === x && i.y === y ? i : { ...i, x, y }));
}

// Tamaño manual del globo. `null`/`null` = volver al automático.
export function conTamano(
  a: Arbol,
  id: string,
  ancho: number | null,
  alto: number | null,
): Arbol {
  return mapear(a, id, (i) =>
    i.ancho === ancho && i.alto === alto ? i : { ...i, ancho, alto },
  );
}

export function conRama(a: Arbol, id: string, rama: Rama): Arbol {
  return mapear(a, id, (i) => (i.rama === rama ? i : { ...i, rama }));
}

// Color del globo (B1). `null` = sin color. Se aplica a la CABEZA del tramo.
export function conColor(
  a: Arbol,
  id: string,
  color: ColorGlobo | null,
): Arbol {
  return mapear(a, id, (i) => (i.color === color ? i : { ...i, color }));
}

export function conRespuesta(
  a: Arbol,
  id: string,
  campos: {
    respuesta: string | null;
    proveedor?: Proveedor | null;
    pending?: boolean;
    // Solo se pasan en la escritura final (con el `usage` del proveedor). Durante
    // el streaming se omiten → se preservan los que ya había. `null` explícito
    // los limpia (reintento).
    tokensEntrada?: number | null;
    tokensSalida?: number | null;
  },
): Arbol {
  return mapear(a, id, (i) => ({
    ...i,
    respuesta: campos.respuesta,
    proveedor: campos.proveedor ?? i.proveedor,
    pending: campos.pending ?? false,
    // Una respuesta (aunque sea parcial en streaming) limpia el error previo.
    error: campos.pending ? i.error : null,
    tokensEntrada:
      campos.tokensEntrada !== undefined ? campos.tokensEntrada : i.tokensEntrada,
    tokensSalida:
      campos.tokensSalida !== undefined ? campos.tokensSalida : i.tokensSalida,
  }));
}

export function conError(a: Arbol, id: string, error: string | null): Arbol {
  return mapear(a, id, (i) => ({ ...i, error, pending: false }));
}

// Reengancha `id` bajo otro padre (guarda contra ciclos). Lo usa el conectar
// handles a mano en el canvas.
export function reparentar(
  a: Arbol,
  id: string,
  nuevoPadreId: string,
  rama: Rama,
): Arbol {
  if (id === nuevoPadreId) return a;
  if (!buscar(a, id) || !buscar(a, nuevoPadreId)) return a;
  if (nuevoPadreId === id || esDescendiente(a, nuevoPadreId, id)) return a;
  return mapear(a, id, (i) => ({ ...i, padreId: nuevoPadreId, rama }));
}

// ── Derivación a React Flow ────────────────────────────────────────────────
// Un nodo = un TRAMO (Fase 5). `id` del nodo = id del intercambio cabeza. El
// `data` lleva `intercambios` (el tramo entero, para que `MessageNode` lo
// renderice) + un `rev` que resume lo que afecta al render (para la
// reconciliación de `FlowCanvas` — `datosIguales` ignora el array).

// Firma corta del estado renderable de un intercambio.
function revIc(ic: Intercambio): string {
  return `${ic.id}~${ic.respuesta?.length ?? 0}${ic.pending ? "P" : ""}${
    ic.error ? "E" : ""
  }a${ic.adjuntos.length}`;
}

export function arbolAVista(a: Arbol): { nodes: Node[]; edges: Edge[] } {
  const tramos = calcularTramos(a);
  const conHijos = new Set(
    a.intercambios.map((ic) => ic.padreId).filter((p): p is string => p !== null),
  );
  // intercambio id → cabeza de su tramo
  const cabezaDe = new Map<string, string>();
  for (const t of tramos) {
    for (const ic of t.intercambios) cabezaDe.set(ic.id, t.cabezaId);
  }

  const nodes: Node[] = tramos.map((t) => {
    const cabeza = t.intercambios[0];
    const ultimo = t.intercambios[t.intercambios.length - 1];
    return {
      id: t.cabezaId,
      type: "message",
      position: { x: cabeza.x, y: cabeza.y },
      data: {
        intercambios: t.intercambios,
        n: t.intercambios.length,
        // Para el label alejado y compat con lo que leía `pregunta`/`respuesta`.
        pregunta: cabeza.pregunta,
        respuesta: ultimo.respuesta,
        pending: ultimo.pending,
        error: ultimo.error,
        isRoot: cabeza.padreId === null,
        // Se puede borrar aunque sea raíz si nada cuelga de la punta (fase 3.6).
        sinHijos: !conHijos.has(ultimo.id),
        ancho: cabeza.ancho,
        alto: cabeza.alto,
        color: cabeza.color,
        adjuntosN: t.intercambios.reduce((s, ic) => s + ic.adjuntos.length, 0),
        rev: `${t.intercambios.map(revIc).join("|")}#${cabeza.ancho}x${cabeza.alto}x${cabeza.color}`,
      },
    };
  });

  const edges: Edge[] = [];
  for (const ic of a.intercambios) {
    if (ic.padreId === null) continue;
    if (cabezaDe.get(ic.id) !== ic.id) continue; // solo las cabezas tienen edge de entrada
    const source = cabezaDe.get(ic.padreId);
    if (!source) continue;
    edges.push({
      id: `e-${ic.padreId}-${ic.id}`,
      source,
      target: ic.id,
      // SALE del tramo padre por el handle que se llama igual que la rama.
      sourceHandle: ic.rama,
      // ENTRA a la cabeza del tramo hijo por el costado opuesto; el tronco
      // (`main` — una 2ª continuación) entra por arriba.
      targetHandle:
        ic.rama === "branch-right"
          ? "t-left"
          : ic.rama === "branch-left"
            ? "t-right"
            : "t-top",
      // El intercambio del que se ramificó (para anclar el edge más adelante).
      data: { desdeId: ic.padreId },
    });
  }
  return { nodes, edges };
}

// ── Serialización `.md` ────────────────────────────────────────────────────

const TIPOS_ADJUNTO: readonly TipoAdjunto[] = ["texto", "imagen", "pdf"];

// Parsea el `adjuntos:` del frontmatter con validación. Si el JSON está roto o
// un item no valida → se descarta ese item (no rompe la carga del árbol).
function parseAdjuntos(raw: string): Adjunto[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (x): x is Adjunto =>
        !!x &&
        typeof x.nombre === "string" &&
        typeof x.mime === "string" &&
        typeof x.contenido === "string" &&
        (TIPOS_ADJUNTO as string[]).includes(x.tipo),
    );
  } catch {
    return [];
  }
}

export function toMarkdown(ic: Intercambio): string {
  const front = [
    `id: ${ic.id}`,
    `padre_id: ${ic.padreId ?? ""}`,
    `rama: ${ic.rama}`,
    `x: ${ic.x}`,
    `y: ${ic.y}`,
    `ancho: ${ic.ancho ?? ""}`,
    `alto: ${ic.alto ?? ""}`,
    // Color del globo (B1). Slug de la paleta o vacío. `.md` viejo sin la línea
    // parsea igual (color = null).
    `color: ${ic.color ?? ""}`,
    // Tokens reportados por el proveedor (T11). Vacío si no los devolvió.
    `tokens_in: ${ic.tokensEntrada ?? ""}`,
    `tokens_out: ${ic.tokensSalida ?? ""}`,
    `proveedor: ${ic.proveedor ?? ""}`,
    `fecha: ${ic.fecha}`,
    // El error va en el frontmatter (JSON en una línea) y no como sección del
    // cuerpo: la respuesta es markdown y puede tener sus propios `## títulos`.
    `error: ${ic.error !== null ? JSON.stringify(ic.error) : ""}`,
    // Se persiste para poder recuperar una llamada que quedó a medias: al
    // recargar, un `pendiente` sin terminar pasa a ser un error reintentable.
    `pendiente: ${ic.pending ? "1" : ""}`,
    // Archivos adjuntos (T16): JSON en una línea (los `contenido` — texto
    // escapado o base64 — no tienen saltos de línea reales tras JSON.stringify,
    // así que no rompen el parser de frontmatter). Vacío = sin adjuntos.
    `adjuntos: ${ic.adjuntos.length > 0 ? JSON.stringify(ic.adjuntos) : ""}`,
  ].join("\n");
  return (
    `---\n${front}\n---\n\n` +
    `## Pregunta\n\n${ic.pregunta}\n\n` +
    `## Respuesta\n\n${ic.respuesta ?? ""}\n`
  );
}

export function parseMarkdown(
  texto: string,
  opts?: { deOtroDispositivo?: boolean },
): Intercambio | null {
  const m = texto.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;

  const meta: Record<string, string> = {};
  for (const linea of m[1].split("\n")) {
    const i = linea.indexOf(":");
    if (i === -1) continue;
    meta[linea.slice(0, i).trim()] = linea.slice(i + 1).trim();
  }
  if (!meta.id) return null;

  // Pregunta: entre `## Pregunta` y `## Respuesta` (la pregunta es texto plano
  // corto, no tiene `## Respuesta` adentro). Respuesta: de `## Respuesta` al
  // final (puede ser markdown con títulos propios).
  const cuerpo = m[2];
  const preg = cuerpo.match(/(?:^|\n)##[ \t]*Pregunta[ \t]*\n([\s\S]*?)\n##[ \t]*Respuesta[ \t]*\n/);
  const resp = cuerpo.match(/(?:^|\n)##[ \t]*Respuesta[ \t]*\n([\s\S]*)$/);
  const respuestaTxt = (resp?.[1] ?? "").trim();

  let error: string | null = null;
  if (meta.error) {
    try {
      const v = JSON.parse(meta.error);
      error = typeof v === "string" ? v : String(v);
    } catch {
      error = meta.error;
    }
  }

  // Una llamada `pendiente:` que no terminó.
  //  - al recargar / árbol compartido: no hay llamada en vuelo → error reintentable.
  //  - bajando de la nube (`deOtroDispositivo`): el OTRO dispositivo probablemente
  //    la está streameando ahora → mostrarla como "escribiendo…", no como error.
  //    El poll de `useSync` la actualiza cuando el otro termina.
  let pending = false;
  if (!error && meta.pendiente === "1") {
    if (opts?.deOtroDispositivo) {
      pending = true;
    } else {
      error =
        "La respuesta quedó a medias (se cerró la app o se cortó la llamada). Reintentá.";
    }
  }

  return {
    id: meta.id,
    padreId: meta.padre_id ? meta.padre_id : null,
    rama: (RAMAS as string[]).includes(meta.rama)
      ? (meta.rama as Rama)
      : "main",
    x: Number(meta.x) || 0,
    y: Number(meta.y) || 0,
    ancho: Number(meta.ancho) || null,
    alto: Number(meta.alto) || null,
    color: (COLORES_GLOBO as readonly string[]).includes(meta.color)
      ? (meta.color as ColorGlobo)
      : null,
    tokensEntrada: Number(meta.tokens_in) || null,
    tokensSalida: Number(meta.tokens_out) || null,
    proveedor: (PROVEEDORES as string[]).includes(meta.proveedor)
      ? (meta.proveedor as Proveedor)
      : null,
    fecha: meta.fecha || new Date().toISOString(),
    pregunta: (preg?.[1] ?? "").trim(),
    respuesta: respuestaTxt === "" ? null : respuestaTxt,
    pending,
    error,
    adjuntos: parseAdjuntos(meta.adjuntos ?? ""),
  };
}

// ── Árbol inicial ─────────────────────────────────────────────────────────
// Vacío: un árbol nuevo arranca sin globos. El primer submit del Composer crea
// la raíz (ver `handleSubmit` en FlowCanvas). Determinístico → SSR-safe.

export function arbolInicial(): Arbol {
  return { intercambios: [] };
}
