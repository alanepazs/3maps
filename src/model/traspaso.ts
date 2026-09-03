// Export / import de un mapa como `.zip` de sus `.md` (spec §7). El `.md` es la
// fuente de la verdad → exportar es zippear los mismos strings que van a
// `localStorage`; importar es parsearlos de vuelta. Los adjuntos (T16) viven en
// el frontmatter del `.md` → viajan solos. Local, sin backend.

import { crearZip, leerZip } from "./zip";
import {
  parseMarkdown,
  toMarkdown,
  type Arbol,
} from "./intercambio";

function slug(s: string): string {
  const base = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diacríticos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base || "mapa";
}

// Bytes del `.zip` + el nombre sugerido para descargar.
export function exportarMapaZip(
  arbol: Arbol,
  titulo: string,
): { nombre: string; bytes: Uint8Array } {
  const archivos: Record<string, string> = {};
  for (const ic of arbol.intercambios) archivos[`${ic.id}.md`] = toMarkdown(ic);
  archivos["3maps.json"] = JSON.stringify(
    { v: 1, app: "3maps", titulo, exportado: new Date().toISOString() },
    null,
    2,
  );
  return { nombre: `${slug(titulo)}.zip`, bytes: crearZip(archivos) };
}

// `.zip` → árbol + título. Lanza `Error` (mensaje legible) si el `.zip` no sirve.
export async function importarMapaZip(
  bytes: Uint8Array,
): Promise<{ arbol: Arbol; titulo: string }> {
  const archivos = await leerZip(bytes);

  let titulo = "Mapa importado";
  const metaRaw = archivos["3maps.json"];
  if (metaRaw) {
    try {
      const meta = JSON.parse(metaRaw) as { titulo?: unknown };
      if (typeof meta.titulo === "string" && meta.titulo.trim()) {
        titulo = meta.titulo.trim();
      }
    } catch {
      // meta rota: se ignora, se usa el título por defecto
    }
  }

  const intercambios = Object.entries(archivos)
    .filter(([n]) => n.toLowerCase().endsWith(".md"))
    .map(([, md]) => parseMarkdown(md))
    .filter((ic): ic is NonNullable<typeof ic> => ic !== null);

  if (intercambios.length === 0) {
    throw new Error("El .zip no tiene ningún intercambio válido (`*.md`).");
  }

  // Normalizar: un `padre_id` que no está en el set → raíz (así nada queda
  // colgado de un nodo inexistente y `arbolAVista` no genera un edge roto).
  const ids = new Set(intercambios.map((i) => i.id));
  for (const ic of intercambios) {
    if (ic.padreId !== null && !ids.has(ic.padreId)) ic.padreId = null;
  }

  return { arbol: { intercambios }, titulo };
}
