"use client";

// Registro de mapas (fase 3.5). Cada mapa es un árbol independiente.
//
//   localStorage["3maps:mapas"]      = { [mapId]: { titulo, creado } }
//   localStorage["3maps:mapaActivo"] = mapId
//   localStorage["3maps:arbol:<id>"] = el árbol de ese mapa (un .md por intercambio)
//   localStorage["3maps:vista:<id>"] = prefs de vista (colapsado/expandido) de ese mapa
//
// Migración del formato viejo (un solo "3maps:arbol"): al leer por primera vez
// se crea el mapa "principal" y se mueve el árbol/vista viejos a sus claves.

export type MetaMapa = { titulo: string; creado: string; renombrado?: string };
export type Mapas = Record<string, MetaMapa>;

// Marca de tiempo del último cambio de nombre (o de creación si nunca se
// renombró). Es reloj del navegador — el índice de mapas es UN blob JSON, no
// hay `updated_at` por mapa como en los árboles. Sirve para LWW de títulos
// entre dispositivos (los renames son raros y de a uno → alcanza).
export function cuandoMeta(meta: MetaMapa): string {
  return meta.renombrado ?? meta.creado ?? "";
}

const MAPAS_KEY = "3maps:mapas";
const ACTIVO_KEY = "3maps:mapaActivo";
const ARBOL_LEGACY_KEY = "3maps:arbol";

export const ID_PRINCIPAL = "principal";
export const arbolKey = (mapId: string) => `3maps:arbol:${mapId}`;

export function nuevoMapaId(): string {
  const hex =
    typeof crypto !== "undefined" && crypto.getRandomValues
      ? Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("")
      : Math.random().toString(16).slice(2, 10).padStart(8, "0");
  return `mapa-${hex}`;
}

