"use client";

import { parseMarkdown, toMarkdown, type Arbol } from "./intercambio";
import { getSupabase } from "./supabase";

// Sync del árbol de trabajo entre dispositivos (fase 2.4). Solo con sesión.
//
// Estrategia: **last-write-wins**, sin detección de conflicto (decidido con el
// usuario). El árbol vive en un bucket PRIVADO `sync` bajo `<uid>/arbol.json`.
//
// El ORDEN lo define la **hora del servidor de Supabase** (el `updated_at` que
// Storage le pone al objeto), NUNCA `new Date()` del navegador — los relojes de
// los dispositivos no coinciden y eso rompía el LWW (ping-pong).
//
// `localStorage["3maps:sync"] = { at, hash }`:
//   - `at`   = el `updated_at` (del servidor) de la versión que sincronizamos.
//   - `hash` = hash del contenido de esa versión, para saber si lo local cambió
//     sin haberse subido todavía.
//
// Al abrir:
//   - no hay objeto en la nube            → subir la local.
//   - `at` de la nube != nuestro `at`     → alguien más escribió → traer.
//   - iguales, pero el hash local cambió  → subir.
//   - iguales y mismo hash                → ya está, no hacer nada.

const BUCKET = "sync";
const CARPETA = (uid: string) => uid;
const ARCHIVO = "arbol.json";
const RUTA = (uid: string) => `${uid}/${ARCHIVO}`;
const SYNC_STATE_KEY = "3maps:sync";
const VERSION = 1;
const LOG = "[3maps sync]";

type SobreSync = { v: number; files: Record<string, string> };
// `uid`: a qué cuenta pertenece el árbol local — si logueás con otra, no se
// sube el árbol de la anterior. "" = nunca sincronizado (árbol "sin dueño").
type EstadoLocal = { at: string; hash: string; uid: string };

function leerEstado(): EstadoLocal {
  try {
    const raw =
      typeof window !== "undefined"
        ? localStorage.getItem(SYNC_STATE_KEY)
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

function escribirEstado(e: EstadoLocal): void {
  try {
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(e));
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

export function estadoSyncLocal(): EstadoLocal {
  return leerEstado();
}

// Metadata del objeto en la nube (hora del SERVIDOR). `null` si no existe.
async function metaNube(uid: string): Promise<{ updatedAt: string } | null> {
  const sb = getSupabase();
  if (!sb || !uid) return null;
  const { data, error } = await sb.storage
    .from(BUCKET)
    .list(CARPETA(uid), { limit: 100, search: ARCHIVO });
  if (error) {
    console.warn(LOG, "meta: error", error.message);
    return null;
  }
  const f = data?.find((x) => x.name === ARCHIVO);
  if (!f) return null;
  // `updated_at` puede venir en `f.updated_at` o dentro de `f.metadata`.
  const updatedAt =
    (f as { updated_at?: string }).updated_at ??
    (f as { created_at?: string }).created_at ??
    "";
  return { updatedAt };
}

// Baja y parsea el árbol de la nube. `null` si no existe o está corrupto.
export async function bajarArbolNube(
  uid: string,
): Promise<{ arbol: Arbol; updatedAt: string } | null> {
  const sb = getSupabase();
  if (!sb || !uid) {
    console.warn(LOG, "bajar: sin cliente o sin uid");
    return null;
  }
  const meta = await metaNube(uid);
  if (!meta) {
    console.info(LOG, "bajar: todavía no hay árbol en la nube");
    return null;
  }
  const { data, error } = await sb.storage.from(BUCKET).download(RUTA(uid));
  if (error || !data) {
    console.warn(LOG, "bajar: error al descargar", error?.message);
    return null;
  }
  try {
    const sobre = JSON.parse(await data.text()) as Partial<SobreSync>;
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
    console.info(LOG, "bajar: OK", {
      intercambios: intercambios.length,
      updatedAt: meta.updatedAt,
    });
    return { arbol: { intercambios }, updatedAt: meta.updatedAt };
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
): Promise<string | null> {
  const sb = getSupabase();
  if (!sb || !uid) {
    console.warn(LOG, "subir: sin cliente o sin uid");
    return null;
  }
  const files = filesDe(a);
  const sobre: SobreSync = { v: VERSION, files };

  const { error } = await sb.storage
    .from(BUCKET)
    .upload(RUTA(uid), JSON.stringify(sobre), {
      contentType: "application/json",
      upsert: true,
    });
  if (error) {
    console.warn(LOG, "subir: error", error.message);
    return null;
  }

  // Releer la hora que le puso el servidor.
  const meta = await metaNube(uid);
  const at = meta?.updatedAt ?? new Date().toISOString();
  escribirEstado({ at, hash: hashFiles(files), uid });
  console.info(LOG, "subir: OK", { intercambios: a.intercambios.length, at });
  return at;
}

// Marca que lo local está al día con la nube (tras traer, o tras vaciar).
export function marcarSincronizado(
  updatedAt: string,
  arbol: Arbol,
  uid: string,
): void {
  escribirEstado({ at: updatedAt, hash: hashFiles(filesDe(arbol)), uid });
}

// Decide qué hacer al abrir (o al loguear).
//   - subir  : el árbol local es de esta cuenta (o "sin dueño") → va a la nube.
//   - traer  : la nube tiene una versión más nueva / de esta cuenta.
//   - vaciar : el árbol local es de OTRA cuenta y esta no tiene nada → empezar
//              de cero (NO subir el árbol ajeno).
//   - nada   : ya está sincronizado.
export async function planInicial(
  arbolLocal: Arbol,
  uid: string,
): Promise<
  | { accion: "subir" }
  | { accion: "traer"; arbol: Arbol; updatedAt: string }
  | { accion: "vaciar" }
  | { accion: "nada" }
> {
  const local = leerEstado();
  // El árbol local pertenece a otra cuenta (se logueó con otro mail).
  const ajeno = local.uid !== "" && local.uid !== uid;
  const meta = await metaNube(uid);

  if (!meta) {
    return ajeno ? { accion: "vaciar" } : { accion: "subir" };
  }

  if (ajeno || meta.updatedAt !== local.at) {
    const bajado = await bajarArbolNube(uid);
    if (bajado) {
      return { accion: "traer", arbol: bajado.arbol, updatedAt: bajado.updatedAt };
    }
    return ajeno ? { accion: "vaciar" } : { accion: "subir" };
  }

  // Misma cuenta, la nube es nuestra última versión. ¿Cambió lo local sin subir?
  const hashLocal = hashFiles(filesDe(arbolLocal));
  return hashLocal === local.hash ? { accion: "nada" } : { accion: "subir" };
}
