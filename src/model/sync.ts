"use client";

import { parseMarkdown, toMarkdown, type Arbol } from "./intercambio";
import { ID_PRINCIPAL, type Mapas } from "./mapas";
import { getSupabase } from "./supabase";

// Sync entre dispositivos (fase 2.4, per-mapa desde fase 3.5). Solo con sesión.
//
// Estrategia: **last-write-wins**, sin detección de conflicto (decidido con el
// usuario). Bucket PRIVADO `sync`. Un archivo por mapa: `<uid>/<mapId>.json`
// (el mapa "principal" migra desde el viejo `<uid>/arbol.json`).
//
// El ORDEN lo define la **hora del servidor de Supabase** (el `updated_at` que
// Storage le pone al objeto), NUNCA `new Date()` del navegador — los relojes de
// los dispositivos no coinciden y eso rompía el LWW (ping-pong).
//
// `localStorage["3maps:sync:<mapId>"] = { at, hash, uid }`:
//   - `at`   = el `updated_at` (del servidor) de la versión que sincronizamos.
//   - `hash` = hash del contenido de esa versión (para saber si lo local cambió
//     sin haberse subido todavía).
//   - `uid`  = a qué cuenta pertenece el árbol local.
//
// Además `<uid>/_mapas.json` = índice `{ [mapId]: {titulo, creado} }` para que
// la LISTA de mapas aparezca en todos los dispositivos (unión, sin propagar
// borrados).

const BUCKET = "sync";
const ARCHIVO_LEGACY = "arbol.json";
const INDICE = "_mapas.json";
const SYNC_STATE_KEY = (mapId: string) => `3maps:sync:${mapId}`;
const VERSION = 1;
const LOG = "[3maps sync]";

const archivoDe = (mapId: string) => `${mapId}.json`;
const rutaDe = (uid: string, archivo: string) => `${uid}/${archivo}`;

// Los objetos de Storage traen `cache-control: max-age=3600` por defecto → el
// `.download()` del SDK servía versiones viejas hasta 1h (mismo bug que fase 2.4,
// decisiones §F2-4). Subimos con `cacheControl: "0"` y bajamos por signed URL con
// `{ cache: "no-store" }`.
const OPCIONES_SUBIDA = {
  contentType: "application/json",
  upsert: true,
  cacheControl: "0",
} as const;