function ls(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

// Lee el registro. Migra el formato viejo SOLO la primera vez (cuando `MAPAS_KEY`
// nunca se escribió). Si `MAPAS_KEY` ya existe — aunque sea `{}` porque borraste
// todos los mapas — NO re-crea "principal" (eso resucitaba mapas fantasma).
export function leerMapas(): Mapas {
  const store = ls();
  if (!store) return {};
  const raw = store.getItem(MAPAS_KEY);
  if (raw !== null) {
    try {
      const m = JSON.parse(raw) as Mapas;
      if (m && typeof m === "object") return m;
    } catch {
      // corrupto → cae a la migración
    }
  }

  // Primera vez: crear "principal" + mover el árbol legacy si lo hay.
  const mapas: Mapas = {
    [ID_PRINCIPAL]: { titulo: "Mi mapa", creado: new Date().toISOString() },
  };
  try {
    const arbolViejo = store.getItem(ARBOL_LEGACY_KEY);
    if (arbolViejo && !store.getItem(arbolKey(ID_PRINCIPAL))) {
      store.setItem(arbolKey(ID_PRINCIPAL), arbolViejo);
      store.removeItem(ARBOL_LEGACY_KEY);
    }
    store.setItem(MAPAS_KEY, JSON.stringify(mapas));
    if (!store.getItem(ACTIVO_KEY)) store.setItem(ACTIVO_KEY, ID_PRINCIPAL);
  } catch {
    // ignorar
  }
  return mapas;
}

export function guardarMapas(m: Mapas): void {
  try {
    ls()?.setItem(MAPAS_KEY, JSON.stringify(m));
  } catch {
    // ignorar
  }
}

export function mapaActivoId(): string {
  const mapas = leerMapas();
  const store = ls();
  const guardado = store?.getItem(ACTIVO_KEY) ?? null;
  if (guardado && mapas[guardado]) return guardado;
  const primero = Object.keys(mapas)[0] ?? ID_PRINCIPAL;
  try {
    store?.setItem(ACTIVO_KEY, primero);
  } catch {
    // ignorar
  }
  return primero;
}

// Garantiza que haya AL MENOS un mapa (crea uno vacío si el registro quedó en
// `{}` — p. ej. tras borrar todos). Devuelve el registro y el mapa activo.
export function asegurarUnMapa(): { mapas: Mapas; activo: string } {
  let mapas = leerMapas();
  let activo = mapaActivoId();
  if (!mapas[activo]) {
    const ids = Object.keys(mapas);
    if (ids.length > 0) {
      activo = ids[0];
    } else {
      activo = nuevoMapaId();
      mapas = { [activo]: { titulo: "Mi mapa", creado: new Date().toISOString() } };
      guardarMapas(mapas);
    }
    setMapaActivo(activo);
  }
  return { mapas, activo };
}

export function setMapaActivo(mapId: string): void {
  try {
    ls()?.setItem(ACTIVO_KEY, mapId);
  } catch {
    // ignorar
  }
}

export function crearMapa(titulo: string): string {
  const id = nuevoMapaId();
  const m = leerMapas();
  m[id] = { titulo: titulo.trim() || "Mapa sin título", creado: new Date().toISOString() };
  guardarMapas(m);
  return id;
}

// Primer "Mapa N" que no esté usado localmente (no `count + 1` — así no genera
// "Mapa 2" cuando ya tenés un "Mapa 2" traído de otro dispositivo).
export function nombreMapaLibre(): string {
  const usados = new Set(Object.values(leerMapas()).map((x) => x.titulo));
  let n = 1;
  while (usados.has(`Mapa ${n}`)) n++;
  return `Mapa ${n}`;
}

export function renombrarMapa(mapId: string, titulo: string): Mapas {
  const m = leerMapas();
  if (m[mapId]) {
    m[mapId] = {
      ...m[mapId],
      titulo: titulo.trim() || m[mapId].titulo,
      renombrado: new Date().toISOString(),
    };
    guardarMapas(m);
  }
  return m;
}

// Borra el mapa y su árbol/vista. NO cambia el mapa activo (lo hace el caller).
export function borrarMapa(mapId: string): Mapas {
  const m = leerMapas();
  delete m[mapId];
  guardarMapas(m);
  try {
    ls()?.removeItem(arbolKey(mapId));
  } catch {
    // ignorar
  }
  return m;
}

// Trae de la nube lo que falte localmente (sync de la lista de mapas, fase 3.5).
// - Mapa que no existe local → se agrega. Si el título choca con otro (distinto
//   id) le agrega " (2)" (p. ej. dos dispositivos que crearon "Mapa 2" a la vez).
// - Mapa que YA existe local → se adopta el título de la nube SOLO si su rename
//   es más nuevo (LWW por `cuandoMeta`). Antes esto se salteaba → los renames
//   de otro dispositivo nunca llegaban.
export function fusionarMapasNube(nube: Mapas): Mapas {
  const m = leerMapas();
  const titulos = new Set(Object.values(m).map((x) => x.titulo));
  let cambio = false;
  for (const [id, meta] of Object.entries(nube)) {
    if (m[id]) {
      if (
        meta.titulo !== m[id].titulo &&
        cuandoMeta(meta) > cuandoMeta(m[id])
      ) {
        m[id] = { ...m[id], titulo: meta.titulo, renombrado: meta.renombrado };
        cambio = true;
      }
      continue;
    }
    let titulo = meta.titulo;
    if (titulos.has(titulo)) {
      let i = 2;
      while (titulos.has(`${meta.titulo} (${i})`)) i++;
      titulo = `${meta.titulo} (${i})`;
    }
    m[id] = { ...meta, titulo };
    titulos.add(titulo);
    cambio = true;
  }
  if (cambio) guardarMapas(m);
  return m;
}

// Quita del registro local los mapas tombstoneados en la nube (+ sus árboles).
// `excepto` = el mapa activo (no borrárselo al usuario debajo de los pies).
export function podarMapasBorrados(borrados: string[], excepto?: string): Mapas {
  const m = leerMapas();
  let cambio = false;
  for (const id of borrados) {
    if (id === excepto || !m[id]) continue;
    delete m[id];
    cambio = true;
    try {
      ls()?.removeItem(arbolKey(id));
    } catch {
      // ignorar
    }
  }
  if (cambio) guardarMapas(m);
  return m;
}
