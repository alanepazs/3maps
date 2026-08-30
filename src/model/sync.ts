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

async function uidActual(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

// Baja el árbol de la nube. `null` si no hay (primer uso), sin sesión, o error.
export async function bajarArbolNube(): Promise<
  { arbol: Arbol; updatedAt: string } | null
> {
  const sb = getSupabase();
  const uid = await uidActual();
  if (!sb || !uid) return null;

  const { data, error } = await sb.storage
    .from(BUCKET)
    .download(`${uid}/${ARCHIVO}`);
  if (error || !data) return null;

  try {
    const sobre = JSON.parse(await data.text()) as Partial<SobreSync>;
    if (!sobre || typeof sobre.files !== "object" || !sobre.files) return null;
    const intercambios = Object.values(sobre.files)
      .map(parseMarkdown)
      .filter((ic): ic is NonNullable<typeof ic> => ic !== null);
    if (intercambios.length === 0) return null;
    return {
      arbol: { intercambios },
      updatedAt:
        typeof sobre.updated_at === "string"
          ? sobre.updated_at
          : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

// Sube el árbol a la nube. Devuelve el `updated_at` que quedó (o `null` si no
// se pudo). Actualiza el estado local de sync.
export async function subirArbolNube(a: Arbol): Promise<string | null> {
  const sb = getSupabase();
  const uid = await uidActual();
  if (!sb || !uid) return null;

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
  if (error) return null;

  escribirEstado(sobre.updated_at);
  return sobre.updated_at;
}

// Marca que la nube y lo local están al día en `updatedAt` (tras traer de la
// nube). No sube nada.
export function marcarSincronizado(updatedAt: string): void {
  escribirEstado(updatedAt);
}
