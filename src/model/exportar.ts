// Sacar una respuesta de la IA como texto: al portapapeles o como archivo (T15).
// Opera sobre el string crudo de `Intercambio.respuesta`, no sobre el render.

// lang del fence → { ext, mime }. Fallback: txt / text/plain.
const LANGS: Record<string, { ext: string; mime: string }> = {
  ts: { ext: "ts", mime: "text/plain" },
  typescript: { ext: "ts", mime: "text/plain" },
  tsx: { ext: "tsx", mime: "text/plain" },
  js: { ext: "js", mime: "text/javascript" },
  javascript: { ext: "js", mime: "text/javascript" },
  jsx: { ext: "jsx", mime: "text/plain" },
  py: { ext: "py", mime: "text/plain" },
  python: { ext: "py", mime: "text/plain" },
  rb: { ext: "rb", mime: "text/plain" },
  ruby: { ext: "rb", mime: "text/plain" },
  go: { ext: "go", mime: "text/plain" },
  rust: { ext: "rs", mime: "text/plain" },
  rs: { ext: "rs", mime: "text/plain" },
  java: { ext: "java", mime: "text/plain" },
  c: { ext: "c", mime: "text/plain" },
  cpp: { ext: "cpp", mime: "text/plain" },
  "c++": { ext: "cpp", mime: "text/plain" },
  cs: { ext: "cs", mime: "text/plain" },
  php: { ext: "php", mime: "text/plain" },
  css: { ext: "css", mime: "text/css" },
  scss: { ext: "scss", mime: "text/plain" },
  html: { ext: "html", mime: "text/html" },
  xml: { ext: "xml", mime: "text/plain" },
  json: { ext: "json", mime: "application/json" },
  yaml: { ext: "yaml", mime: "text/plain" },
  yml: { ext: "yaml", mime: "text/plain" },
  toml: { ext: "toml", mime: "text/plain" },
  sql: { ext: "sql", mime: "text/plain" },
  sh: { ext: "sh", mime: "text/plain" },
  bash: { ext: "sh", mime: "text/plain" },
  shell: { ext: "sh", mime: "text/plain" },
  md: { ext: "md", mime: "text/markdown" },
  markdown: { ext: "md", mime: "text/markdown" },
};

// Toda la respuesta (tras trim) es UN solo fence ```lang … ``` → { lang, cuerpo }.
function fenceUnico(t: string): { lang: string; cuerpo: string } | null {
  const m = t.match(/^```([^\n`]*)\n([\s\S]*?)\n?```$/);
  if (!m) return null;
  return { lang: m[1].trim().toLowerCase(), cuerpo: m[2] };
}

// Heurística: ¿el texto parece markdown? (encabezados, listas, negrita, fences, links)
function pareceMarkdown(t: string): boolean {
  return (
    /^#{1,6}\s/m.test(t) ||
    /^\s*[-*+]\s/m.test(t) ||
    /^\s*\d+\.\s/m.test(t) ||
    /\*\*[^*\n]+\*\*/.test(t) ||
    /```/.test(t) ||
    /\[[^\]]+\]\([^)]+\)/.test(t) ||
    /^\|.*\|$/m.test(t)
  );
}

function slug(s: string): string {
  const base = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  return base || "respuesta";
}

// Nombre de archivo, contenido y mime para guardar una respuesta.
export function nombreArchivoRespuesta(respuesta: string): {
  nombre: string;
  contenido: string;
  mime: string;
} {
  const t = respuesta.trim();

  const fence = fenceUnico(t);
  if (fence) {
    const info = LANGS[fence.lang] ?? { ext: "txt", mime: "text/plain" };
    const titulo = fence.cuerpo.match(/^#{1,6}\s+(.+)$/m)?.[1];
    const nombre =
      (titulo ? slug(titulo) : "documento") + "." + info.ext;
    return { nombre, contenido: fence.cuerpo, mime: info.mime };
  }

  const titulo = t.match(/^#{1,6}\s+(.+)$/m)?.[1];
  const md = pareceMarkdown(t);
  return {
    nombre: (titulo ? slug(titulo) : "respuesta") + (md ? ".md" : ".txt"),
    contenido: respuesta,
    mime: md ? "text/markdown" : "text/plain",
  };
}

export function descargarTexto(
  nombre: string,
  contenido: string,
  mime: string,
): void {
  descargarBlob(nombre, new Blob([contenido], { type: mime }));
}

export function descargarBytes(
  nombre: string,
  bytes: Uint8Array,
  mime = "application/zip",
): void {
  descargarBlob(nombre, new Blob([bytes as BlobPart], { type: mime }));
}

function descargarBlob(nombre: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Copia texto al portapapeles. `true` si anduvo. No hay fallback para navegadores
// sin `navigator.clipboard` (contexto no seguro) — devuelve `false`.
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard?.writeText(texto);
    return true;
  } catch {
    return false;
  }
}
