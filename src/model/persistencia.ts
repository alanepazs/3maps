"use client";

import {
  arbolInicial,
  parseMarkdown,
  toMarkdown,
  type Arbol,
} from "./intercambio";
import { arbolKey } from "./mapas";

// En `localStorage` guardamos un objeto `{ [id]: "<string .md>" }` — un archivo
// por intercambio, igual que va a ser el export a disco (spec §7). El
// serializador se ejercita en cada carga, así los bugs de formato saltan
// enseguida. El export a `.zip` / carpetas reales queda para más adelante.
//
// Desde fase 3.5 la clave es por mapa: `3maps:arbol:<mapId>` (ver `mapas.ts`).

export function guardarArbol(a: Arbol, mapId: string): void {
  try {
    const files: Record<string, string> = {};
    for (const ic of a.intercambios) files[ic.id] = toMarkdown(ic);
    localStorage.setItem(arbolKey(mapId), JSON.stringify(files));
  } catch {
    // ignorar: no se pudo persistir
  }
}

export function cargarArbol(mapId: string): Arbol {
  try {
    const raw =
      typeof window !== "undefined"
        ? localStorage.getItem(arbolKey(mapId))
        : null;
    if (raw) {
      const files = JSON.parse(raw) as Record<string, string>;
      const intercambios = Object.values(files)
        .map(parseMarkdown)
        .filter((ic): ic is NonNullable<typeof ic> => ic !== null);
      if (intercambios.length > 0) return { intercambios };
    }
  } catch {
    // ignorar: cae a la semilla
  }
  return arbolInicial();
}
