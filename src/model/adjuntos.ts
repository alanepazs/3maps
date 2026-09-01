import type { Adjunto, TipoAdjunto } from "./intercambio";

// Lectura y validación de archivos adjuntos (T16). El `Adjunto` resultante se
// guarda en el `.md` del intercambio (ver intercambio.ts) y se manda a la IA
// (ver contexto.ts + ia.ts).
//
// Texto (T16a), imágenes recomprimidas (T16b), PDF (T16c). El PDF solo lo leen
// Gemini y Claude — con otros proveedores el adaptador lo ignora (aviso en la UI).

// Topes (decididos con Alan, 02-09). El mapa entero sincroniza como UN JSON de
// 5 MB máx (bucket `sync`), así que cada adjunto compite con eso.
export const LIMITE_TEXTO = 128 * 1024; // 128 KB por archivo de texto
export const LIMITE_BINARIO = 1024 * 1024; // 1 MB por imagen / PDF (ya comprimida)
export const LIMITE_INTERCAMBIO = 2 * 1024 * 1024; // 2 MB sumando todos los adjuntos

// Máximo lado útil para la visión de Claude / Gemini: agrandar más no aporta.
const MAX_LADO_IMG = 1568;

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
  if (mime === "image/png" || mime === "image/jpeg" || mime === "image/webp") {
    return "imagen";
  }
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("text/") || EXT_TEXTO.has(ext)) return "texto";
  if (mime === "application/json" || mime === "application/xml") return "texto";
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

// `data:` URL de un adjunto binario (para thumbnails y descarga).
export function dataUrl(a: Adjunto): string {
  return `data:${a.mime};base64,${a.contenido}`;
}

const base64ABlob = (b64: string, mime: string): Blob => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

// Descarga un adjunto ya guardado (chip en modo lectura del panel).
export function descargarAdjunto(a: Adjunto): void {
  const blob =
    a.tipo === "texto"
      ? new Blob([a.contenido], { type: a.mime || "text/plain" })
      : base64ABlob(a.contenido, a.mime);
  const url = URL.createObjectURL(blob);
  const el = document.createElement("a");
  el.href = url;
  el.download = a.nombre;
  el.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const AVISO_TIPO_NO_SOPORTADO =
  "Acepto archivos de texto (.md, .txt, .csv, .json, código), imágenes " +
  "(PNG, JPEG, WebP) y PDF.";

type Resultado =
  | { ok: true; adjunto: Adjunto }
  | { ok: false; error: string };

// ── Lectura de texto ──────────────────────────────────────────────────────

const leerTexto = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error ?? new Error("no se pudo leer el archivo"));
    r.readAsText(file);
  });

// ── Lectura + compresión de imágenes (T16b) ───────────────────────────────

const blobABase64 = (b: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      resolve(s.slice(s.indexOf(",") + 1)); // saca el `data:...;base64,`
    };
    r.onerror = () => reject(r.error ?? new Error("no se pudo codificar"));
    r.readAsDataURL(b);
  });

function tieneTransparencia(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): boolean {
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

// Achica a `MAX_LADO_IMG` y recomprime a JPEG (o PNG si el original es PNG con
// transparencia). Si el original ya entra en el tope y no hay que achicar, se
// usa tal cual. Devuelve base64 sin prefijo.
async function comprimirImagen(
  file: File,
): Promise<{ ok: true; mime: string; base64: string } | { ok: false; error: string }> {
  const url = URL.createObjectURL(file);
  let img: HTMLImageElement;
  try {
    img = await new Promise((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = () => rej(new Error("decode"));
      el.src = url;
    });
  } catch {
    URL.revokeObjectURL(url);
    return { ok: false, error: `No pude leer la imagen “${file.name}”.` };
  }

  const lado = Math.max(img.naturalWidth, img.naturalHeight);
  const escala = Math.min(1, MAX_LADO_IMG / lado);

  if (escala === 1 && file.size <= LIMITE_BINARIO) {
    URL.revokeObjectURL(url);
    return { ok: true, mime: file.type, base64: await blobABase64(file) };
  }

  const w = Math.max(1, Math.round(img.naturalWidth * escala));
  const h = Math.max(1, Math.round(img.naturalHeight * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(url);
    return { ok: false, error: "El navegador no pudo procesar la imagen." };
  }
  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(url);

  const png = file.type === "image/png" && tieneTransparencia(ctx, w, h);
  const mime = png ? "image/png" : "image/jpeg";
  const calidades = png ? [undefined] : [0.82, 0.6];

  for (const q of calidades) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, mime, q));
    if (blob && blob.size <= LIMITE_BINARIO) {
      return { ok: true, mime, base64: await blobABase64(blob) };
    }
  }
  return {
    ok: false,
    error: `“${file.name}” sigue pesando más de ${fmtBytes(LIMITE_BINARIO)} después de comprimirla. Probá recortarla.`,
  };
}

// ── Entrada única ─────────────────────────────────────────────────────────

// Lee UN archivo y devuelve el `Adjunto` o un error legible. `pesoActual` = la
// suma de los adjuntos que ya tiene el intercambio (para el tope de 2 MB).
export async function leerArchivo(
  file: File,
  pesoActual = 0,
): Promise<Resultado> {
  const tipo = tipoDeArchivo(file);
  if (tipo === null) {
    return {
      ok: false,
      error: `No puedo adjuntar “${file.name}”. ${AVISO_TIPO_NO_SOPORTADO}`,
    };
  }

  let adjunto: Adjunto;
  if (tipo === "imagen") {
    const c = await comprimirImagen(file);
    if (!c.ok) return c;
    adjunto = {
      nombre: file.name || "imagen.jpg",
      tipo: "imagen",
      mime: c.mime,
      contenido: c.base64,
    };
  } else if (tipo === "pdf") {
    if (file.size > LIMITE_BINARIO) {
      return {
        ok: false,
        error: `“${file.name}” pesa ${fmtBytes(file.size)}; el máximo para un PDF es ${fmtBytes(LIMITE_BINARIO)}.`,
      };
    }
    let base64: string;
    try {
      base64 = await blobABase64(file);
    } catch {
      return { ok: false, error: `No se pudo leer “${file.name}”.` };
    }
    adjunto = {
      nombre: file.name || "documento.pdf",
      tipo: "pdf",
      mime: "application/pdf",
      contenido: base64,
    };
  } else {
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
    adjunto = {
      nombre: file.name || "archivo.txt",
      tipo: "texto",
      mime: file.type || "text/plain",
      contenido,
    };
  }

  if (pesoActual + pesoAdjunto(adjunto) > LIMITE_INTERCAMBIO) {
    return {
      ok: false,
      error: `Con “${file.name}” los adjuntos de esta pregunta superan el máximo (${fmtBytes(LIMITE_INTERCAMBIO)}).`,
    };
  }
  return { ok: true, adjunto };
}
