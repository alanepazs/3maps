"use client";

import {
  parseMarkdown,
  toMarkdown,
  type Arbol,
} from "./intercambio";
import { getSupabase } from "./supabase";

// Compartir un árbol por link (fase 2.3). Un árbol compartido es UN archivo JSON
// en el bucket `arboles` de Supabase Storage: `arboles/<slug>.json`, con la
// misma forma que `localStorage["3maps:arbol"]` (un `.md` por intercambio) más
// un poco de metadata. El servidor solo lo aloja (spec §7): el formato canónico
// sigue siendo el `.md`.
//
// El `slug` ES el secreto: quien tiene el link, ve el árbol. Sin login todavía
// (fase 2.2), así que no hay "despublicar" ni "mis árboles".

const BUCKET = "arboles";
const VERSION = 1;

// Topes del lado del cliente para no quemar el free tier (la política del bucket
// además corta cualquier archivo > 2 MB). Ver docs/fase-2.md.
export const MAX_INTERCAMBIOS_COMPARTIR = 50;
export const MAX_BYTES_COMPARTIR = 1_000_000;

// Alfabeto sin caracteres ambiguos (0/O, 1/l/I).
const ALFABETO = "23456789abcdefghjkmnpqrstuvwxyz";

function nuevoSlug(largo = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(largo));
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}

export function esSlugValido(s: string): boolean {
  return s.length >= 6 && s.length <= 24 && /^[a-z0-9]+$/.test(s);
}

type Sobre = {
  v: number;
  titulo: string;
  creado: string; // ISO
  // { [idIntercambio]: "<string .md>" } — idéntico a persistencia.ts
  files: Record<string, string>;
};

export class ErrorCompartir extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorCompartir";
  }
}

// Sube el árbol y devuelve el link para compartir. `titulo` es libre (si viene
// vacío se usa la pregunta de la raíz).
export async function compartirArbol(
  a: Arbol,
  titulo: string,
): Promise<{ slug: string; url: string }> {
  const sb = getSupabase();
  if (!sb) {
    throw new ErrorCompartir(
      "El backend para compartir no está configurado en esta instancia.",
    );
  }
  if (a.intercambios.length === 0) {
    throw new ErrorCompartir("El árbol está vacío.");
  }
  if (a.intercambios.length > MAX_INTERCAMBIOS_COMPARTIR) {
    throw new ErrorCompartir(
      `El árbol tiene ${a.intercambios.length} globos; el máximo para compartir ` +
        `es ${MAX_INTERCAMBIOS_COMPARTIR}.`,
    );
  }

  const raiz =
    a.intercambios.find((i) => i.padreId === null) ?? a.intercambios[0];
  const sobre: Sobre = {
    v: VERSION,
    titulo: (titulo.trim() || raiz.pregunta || "Árbol de 3maps").slice(0, 120),
    creado: new Date().toISOString(),
    files: Object.fromEntries(
      a.intercambios.map((ic) => [ic.id, toMarkdown(ic)]),
    ),
  };

  const cuerpo = JSON.stringify(sobre);
  if (cuerpo.length > MAX_BYTES_COMPARTIR) {
    throw new ErrorCompartir(
      "El árbol es demasiado grande para compartir (límite ~1 MB de texto).",
    );
  }

  // Reintenta si el slug ya existía (colisión ~imposible con 10 chars, pero el
  // upload sin `upsert` falla en vez de pisar, así que lo manejamos).
  for (let intento = 0; intento < 3; intento++) {
    const slug = nuevoSlug();
    const { error } = await sb.storage
      .from(BUCKET)
      .upload(`${slug}.json`, cuerpo, {
        contentType: "application/json",
        upsert: false,
      });
    if (!error) {
      return { slug, url: linkCompartir(slug) };
    }
    // 409 = ya existe ese slug → probar otro. Cualquier otro error, cortar.
    const dup = /exists|duplicate|409/i.test(error.message);
    if (!dup) {
      throw new ErrorCompartir(`No se pudo subir el árbol: ${error.message}`);
    }
  }
  throw new ErrorCompartir("No se pudo generar un link único. Probá de nuevo.");
}

// Baja un árbol compartido por su slug. `null` si no existe o está corrupto.
export async function cargarArbolCompartido(
  slug: string,
): Promise<{ arbol: Arbol; titulo: string } | null> {
  const sb = getSupabase();
  if (!sb || !esSlugValido(slug)) return null;

  const { data, error } = await sb.storage
    .from(BUCKET)
    .download(`${slug}.json`);
  if (error || !data) return null;

  try {
    const sobre = JSON.parse(await data.text()) as Partial<Sobre>;
    if (!sobre || typeof sobre.files !== "object" || !sobre.files) return null;
    const intercambios = Object.values(sobre.files)
      .map(parseMarkdown)
      .filter((ic): ic is NonNullable<typeof ic> => ic !== null);
    if (intercambios.length === 0) return null;
    return {
      arbol: { intercambios },
      titulo: typeof sobre.titulo === "string" ? sobre.titulo : "",
    };
  } catch {
    return null;
  }
}

// El link apunta a la misma app (`?compartir=<slug>`). `location.pathname` ya
// incluye el basePath `/3maps` en producción y `/` en dev.
export function linkCompartir(slug: string): string {
  if (typeof window === "undefined") return `?compartir=${slug}`;
  const { origin, pathname } = window.location;
  return `${origin}${pathname}${pathname.endsWith("/") ? "" : "/"}?compartir=${slug}`;
}

// Lee `?compartir=<slug>` de la URL actual. `null` si no está o es inválido.
export function slugDeLaUrl(): string | null {
  if (typeof window === "undefined") return null;
  const s = new URLSearchParams(window.location.search).get("compartir");
  return s && esSlugValido(s) ? s : null;
}

// Saca `?compartir=` de la URL sin recargar (al "guardar copia" o "salir").
export function limpiarSlugDeLaUrl(): void {
  if (typeof window === "undefined") return;
  const u = new URL(window.location.href);
  u.searchParams.delete("compartir");
  window.history.replaceState(null, "", u.toString());
}
