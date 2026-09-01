import type { Adjunto, TipoAdjunto } from "./intercambio";

// Lectura y validación de archivos adjuntos (T16). El `Adjunto` resultante se
// guarda en el `.md` del intercambio (ver intercambio.ts) y se manda a la IA
// (ver contexto.ts + ia.ts).
//
// T16a: solo archivos de TEXTO. Imágenes y PDF llegan en T16b / T16c — hasta
// entonces `leerArchivo` los rechaza con un aviso.

// Topes (decididos con Alan, 02-09). El mapa entero sincroniza como UN JSON de
// 5 MB máx (bucket `sync`), así que cada adjunto compite con eso.
export const LIMITE_TEXTO = 128 * 1024; // 128 KB por archivo de texto
export const LIMITE_BINARIO = 1024 * 1024; // 1 MB por imagen / PDF (T16b/c)
export const LIMITE_INTERCAMBIO = 2 * 1024 * 1024; // 2 MB sumando todos los adjuntos

// Extensiones que tratamos como texto aunque el `type` del File venga vacío o raro.
const EXT_TEXTO = new Set([
  "md", "markdown", "txt", "text", "csv", "tsv", "json", "jsonl", "yaml", "yml",
  "toml", "ini", "env", "xml", "html", "htm", "css", "scss", "less", "svg",
  "js", "jsx", "mjs", "cjs", "ts", "tsx", "py", "rb", "go", "rs", "java", "kt",
  "c", "h", "cpp", "hpp", "cs", "php", "sh", "bash", "zsh", "sql", "graphql",
  "gql", "lua", "r", "swift", "dart", "vue", "svelte", "astro", "log", "diff",
  "patch", "gitignore", "dockerfile", "makefile", "properties", "conf",
]);

function extensionDe(nombre: string): string {
  const base = nombre.toLowerCase().split("/").pop() ?? "";
  if (base === "dockerfile" || base === "makefile") return base;
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1) : "";
}

// Qué tipo de adjunto es un File, o `null` si no lo soportamos.
export function tipoDeArchivo(file: File): TipoAdjunto | null {
  const mime = (file.type || "").toLowerCase();
  const ext = extensionDe(file.name);
  if (mime.startsWith("text/") || EXT_TEXTO.has(ext)) return "texto";
  if (mime === "application/json" || mime === "application/xml") return "texto";
  if (mime === "image/png" || mime === "image/jpeg" || mime === "image/webp") {
    return "imagen";
  }
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  return null;
}

// Peso aproximado en bytes de un `Adjunto` ya cargado (para el tope por
// intercambio). Texto: largo de la string; base64: ~3/4 del largo.
export function pesoAdjunto(a: Adjunto): number {
  return a.tipo === "texto"
    ? a.contenido.length
    : Math.floor(a.contenido.length * 0.75);
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function iconoAdjunto(tipo: TipoAdjunto): string {
  return tipo === "imagen" ? "🖼" : tipo === "pdf" ? "📕" : "📄";
}

// Descarga un adjunto ya guardado (chip en modo lectura del panel). T16a: texto.
export function descargarAdjunto(a: Adjunto): void {
  const blob = new Blob([a.contenido], { type: a.mime || "text/plain" });
  const url = URL.createObjectURL(blob);
  const el = document.createElement("a");
  el.href = url;
  el.download = a.nombre;
  el.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Mensaje para cuando el usuario suelta algo que no admitimos (T16a: solo texto).
export const AVISO_TIPO_NO_SOPORTADO =
  "Por ahora solo puedo adjuntar archivos de texto (.md, .txt, .csv, .json, " +
  "código). Imágenes y PDF: pronto.";

type Resultado =
  | { ok: true; adjunto: Adjunto }
  | { ok: false; error: string };

const leerTexto = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error ?? new Error("no se pudo leer el archivo"));
    r.readAsText(file);
  });

// Lee UN archivo y devuelve el `Adjunto` o un error legible. `pesoActual` = la
// suma de los adjuntos que ya tiene el intercambio (para el tope de 2 MB).
export async function leerArchivo(
  file: File,
  pesoActual = 0,
): Promise<Resultado> {
  const tipo = tipoDeArchivo(file);
  if (tipo === null) {
    return { ok: false, error: `No puedo adjuntar “${file.name}”. ${AVISO_TIPO_NO_SOPORTADO}` };
  }
  if (tipo !== "texto") {
    return {
      ok: false,
      error: `“${file.name}” es ${tipo === "imagen" ? "una imagen" : "un PDF"}. ${AVISO_TIPO_NO_SOPORTADO}`,
    };
  }
  if (file.size > LIMITE_TEXTO) {
    return {
      ok: false,
      error: `“${file.name}” pesa ${fmtBytes(file.size)}; el máximo para un archivo de texto es ${fmtBytes(LIMITE_TEXTO)}.`,
    };
  }

  let contenido: string;
  try {
    contenido = await leerTexto(file);
  } catch {
    return { ok: false, error: `No se pudo leer “${file.name}”.` };
  }

  const adjunto: Adjunto = {
    nombre: file.name || "archivo.txt",
    tipo: "texto",
    mime: file.type || "text/plain",
    contenido,
  };

  if (pesoActual + pesoAdjunto(adjunto) > LIMITE_INTERCAMBIO) {
    return {
      ok: false,
      error: `Con “${file.name}” los adjuntos de esta pregunta superan el máximo (${fmtBytes(LIMITE_INTERCAMBIO)}).`,
    };
  }

  return { ok: true, adjunto };
}
