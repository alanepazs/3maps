"use client";

import {
  parseMarkdown,
  toMarkdown,
  type Arbol,
} from "./intercambio";
import { getSupabase } from "./supabase";

// Sync del árbol de trabajo entre dispositivos (fase 2.4). Solo con sesión.
//
// Estrategia: **last-write-wins**, sin detección de conflicto (decidido con el
// usuario). El árbol vive en un bucket PRIVADO `sync` bajo `<uid>/arbol.json`.
//   - Al abrir: si la nube es más nueva que lo último que sincronizamos → traer.
//     Si no → subir la local.
//   - Al cambiar el árbol: subir (con debounce, desde FlowCanvas).
// `localStorage["3maps:sync"]` guarda el `updated_at` de la última versión que
// sincronizamos, para saber si la nube se movió desde otro dispositivo.

const BUCKET = "sync";
const ARCHIVO = "arbol.json";
const SYNC_STATE_KEY = "3maps:sync";
const VERSION = 1;

type SobreSync = {
  v: number;
  updated_at: string; // ISO
  files: Record<string, string>; // { [id]: "<md>" }
};

function leerEstado(): { at: string } {
  try {
    const raw =
      typeof window !== "undefined"
        ? localStorage.getItem(SYNC_STATE_KEY)
        : null;
    if (!raw) return { at: "" };
    const o = JSON.parse(raw) as { at?: unknown };
    return { at: typeof o.at === "string" ? o.at : "" };
  } catch {
    return { at: "" };
  }
}

function escribirEstado(at: string): void {
  try {
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({ at }));
  } catch {
    // ignorar
  }
}

// El `updated_at` de la última versión que sincronizamos (nube ↔ local).
export function ultimoSyncAt(): string {
  return leerEstado().at;
}

const LOG = "[3maps sync]";

// Baja el árbol de la nube. `null` si no hay (primer uso), sin sesión, o error.
// `uid` viene de la sesión (useSync lo pasa) — no se re-consulta a Supabase.
export async function bajarArbolNube(
  uid: string,
): Promise<{ arbol: Arbol; updatedAt: string } | null> {
  const sb = getSupabase();
  if (!sb || !uid) {
    console.warn(LOG, "bajar: sin cliente o sin uid", { hasSb: !!sb, uid });
    return null;
  }

  const { data, error } = await sb.storage
    .from(BUCKET)
    .download(`${uid}/${ARCHIVO}`);
  if (error || !data) {
    // "Object not found" en el primer uso es normal.
    const notFound = /not.?found|no such|404/i.test(error?.message ?? "");
    if (!notFound) console.warn(LOG, "bajar: error", error?.message ?? "sin data");
    else console.info(LOG, "bajar: todavía no hay árbol en la nube");
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
    const updatedAt =
      typeof sobre.updated_at === "string"
        ? sobre.updated_at
        : new Date(0).toISOString();
    console.info(LOG, "bajar: OK", { intercambios: intercambios.length, updatedAt });
    return { arbol: { intercambios }, updatedAt };
  } catch (e) {
    console.warn(LOG, "bajar: JSON inválido", e);
    return null;
  }
}

// Sube el árbol a la nube. Devuelve el `updated_at` que quedó (o `null` si no
// se pudo). Actualiza el estado local de sync.
export async function subirArbolNube(
  a: Arbol,
  uid: string,
): Promise<string | null> {
  const sb = getSupabase();
  if (!sb || !uid) {
    console.warn(LOG, "subir: sin cliente o sin uid", { hasSb: !!sb, uid });
    return null;
  }

  const sobre: SobreSync = {
    v: VERSION,
    updated_at: new Date().toISOString(),
    files: Object.fromEntries(
      a.intercambios.map((ic) => [ic.id, toMarkdown(ic)]),
    ),
  };

  const { error } = await sb.storage
    .from(BUCKET)
    .upload(`${uid}/${ARCHIVO}`, JSON.stringify(sobre), {
      contentType: "application/json",
      upsert: true,
    });
  if (error) {
    console.warn(LOG, "subir: error", error.message);
    return null;
  }

  escribirEstado(sobre.updated_at);
  console.info(LOG, "subir: OK", {
    intercambios: a.intercambios.length,
    updatedAt: sobre.updated_at,
  });
  return sobre.updated_at;
}

// Marca que la nube y lo local están al día en `updatedAt` (tras traer de la
// nube). No sube nada.
export function marcarSincronizado(updatedAt: string): void {
  escribirEstado(updatedAt);
}