async function descargarTexto(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  ruta: string,
): Promise<string | null> {
  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(ruta, 60);
  if (error || !data?.signedUrl) return null;
  try {
    const res = await fetch(data.signedUrl, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

type SobreSync = { v: number; titulo?: string; files: Record<string, string> };
type SobreIndice = { v: number; mapas: Mapas };
type EstadoLocal = { at: string; hash: string; uid: string };

function leerEstado(mapId: string): EstadoLocal {
  try {
    const raw =
      typeof window !== "undefined"
        ? localStorage.getItem(SYNC_STATE_KEY(mapId))
        : null;
    if (!raw) return { at: "", hash: "", uid: "" };
    const o = JSON.parse(raw) as Partial<EstadoLocal>;
    return {
      at: typeof o.at === "string" ? o.at : "",
      hash: typeof o.hash === "string" ? o.hash : "",
      uid: typeof o.uid === "string" ? o.uid : "",
    };
  } catch {
    return { at: "", hash: "", uid: "" };
  }
}

function escribirEstado(mapId: string, e: EstadoLocal): void {
  try {
    localStorage.setItem(SYNC_STATE_KEY(mapId), JSON.stringify(e));
  } catch {
    // ignorar
  }
}

// Hash barato del contenido (djb2) — para detectar cambios locales sin subir.
function hashFiles(files: Record<string, string>): string {
  const s = JSON.stringify(files);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function filesDe(a: Arbol): Record<string, string> {
  return Object.fromEntries(a.intercambios.map((ic) => [ic.id, toMarkdown(ic)]));
}

export function estadoSyncLocal(mapId: string): EstadoLocal {
  return leerEstado(mapId);
}

// Metadata del objeto en la nube (hora del SERVIDOR) + qué archivo lo tiene
// (para el mapa "principal", cae al `arbol.json` viejo si no hay `principal.json`).
async function metaNube(
  uid: string,
  mapId: string,
): Promise<{ updatedAt: string; archivo: string } | null> {
  const sb = getSupabase();
  if (!sb || !uid) return null;
  const { data, error } = await sb.storage
    .from(BUCKET)
    .list(uid, { limit: 1000 });
  if (error) {
    console.warn(LOG, "meta: error", error.message);
    return null;
  }
  const candidatos =
    mapId === ID_PRINCIPAL
      ? [archivoDe(mapId), ARCHIVO_LEGACY]
      : [archivoDe(mapId)];
  for (const archivo of candidatos) {
    const f = data?.find((x) => x.name === archivo);
    if (f) {
      const updatedAt =
        (f as { updated_at?: string }).updated_at ??
        (f as { created_at?: string }).created_at ??
        "";
      return { updatedAt, archivo };
    }
  }
  return null;
}

// Baja y parsea el árbol de la nube. `null` si no existe o está corrupto.
export async function bajarArbolNube(
  uid: string,
  mapId: string,
): Promise<{ arbol: Arbol; updatedAt: string; titulo?: string } | null> {
  const sb = getSupabase();
  if (!sb || !uid) return null;
  const meta = await metaNube(uid, mapId);
  if (!meta) {
    console.info(LOG, "bajar: todavía no hay árbol en la nube", mapId);
    return null;
  }
  const texto = await descargarTexto(sb, rutaDe(uid, meta.archivo));
  if (texto === null) {
    console.warn(LOG, "bajar: error al descargar", mapId);
    return null;
  }
  try {
    const sobre = JSON.parse(texto) as Partial<SobreSync>;
    if (!sobre || typeof sobre.files !== "object" || !sobre.files) {
      console.warn(LOG, "bajar: JSON sin `files`");
      return null;
    }
    const intercambios = Object.values(sobre.files)
      .map(parseMarkdown)
      .filter((ic): ic is NonNullable<typeof ic> => ic !== null);
    if (intercambios.length === 0) {
      console.warn(LOG, "bajar: 0 intercambios tras parsear");
      return null;
    }
    return {
      arbol: { intercambios },
      updatedAt: meta.updatedAt,
      titulo: typeof sobre.titulo === "string" ? sobre.titulo : undefined,
    };
  } catch (e) {
    console.warn(LOG, "bajar: JSON inválido", e);
    return null;
  }
}

// Sube el árbol y actualiza el estado local con la hora del SERVIDOR (releída
// tras el upload). Devuelve el `updated_at` del servidor, o `null` si falló.
export async function subirArbolNube(
  a: Arbol,
  uid: string,
  mapId: string,
  titulo?: string,
): Promise<string | null> {
  const sb = getSupabase();
  if (!sb || !uid) return null;
  const files = filesDe(a);
  const sobre: SobreSync = { v: VERSION, titulo, files };

  const { error } = await sb.storage
    .from(BUCKET)
    .upload(rutaDe(uid, archivoDe(mapId)), JSON.stringify(sobre), OPCIONES_SUBIDA);
  if (error) {
    console.warn(LOG, "subir: error", error.message);
    return null;
  }

  const meta = await metaNube(uid, mapId);
  const at = meta?.updatedAt ?? new Date().toISOString();
  escribirEstado(mapId, { at, hash: hashFiles(files), uid });
  console.info(LOG, "subir: OK", { mapId, intercambios: a.intercambios.length, at });
  return at;
}

// Marca que lo local está al día con la nube (tras traer, o tras vaciar).
export function marcarSincronizado(
  mapId: string,
  updatedAt: string,
  arbol: Arbol,
  uid: string,
): void {
  escribirEstado(mapId, {
    at: updatedAt,
    hash: hashFiles(filesDe(arbol)),
    uid,
  });
}

// Borra el archivo del mapa en la nube (al borrar el mapa localmente).
export async function borrarMapaNube(uid: string, mapId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb || !uid) return;
  await sb.storage.from(BUCKET).remove([rutaDe(uid, archivoDe(mapId))]);
  try {
    localStorage.removeItem(SYNC_STATE_KEY(mapId));
  } catch {
    // ignorar
  }
}

// ── Índice de mapas (para que la lista aparezca en todos los dispositivos) ───
//
// `_mapas.json` guarda solo los TÍTULOS. La existencia de un mapa se descubre de
// `storage.list(<uid>/)`: todo `<mapId>.json` que tenga árbol en la nube ES un
// mapa (así un mapa no se puede "perder" aunque el índice se pise entre
// dispositivos).

export async function bajarIndiceMapasNube(uid: string): Promise<Mapas | null> {
  const sb = getSupabase();
  if (!sb || !uid) return null;
  const texto = await descargarTexto(sb, rutaDe(uid, INDICE));
  if (texto === null) return null;
  try {
    const sobre = JSON.parse(texto) as Partial<SobreIndice>;
    return sobre && sobre.mapas && typeof sobre.mapas === "object"
      ? sobre.mapas
      : null;
  } catch {
    return null;
  }
}

// Los mapIds que tienen árbol en la nube (todo `<id>.json` salvo los especiales;
// `arbol.json` legacy cuenta como el mapa "principal").
export async function listarMapasNube(uid: string): Promise<string[]> {
  const sb = getSupabase();
  if (!sb || !uid) return [];
  const { data, error } = await sb.storage
    .from(BUCKET)
    .list(uid, { limit: 1000 });
  if (error || !data) return [];
  const ids = new Set<string>();
  for (const f of data) {
    if (!f.name.endsWith(".json")) continue;
    if (f.name === INDICE) continue;
    if (f.name === ARCHIVO_LEGACY) ids.add(ID_PRINCIPAL);
    else ids.add(f.name.replace(/\.json$/, ""));
  }
  return [...ids];
}

// Sube el índice haciendo UNIÓN con lo que ya hay en la nube — así un dispositivo
// nunca borra del índice los mapas que solo existen en otro (bug 31-08-2026: era
// un overwrite → cada `nuevoMapa`/`renombrar`/`borrar` pisaba la lista ajena).
// Los borrados NO se propagan (política, decisiones F3-4).
export async function subirIndiceMapasNube(
  uid: string,
  mapas: Mapas,
): Promise<void> {
  const sb = getSupabase();
  if (!sb || !uid) return;
  const nube = (await bajarIndiceMapasNube(uid)) ?? {};
  const merged: Mapas = { ...nube, ...mapas };
  const sobre: SobreIndice = { v: VERSION, mapas: merged };
  await sb.storage
    .from(BUCKET)
    .upload(rutaDe(uid, INDICE), JSON.stringify(sobre), OPCIONES_SUBIDA);
}

// Decide qué hacer al abrir un mapa (o al loguear / cambiar de mapa).
//   - subir  : el árbol local es de esta cuenta (o "sin dueño") → va a la nube.
//   - traer  : la nube tiene una versión más nueva / de esta cuenta.
//   - vaciar : el árbol local es de OTRA cuenta y esta no tiene nada.
//   - nada   : ya está sincronizado.
export async function planInicial(
  arbolLocal: Arbol,
  uid: string,
  mapId: string,
): Promise<
  | { accion: "subir" }
  | { accion: "traer"; arbol: Arbol; updatedAt: string; titulo?: string }
  | { accion: "vaciar" }
  | { accion: "nada" }
> {
  const local = leerEstado(mapId);
  const ajeno = local.uid !== "" && local.uid !== uid;
  const meta = await metaNube(uid, mapId);

  if (!meta) {
    return ajeno ? { accion: "vaciar" } : { accion: "subir" };
  }

  if (ajeno || meta.updatedAt !== local.at) {
    const bajado = await bajarArbolNube(uid, mapId);
    if (bajado) {
      return {
        accion: "traer",
        arbol: bajado.arbol,
        updatedAt: bajado.updatedAt,
        titulo: bajado.titulo,
      };
    }
    return ajeno ? { accion: "vaciar" } : { accion: "subir" };
  }

  const hashLocal = hashFiles(filesDe(arbolLocal));
  return hashLocal === local.hash ? { accion: "nada" } : { accion: "subir" };
}
