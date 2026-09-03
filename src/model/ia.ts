import type { Mensaje } from "./contexto";
import type { Adjunto, Proveedor } from "./intercambio";
import { proxyIAUrl } from "./supabase";

// Adjuntos multimedia de un mensaje (T16b/c). Cada adaptador los mapea a su
// formato: Claude → bloque `image` / `document`; Gemini → `inline_data`;
// OpenAI-compat → `image_url` (solo imágenes; el PDF no se manda por proxy).
function imagenesDe(m: Mensaje): Adjunto[] {
  return (m.adjuntos ?? []).filter((a) => a.tipo === "imagen");
}
function multimediaDe(m: Mensaje): Adjunto[] {
  return (m.adjuntos ?? []).filter(
    (a) => a.tipo === "imagen" || a.tipo === "pdf",
  );
}
function hayImagenes(mensajes: Mensaje[]): boolean {
  return mensajes.some((m) => imagenesDe(m).length > 0);
}

// Punto único de entrada a la IA. Adentro decide el proveedor (spec §6): sumar
// otro proveedor = un `case` nuevo acá, sin tocar la lógica del árbol.
//
// La clave de API vive solo en el navegador del usuario (ver configIA.ts) y se
// manda directo al proveedor — nunca a un servidor propio (invariante CLAUDE.md).

export type ConfigIA = {
  proveedor: Proveedor;
  apiKey: string;
  modelo: string;
};

// Claude y Gemini andan directo desde el navegador. DeepSeek y GPT necesitan el
// proxy de 3maps (no habilitan CORS) — aparecen en la lista pero solo funcionan
// con el toggle "usar proxy" activado en ⚙️. Ver decisiones §7a.
export const PROVEEDORES_DISPONIBLES: Proveedor[] = [
  "gemini",
  "claude",
  "groq",
  "openrouter",
  "huggingface",
  "deepseek",
  "gpt",
  "ollama",
  "webllm",
];

// Modelo local corriendo en la máquina del usuario (Ollama, API OpenAI-compat en
// :11434). NO usa el proxy ni una API key — `fetch` directo a localhost. Opción
// avanzada: anda en Chrome/Edge de escritorio (localhost es "secure context"),
// NO en Safari ni en móvil, y el servidor Ollama tiene que estar corriendo.
// Ver decisiones §7a. Override para apuntar a otra máquina de la LAN:
// `NEXT_PUBLIC_OLLAMA_URL`.
export const OLLAMA_URL = (
  process.env.NEXT_PUBLIC_OLLAMA_URL || "http://localhost:11434"
).replace(/\/+$/, "");

// Sentinel que guarda `configIA` como "apiKey" de un proveedor sin key (Ollama,
// WebLLM): el almacén tira las entradas sin apiKey y estos no tienen una.
// `llamarIA` / los adaptadores lo ignoran. No es un secreto.
export const OLLAMA_SENTINEL = "local";
export const WEBLLM_SENTINEL = "browser";

// Proveedores locales sin auth: no piden API key ni proxy. `llamarIA` /
// `listarModelos` saltean el chequeo de key; `SettingsPanel` oculta el input.
export function proveedorSinKey(p: Proveedor): boolean {
  return p === "ollama" || p === "webllm";
}

// Proveedores OpenAI-compatibles que NO habilitan CORS desde el navegador →
// van contra su API vía el proxy `ia-proxy` (opt-in "usar proxy" en ⚙️).
export const PROVEEDORES_VIA_PROXY: Proveedor[] = [
  "deepseek",
  "gpt",
  "groq",
  "openrouter",
  "huggingface",
];

export const MODELO_POR_DEFECTO: Record<Proveedor, string> = {
  claude: "claude-haiku-4-5",
  deepseek: "deepseek-v4-flash",
  gpt: "gpt-5.4-mini",
  gemini: "gemini-3.7-flash",
  groq: "llama-3.3-70b-versatile",
  openrouter: "nvidia/nemotron-3-super-120b-a12b:free",
  huggingface: "Qwen/Qwen2.5-72B-Instruct",
  ollama: "qwen2.5vl:7b",
  webllm: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
};

// Modelos de Gemini que ya no sirven para una key free tier nueva y hay que
// migrar al default (`configIA.ts`) + esconder de la lista (`listarModelosGemini`,
// chips de ⚙️). Ver decisiones §7b.
//  - retirados por Google → 404 "no existe el modelo"
//  - alias `*-latest` → resuelven a un flash paid / "invalid argument" en free tier
//  - `2.5-flash-lite` / `2.5-pro` → 404 "no longer available to new users" (una cuenta
//    vieja / con billing todavía los llama, pero `ListModels` los ofrece a keys que NO
//    pueden usarlos → confunden más de lo que sirven; Alan 02-09). El `2.5-flash` a secas
//    sí anda, no va acá.
export const GEMINI_MODELOS_MUERTOS = new Set([
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-pro",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-flash-latest",
  "gemini-pro-latest",
  "gemini-flash-lite-latest",
]);

export const NOMBRE_PROVEEDOR: Record<Proveedor, string> = {
  claude: "Claude (Anthropic)",
  deepseek: "DeepSeek",
  gpt: "OpenAI",
  gemini: "Google Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
  huggingface: "Hugging Face",
  ollama: "Ollama (local)",
  webllm: "Modelo local (en el navegador)",
};

// Pista de formato de la API key, por proveedor (para el placeholder del input).
export const PISTA_API_KEY: Record<Proveedor, string> = {
  claude: "sk-ant-…",
  deepseek: "sk-…",
  gpt: "sk-…",
  gemini: "AQ.… o AIza…",
  groq: "gsk_…",
  openrouter: "sk-or-…",
  huggingface: "hf_…",
  ollama: "", // no usa API key
  webllm: "", // no usa API key — corre en el navegador
};

// Mini-guía "cómo consigo mi API key", por proveedor — para gente que nunca usó
// una. `url` se abre en otra pestaña; `pasos` es una lista corta y llana.
// `abierto`: el proveedor sirve principalmente modelos open-weights (Llama, Qwen,
// DeepSeek, GLM…) en vez de un modelo propio cerrado.
export const GUIA_API_KEY: Record<
  Proveedor,
  { url: string; gratis: boolean; abierto?: boolean; pasos: string[] }
> = {
  gemini: {
    url: "https://aistudio.google.com/apikey",
    gratis: true,
    pasos: [
      "Abrí el link y entrá con tu cuenta de Google.",
      'Clic en "Crear clave de API" (o "Create API key").',
      "Copiá la clave que aparece y pegala acá abajo.",
    ],
  },
  claude: {
    url: "https://console.anthropic.com/settings/keys",
    gratis: false,
    pasos: [
      "Abrí el link y creá una cuenta (o iniciá sesión).",
      "Necesita saldo: cargá unos dólares en Billing.",
      'En "API Keys" → "Create Key", copiá y pegá acá.',
    ],
  },
  groq: {
    url: "https://console.groq.com/keys",
    gratis: true,
    abierto: true,
    pasos: [
      "Abrí el link y registrate (con Google o mail).",
      'Clic en "Create API Key", ponele un nombre.',
      "Copiá la clave (empieza con gsk_) y pegala acá.",
    ],
  },
  openrouter: {
    url: "https://openrouter.ai/keys",
    gratis: true,
    abierto: true,
    pasos: [
      "Abrí el link y entrá con Google o GitHub.",
      'Clic en "Create Key".',
      "Copiá la clave (empieza con sk-or-) y pegala acá. Elegí modelos que terminan en \":free\".",
      "El free tier son 50 llamadas por día, sin tarjeta. Si un modelo \":free\" tira error, su proveedor está saturado — probá otro.",
    ],
  },
  huggingface: {
    url: "https://huggingface.co/settings/tokens",
    gratis: true,
    abierto: true,
    pasos: [
      "Abrí el link y creá una cuenta.",
      'Clic en "New token", tipo "Read".',
      "Copiá el token (empieza con hf_) y pegalo acá.",
    ],
  },
  deepseek: {
    url: "https://platform.deepseek.com/api_keys",
    gratis: false,
    pasos: [
      "Abrí el link y creá una cuenta.",
      "Necesita saldo (es barato): cargá unos dólares.",
      'Clic en "Create API key", copiá y pegá acá.',
    ],
  },
  gpt: {
    url: "https://platform.openai.com/api-keys",
    gratis: false,
    pasos: [
      "Abrí el link y creá una cuenta de OpenAI.",
      "Necesita saldo: cargá crédito en Billing.",
      'Clic en "Create new secret key", copiá y pegá acá.',
    ],
  },
  ollama: {
    url: "https://ollama.com/download",
    gratis: true,
    abierto: true,
    pasos: [
      "Instalá Ollama desde el link (Windows / macOS / Linux).",
      "Bajá un modelo: en la terminal, `ollama pull qwen2.5vl:7b` (texto + imágenes + PDF).",
      "El server queda escuchando en localhost:11434. No hay API key.",
      "Anda en Chrome/Edge de escritorio. Safari y el celular NO llegan a tu localhost.",
    ],
  },
  webllm: {
    url: "https://webllm.mlc.ai/",
    gratis: true,
    abierto: true,
    pasos: [
      "No instalás nada: el modelo corre en tu navegador con WebGPU.",
      "La 1ª vez se descargan ~2 GB de pesos (con barra de progreso), después queda cacheado.",
      "Necesita Chrome/Edge de escritorio y una GPU decente. No anda en móvil.",
    ],
  },
};

// A qué proveedor pertenece una key, por su prefijo — solo si es INEQUÍVOCO.
// `sk-` a secas (DeepSeek / GPT) es ambiguo → null. Lo usa `SettingsPanel` para
// ofrecer "cambiar de proveedor" cuando pegás una key que claramente es de otro.
export function proveedorDeLaKey(key: string): Proveedor | null {
  const k = key.trim();
  if (/^sk-ant-/.test(k)) return "claude";
  if (/^sk-or-/.test(k)) return "openrouter";
  if (/^(AQ\.|AIza)/.test(k)) return "gemini";
  if (/^gsk_/.test(k)) return "groq";
  if (/^hf_/.test(k)) return "huggingface";
  return null; // `sk-…` sin más = deepseek | gpt, no se puede distinguir
}

// Chequeo de formato local (gratis, sin red). No confirma que la key funcione
// ni que tenga saldo — solo detecta typos y keys pegadas en el proveedor
// equivocado (ej: una key de Gemini en el campo de Claude). Devuelve un aviso
// o null si el formato es plausible.
export function avisoFormatoKey(
  proveedor: Proveedor,
  key: string,
): string | null {
  const k = key.trim();
  if (k === "") return null; // vacío: no es un error, es "todavía no cargó"
  switch (proveedor) {
    case "claude":
      return /^sk-ant-/.test(k)
        ? null
        : "No parece una key de Claude (empiezan con \"sk-ant-\").";
    case "gemini":
      return /^(AQ\.|AIza)/.test(k)
        ? null
        : "No parece una key de Gemini (empiezan con \"AQ.\" o \"AIza\").";
    case "deepseek":
    case "gpt":
      return /^sk-/.test(k) ? null : "No parece una key válida (empiezan con \"sk-\").";
    case "groq":
      return /^gsk_/.test(k) ? null : "No parece una key de Groq (empiezan con \"gsk_\").";
    case "openrouter":
      return /^sk-or-/.test(k)
        ? null
        : "No parece una key de OpenRouter (empiezan con \"sk-or-\").";
    case "huggingface":
      return /^hf_/.test(k) ? null : "No parece un token de Hugging Face (empiezan con \"hf_\").";
    default:
      return null; // sin regla de formato para este proveedor
  }
}

// Tokens que reportó el proveedor para una llamada. `entrada` = prompt/input
// (incluye lo servido de caché, si el proveedor lo desglosa); `salida` =
// completion/output (incluye el "thinking" que se factura como salida).
export type UsoTokens = { entrada: number; salida: number };

// Lo que devuelve `llamarIA`: el texto de la respuesta + el `usage` si el
// proveedor lo mandó (`null` si no — no todos los free/proxy lo hacen).
// `truncada`: el proveedor cortó por el límite de tokens de salida
// (Gemini `MAX_TOKENS` / Claude `max_tokens` / OpenAI-compat `length`) — el
// texto está incompleto aunque el stream terminó "bien".
export type RespuestaIA = {
  texto: string;
  uso: UsoTokens | null;
  truncada?: boolean;
};

export type LlamadaOpts = {
  sistema?: string;
  maxTokens?: number;
  // Se llama con cada fragmento de texto que llega (para stremear en vivo).
  onTexto?: (delta: string, acumulado: string) => void;
  // Solo WebLLM: progreso de la descarga/carga de los pesos del modelo local
  // (`fraccion` 0..1). Ver `webllm.ts`.
  onProgreso?: (fraccion: number, texto: string) => void;
  signal?: AbortSignal;
  // El usuario aceptó que su key transite el proxy de 3maps (aplica a los
  // proveedores OpenAI-compatibles vía proxy). Sin esto tiran error explicativo.
  usarProxy?: boolean;
};

// Error "de dominio" con un mensaje ya apto para mostrarle al usuario.
export class ErrorIA extends Error {
  readonly causa?: unknown;
  constructor(message: string, causa?: unknown) {
    super(message);
    this.name = "ErrorIA";
    this.causa = causa;
  }
}

export async function llamarIA(
  config: ConfigIA,
  mensajes: Mensaje[],
  opts: LlamadaOpts = {},
): Promise<RespuestaIA> {
  // Ollama (localhost) y WebLLM (in-browser) corren sin auth — no hay key.
  if (!proveedorSinKey(config.proveedor) && !config.apiKey.trim()) {
    throw new ErrorIA("Falta la API key. Cargala en ⚙️.");
  }
  if (mensajes.length === 0) {
    throw new ErrorIA("No hay nada que mandarle a la IA.");
  }
  switch (config.proveedor) {
    case "claude":
      return llamarClaude(config, mensajes, opts);
    case "gemini":
      return llamarGemini(config, mensajes, opts);
    case "deepseek":
    case "gpt":
    case "groq":
    case "openrouter":
    case "huggingface":
      return llamarOpenAICompat(config, mensajes, opts);
    case "ollama":
      return llamarOllama(config, mensajes, opts);
    case "webllm":
      return llamarWebLLM(config, mensajes, opts);
    default:
      throw new ErrorIA(
        `El proveedor "${config.proveedor}" todavía no está implementado.`,
      );
  }
}

// Resumen corto de un tramo de la conversación (para la ventana de contexto,
// spec §5). Usa el mismo proveedor/modelo configurado. `usarProxy` hay que
// pasarlo para los proveedores OpenAI-compatibles (si no, tiran error y el
// resumen se saltea → contexto completo).
// `resumenPrevio` (B2): si viene, resume INCREMENTAL — parte del resumen que ya
// existía y solo agrega `intercambios` (los nuevos que cayeron fuera de la
// ventana). Así en una rama larga la entrada de esta llamada no crece sin tope.
export async function resumir(
  config: ConfigIA,
  intercambios: { pregunta: string; respuesta: string | null }[],
  opts: {
    usarProxy?: boolean;
    signal?: AbortSignal;
    resumenPrevio?: string;
  } = {},
): Promise<string> {
  // Acotar la entrada del resumen: cada respuesta recortada + tope total (los
  // intercambios MÁS VIEJOS se dropean si no entran). Si no, en una rama profunda
  // el propio prompt de resumen se pasa del contexto del modelo (sobre todo free)
  // y la llamada oculta falla → contexto entero → falla la real. Ver decisiones §10.
  const RESP_MAX = 800;
  const TOTAL_MAX = 14_000; // ~3.5k tokens — entra hasta en modelos free de 8k
  let bloques = intercambios.map(
    (i) =>
      `Pregunta: ${i.pregunta}\nRespuesta: ${(i.respuesta ?? "(sin respuesta)").slice(0, RESP_MAX)}`,
  );
  while (bloques.length > 1 && bloques.join("\n\n").length > TOTAL_MAX) {
    bloques = bloques.slice(1);
  }
  const texto =
    (bloques.length < intercambios.length
      ? "(intercambios más viejos omitidos por tamaño)\n\n"
      : "") + bloques.join("\n\n");
  const prompt = opts.resumenPrevio
    ? "Este es el resumen de la parte previa de una conversación:\n\n" +
      opts.resumenPrevio +
      "\n\nLa conversación siguió así:\n\n" +
      texto +
      "\n\nDevolvé un resumen ACTUALIZADO (que incluya lo anterior y lo nuevo) " +
      "en pocas frases, conservando los datos, decisiones y preferencias que " +
      "importan para seguir el hilo. Sin preámbulo."
    : "Resumí en pocas frases esta parte previa de una conversación, " +
      "conservando los datos, decisiones y preferencias que importan para " +
      "seguir el hilo. Sin preámbulo.\n\n" +
      texto;
  const r = await llamarIA(
    config,
    [{ rol: "user", texto: prompt }],
    { maxTokens: 2048, usarProxy: opts.usarProxy, signal: opts.signal },
  );
  return r.texto;
}

// ── Adaptador: Claude / Anthropic ──────────────────────────────────────────
// El SDK se importa dinámicamente: solo se baja cuando el usuario realmente
// dispara una llamada (no pesa en la carga inicial).

async function llamarClaude(
  config: ConfigIA,
  mensajes: Mensaje[],
  opts: LlamadaOpts,
): Promise<RespuestaIA> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({
    apiKey: config.apiKey,
    dangerouslyAllowBrowser: true,
  });

  let acumulado = "";
  try {
    const stream = client.messages.stream(
      {
        model: config.modelo,
        max_tokens: opts.maxTokens ?? 4096,
        ...(opts.sistema ? { system: opts.sistema } : {}),
        messages: mensajes.map((m) => {
          const media = multimediaDe(m);
          if (media.length === 0) return { role: m.rol, content: m.texto };
          return {
            role: m.rol,
            content: [
              ...media.map((a) =>
                a.tipo === "pdf"
                  ? {
                      type: "document" as const,
                      source: {
                        type: "base64" as const,
                        media_type: "application/pdf" as const,
                        data: a.contenido,
                      },
                    }
                  : {
                      type: "image" as const,
                      source: {
                        type: "base64" as const,
                        media_type: a.mime as
                          | "image/png"
                          | "image/jpeg"
                          | "image/webp",
                        data: a.contenido,
                      },
                    },
              ),
              { type: "text" as const, text: m.texto },
            ],
          };
        }),
      },
      { signal: opts.signal },
    );

    stream.on("text", (delta) => {
      acumulado += delta;
      opts.onTexto?.(delta, acumulado);
    });

    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      throw new ErrorIA("El modelo rechazó responder por seguridad.");
    }
    if (!acumulado) {
      for (const b of final.content) {
        if (b.type === "text") acumulado += b.text;
      }
    }
    const u = final.usage;
    const uso: UsoTokens | null = u
      ? {
          entrada:
            (u.input_tokens ?? 0) +
            (u.cache_read_input_tokens ?? 0) +
            (u.cache_creation_input_tokens ?? 0),
          salida: u.output_tokens ?? 0,
        }
      : null;
    return {
      texto: acumulado,
      uso,
      truncada: final.stop_reason === "max_tokens",
    };
  } catch (e) {
    if (e instanceof ErrorIA) throw e;
    if (esAbort(e)) throw e; // cancelación deliberada — la maneja quien llama
    throw new ErrorIA(mensajeLegible(e), e);
  }
}

// ── Adaptador: Gemini / Google ────────────────────────────────────────────
// REST directo (sin SDK): la API de Gemini permite llamadas desde el navegador
// y `:streamGenerateContent?alt=sse` devuelve un SSE simple. Tiene free tier.

type GeminiChunk = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
};

// Google satura los flash 3.x de a ratos y devuelve 503 (en el fetch inicial o
// inyectado a mitad del stream). Es transitorio: reintentamos UNA vez con 1s de
// pausa, pero solo si todavía no llegó nada de texto — si ya hubo streaming,
// `intentarGemini` devuelve la parcial y no tira este error, así que `onTexto`
// nunca se llamó en el intento que falla y no hay doble emisión.
class ErrorGemini503 extends Error {}

async function llamarGemini(
  config: ConfigIA,
  mensajes: Mensaje[],
  opts: LlamadaOpts,
): Promise<RespuestaIA> {
  const modelo = config.modelo || MODELO_POR_DEFECTO.gemini;
  for (let intento = 0; ; intento++) {
    try {
      return await intentarGemini(config, modelo, mensajes, opts);
    } catch (e) {
      if (e instanceof ErrorGemini503 && intento === 0) {
        await esperar(1000, opts.signal);
        continue;
      }
      if (e instanceof ErrorGemini503) throw new ErrorIA(e.message, e);
      throw e;
    }
  }
}

async function intentarGemini(
  config: ConfigIA,
  modelo: string,
  mensajes: Mensaje[],
  opts: LlamadaOpts,
): Promise<RespuestaIA> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelo,
  )}:streamGenerateContent?alt=sse`;

  const body: Record<string, unknown> = {
    contents: mensajes.map((m) => ({
      role: m.rol === "assistant" ? "model" : "user",
      parts: [
        ...multimediaDe(m).map((a) => ({
          inline_data: {
            mime_type: a.tipo === "pdf" ? "application/pdf" : a.mime,
            data: a.contenido,
          },
        })),
        { text: m.texto },
      ],
    })),
    generationConfig: {
      // Headroom generoso: los flash de Gemini "piensan" y el thinking cuenta
      // contra maxOutputTokens; si queda corto, la respuesta sale vacía.
      maxOutputTokens: opts.maxTokens ?? 8192,
      // Thinking al mínimo — para un chat queremos respuesta directa. La forma
      // del parámetro cambió entre generaciones: 3.x usa `thinkingLevel`,
      // 2.x/1.x usan `thinkingBudget` (mandar el otro = 400 "invalid argument").
      thinkingConfig: /gemini-[3-9]/.test(modelo)
        ? { thinkingLevel: "low" }
        : { thinkingBudget: 0 },
    },
  };
  if (opts.sistema) {
    body.systemInstruction = { parts: [{ text: opts.sistema }] };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": config.apiKey,
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    if (esAbort(e)) throw e;
    throw new ErrorIA(
      "No se pudo conectar con la API de Gemini (red, CORS o CSP).",
      e,
    );
  }

  if (!res.ok || !res.body) {
    const msg = await mensajeErrorGemini(res, modelo, hayImagenes(mensajes));
    if (res.status === 503) throw new ErrorGemini503(msg);
    throw new ErrorIA(msg);
  }

  let acumulado = "";
  let finish: string | null = null;
  let bloqueo: string | null = null;
  let huboThoughts = false;
  let errorEnStream: string | null = null;
  let error503EnStream = false;
  let uso: UsoTokens | null = null;

  type GeminiPayload = GeminiChunk & {
    error?: { message?: string; code?: number; status?: string };
  };

  // El stream de Gemini es una línea `data: {json}` por evento (JSON de una
  // línea). Procesamos línea a línea — así da igual si los eventos van separados
  // por "\n" o "\n\n", y si Google inyecta un {error:...} multilínea al cortar,
  // sus líneas simplemente no empiezan con "data:".
  const procesarLinea = (linea: string) => {
    const l = linea.trim();
    if (!l.startsWith("data:")) return;
    const payload = l.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let chunk: GeminiPayload;
    try {
      chunk = JSON.parse(payload) as GeminiPayload;
    } catch {
      return; // fragmento parcial o no-JSON: lo ignoramos
    }
    if (chunk.error?.message) {
      errorEnStream = chunk.error.message;
      if (chunk.error.code === 503 || chunk.error.status === "UNAVAILABLE") {
        error503EnStream = true;
      }
      return;
    }
    const cand = chunk.candidates?.[0];
    for (const p of cand?.content?.parts ?? []) {
      if (p.thought) {
        huboThoughts = true;
        continue; // los "pensamientos" no son la respuesta
      }
      if (p.text) {
        acumulado += p.text;
        opts.onTexto?.(p.text, acumulado);
      }
    }
    if (cand?.finishReason) finish = cand.finishReason;
    if (chunk.promptFeedback?.blockReason) {
      bloqueo = chunk.promptFeedback.blockReason;
    }
    // `usageMetadata` llega acumulativo; el último visto es el bueno. El thinking
    // se factura como salida → se suma a `candidatesTokenCount`.
    if (chunk.usageMetadata) {
      const um = chunk.usageMetadata;
      uso = {
        entrada: um.promptTokenCount ?? 0,
        salida: (um.candidatesTokenCount ?? 0) + (um.thoughtsTokenCount ?? 0),
      };
    }
  };

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let crudo = ""; // todo lo que no fue una línea `data:` (para pescar un {error})

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lineas = buf.split("\n");
      buf = lineas.pop() ?? ""; // la última puede estar incompleta
      for (const linea of lineas) {
        if (linea.trim().startsWith("data:")) procesarLinea(linea);
        else crudo += linea + "\n";
      }
    }
    if (buf.trim().startsWith("data:")) procesarLinea(buf);
    else crudo += buf;
  } catch (e) {
    if (esAbort(e)) throw e;
    // Si ya llegó texto, lo devolvemos igual (stream cortado a mitad).
    if (acumulado) return { texto: acumulado, uso };
    throw new ErrorIA(mensajeLegible(e), e);
  }

  // Un {error:...} pretty-printed que Google inyecta al cortar el stream.
  if (!errorEnStream && crudo.includes('"error"')) {
    try {
      const j = JSON.parse(crudo.trim()) as {
        error?: { message?: string; code?: number; status?: string };
      };
      if (j.error?.message) {
        errorEnStream = j.error.message;
        if (j.error.code === 503 || j.error.status === "UNAVAILABLE") {
          error503EnStream = true;
        }
      }
    } catch {
      // no era JSON limpio
    }
  }

  if (bloqueo || finish === "SAFETY" || finish === "PROHIBITED_CONTENT") {
    throw new ErrorIA("Gemini bloqueó la respuesta por seguridad.");
  }
  // Con texto parcial: lo devolvemos aunque el stream se haya cortado con error.
  // Si `finish` es MAX_TOKENS con texto → la respuesta está incompleta pero es
  // útil: se devuelve con `truncada` para que la UI lo marque.
  if (acumulado) {
    return { texto: acumulado, uso, truncada: finish === "MAX_TOKENS" };
  }

  if (errorEnStream) {
    const msg = `Gemini (${modelo}): ${errorEnStream}`;
    if (error503EnStream) throw new ErrorGemini503(msg);
    throw new ErrorIA(msg);
  }
  if (finish === "MAX_TOKENS" || huboThoughts) {
    throw new ErrorIA(
      `"${modelo}" gastó los tokens razonando sin responder ` +
        `(finishReason: ${finish ?? "—"}). Probá subir la ventana o cambiar de modelo.`,
    );
  }
  throw new ErrorIA(
    `Gemini (${modelo}) no devolvió texto (finishReason: ${finish ?? "ninguno"}). ` +
      `Probá de nuevo o cambiá de modelo.`,
  );
}

// Traduce una respuesta de error de Gemini (cualquier endpoint) a texto legible.
async function mensajeErrorGemini(
  res: Response,
  modelo?: string,
  conImagenes = false,
): Promise<string> {
  let m: string | undefined;
  let estado: string | undefined;
  try {
    const j = (await res.json()) as {
      error?: { message?: string; status?: string };
    };
    m = j?.error?.message;
    estado = j?.error?.status;
  } catch {
    // sin body legible
  }
  if (res.status === 400 && /api[_ ]?key/i.test(m ?? "")) {
    return "API key de Gemini inválida.";
  }
  // Keys nuevas con formato "AQ.…": en algunas cuentas de Google todavía no
  // funcionan contra la REST API (generativelanguage) y devuelven 401
  // ACCESS_TOKEN_TYPE_UNSUPPORTED. Es un problema del lado de Google.
  if (
    res.status === 401 ||
    estado === "ACCESS_TOKEN_TYPE_UNSUPPORTED" ||
    /ACCESS_TOKEN_TYPE_UNSUPPORTED/i.test(m ?? "")
  ) {
    return (
      "Tu cuenta de Google emite keys 'AQ.…' que todavía no funcionan en la " +
      "REST API de Gemini (error de Google, no de 3maps). Probá regenerar la " +
      "key en AI Studio o usar otra cuenta."
    );
  }
  // Para 403/404 el mensaje de Google suele explicar el motivo real (modelo
  // retirado, "usá tal API", región, billing) — no lo tapamos.
  if (res.status === 403) {
    return m
      ? `Gemini (403): ${m}`
      : "La API key de Gemini no tiene acceso (o falta habilitar la API).";
  }
  if (res.status === 404) {
    if (m) return `Gemini (404): ${m}`;
    return modelo
      ? `Tu key no tiene acceso al modelo "${modelo}".`
      : "Recurso de Gemini no encontrado.";
  }
  if (res.status === 429) {
    return "Límite de la API de Gemini alcanzado. Probá más tarde.";
  }
  if (res.status === 503) {
    return (
      m ??
      "El modelo de Gemini está saturado (503). Probá de nuevo o cambiá de modelo."
    );
  }
  const cola =
    conImagenes && res.status === 400
      ? " · Si adjuntaste una imagen: puede ser el problema (formato/tamaño)."
      : "";
  return (m ?? `Error ${res.status} de Gemini.`) + cola;
}

// ── Adaptador: OpenAI-compatible vía el proxy de 3maps ────────────────────
// DeepSeek, GPT, Groq, OpenRouter, Hugging Face: APIs
// OpenAI-compatibles que NO habilitan CORS → no se pueden llamar desde el
// navegador. El edge function `ia-proxy` reenvía y agrega el CORS. La key del
// usuario TRANSITA por el proxy (stateless, no se guarda) — se habilita con el
// toggle "usar proxy" en ⚙️. Ver decisiones §7a.

// El proveedor tal como lo espera el proxy (header `x-ia-provider`) → una clave
// del mapa `PROVEEDORES` del edge function `ia-proxy`.
const UPSTREAM: Partial<Record<Proveedor, string>> = {
  gpt: "openai",
  deepseek: "deepseek",
  groq: "groq",
  openrouter: "openrouter",
  huggingface: "huggingface",
};
function upstreamDe(proveedor: Proveedor): string {
  return UPSTREAM[proveedor] ?? proveedor;
}

type OpenAIChunk = {
  choices?: Array<{
    delta?: { content?: string; reasoning?: string; reasoning_content?: string };
    finish_reason?: string | null;
  }>;
  error?: { message?: string };
  // Con `stream_options.include_usage` el chunk final trae esto (y `choices: []`).
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
};

// Los modelos "reasoning" (gpt-oss, qwen3, DeepSeek-R1…) mandan su cadena de
// pensamiento antes de la respuesta: a veces en un campo aparte (`reasoning` /
// `reasoning_content`, que ignoramos), a veces inline entre `<think>…</think>`
// (algunos usan `◁think▷…◁/think▷`). No es la respuesta → se saca. Durante el
// stream, un `<think>` sin cerrar todavía oculta todo lo que viene después.
function sinRazonamiento(s: string): string {
  return s
    .replace(/<think>[\s\S]*?<\/think>\s*/gi, "")
    .replace(/◁think▷[\s\S]*?◁\/think▷\s*/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .replace(/◁think▷[\s\S]*$/i, "");
}

// Tokens especiales (padding / BOS-EOS / plantillas de chat) que algunos modelos
// filtran en la salida — nunca son contenido. Se sacan del stream para que no
// lleguen al `.md` (fuente de la verdad). `Markdown.tsx` (`sanitizarCrudo`) es la
// segunda red, para contenido ya guardado. Un modelo de HF devolvió `<PAD>` × 2800
// y `rehype-raw` (tags sin cerrar) → stack overflow → crash del canvas. Ver F3-14.
const TOKENS_BASURA =
  /<\/?(?:pad|unk|mask|cls|sep|s|bos|eos|eot_id|end_of_turn|start_of_turn|begin_of_text|end_of_text|\|[^>]*\|)>/gi;

function sinTokensBasura(s: string): string {
  return s.replace(TOKENS_BASURA, "");
}

// `content` de un mensaje OpenAI-compat: texto plano, o bloques (con imágenes).
type ContenidoOpenAI =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

// El body de una llamada `/chat/completions` OpenAI-compat. Igual para el proxy
// y para Ollama local — cambia solo a dónde se manda (`llamarOpenAICompat` vs
// `llamarOllama`).
function cuerpoOpenAICompat(
  config: ConfigIA,
  mensajes: Mensaje[],
  opts: LlamadaOpts,
): Record<string, unknown> {
  return {
    model: config.modelo,
    stream: true,
    // Pide que el chunk final del SSE incluya el `usage` (tokens in/out). Groq,
    // OpenRouter, DeepSeek, OpenAI y Ollama lo soportan; si algún proveedor lo
    // rechaza, simplemente no viene el `usage` (o habría que gatearlo).
    stream_options: { include_usage: true },
    messages: [
      ...(opts.sistema
        ? [{ role: "system", content: opts.sistema as ContenidoOpenAI }]
        : []),
      ...mensajes.map((m) => {
        const imgs = imagenesDe(m);
        const content: ContenidoOpenAI =
          imgs.length === 0
            ? m.texto
            : [
                ...imgs.map((a) => ({
                  type: "image_url" as const,
                  image_url: { url: `data:${a.mime};base64,${a.contenido}` },
                })),
                { type: "text" as const, text: m.texto },
              ];
        return { role: m.rol, content };
      }),
    ],
    // OpenAI (modelos nuevos) renombró `max_tokens` → `max_completion_tokens`;
    // DeepSeek / Ollama siguen con `max_tokens`.
    [config.proveedor === "gpt" ? "max_completion_tokens" : "max_tokens"]:
      opts.maxTokens ?? 4096,
  };
}

async function llamarOpenAICompat(
  config: ConfigIA,
  mensajes: Mensaje[],
  opts: LlamadaOpts,
): Promise<RespuestaIA> {
  const nombre = NOMBRE_PROVEEDOR[config.proveedor];
  if (!opts.usarProxy) {
    throw new ErrorIA(
      `${nombre} necesita el proxy de 3maps (esas APIs no se pueden llamar ` +
        `directo desde el navegador). Activá "usar proxy" en ⚙️.`,
    );
  }
  const proxy = proxyIAUrl();
  if (!proxy) {
    throw new ErrorIA(
      `Esta instancia de 3maps no tiene el proxy configurado, así que ${nombre} ` +
        `no está disponible. Usá Gemini o Claude.`,
    );
  }

  let res: Response;
  try {
    res = await fetch(proxy, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ia-provider": upstreamDe(config.proveedor),
        "x-ia-path": "/chat/completions",
        "x-ia-key": config.apiKey,
      },
      body: JSON.stringify(cuerpoOpenAICompat(config, mensajes, opts)),
      signal: opts.signal,
    });
  } catch (e) {
    if (esAbort(e)) throw e;
    throw new ErrorIA(
      `No se pudo contactar el proxy de 3maps para ${nombre} (red o CSP).`,
      e,
    );
  }

  if (!res.ok || !res.body) {
    throw new ErrorIA(
      await mensajeErrorOpenAICompat(res, nombre, hayImagenes(mensajes)),
    );
  }

  return procesarStreamOpenAICompat(res.body, nombre, opts);
}

// Ollama local: mismo formato OpenAI-compat, pero `fetch` directo a
// `localhost:11434` — sin proxy, sin API key, sin CORS (localhost es "secure
// context" en Chrome/Edge). Ver decisiones §7a.
async function llamarOllama(
  config: ConfigIA,
  mensajes: Mensaje[],
  opts: LlamadaOpts,
): Promise<RespuestaIA> {
  const nombre = NOMBRE_PROVEEDOR[config.proveedor];
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpoOpenAICompat(config, mensajes, opts)),
      signal: opts.signal,
    });
  } catch (e) {
    if (esAbort(e)) throw e;
    throw new ErrorIA(
      `No se pudo contactar Ollama en ${OLLAMA_URL}. ¿Está corriendo el server ` +
        `(\`ollama serve\`)? Safari y el celular no llegan a tu localhost.`,
      e,
    );
  }
  if (!res.ok || !res.body) {
    throw new ErrorIA(await mensajeErrorOpenAICompat(res, nombre, hayImagenes(mensajes)));
  }
  return procesarStreamOpenAICompat(res.body, nombre, opts);
}

// WebLLM: modelo corriendo in-browser con WebGPU. El engine (con su Web Worker)
// vive en `webllm.ts`; acá solo se itera el stream, que ya es OpenAI-compat pero
// como AsyncGenerator de objetos (no SSE de texto → no reusa
// `procesarStreamOpenAICompat`). Spike v2 — ver `tasks/v2-webllm-spec.md`.
async function llamarWebLLM(
  config: ConfigIA,
  mensajes: Mensaje[],
  opts: LlamadaOpts,
): Promise<RespuestaIA> {
  const { obtenerEngineWebLLM, hayWebGPU } = await import("./webllm");
  if (!hayWebGPU()) {
    throw new ErrorIA(
      "Este navegador no tiene WebGPU. El modelo local necesita Chrome o Edge " +
        "de escritorio (no anda en Safari ni en el celular).",
    );
  }

  let engine;
  try {
    engine = await obtenerEngineWebLLM(config.modelo, opts.onProgreso);
  } catch (e) {
    if (esAbort(e)) throw e;
    const m = e instanceof Error ? e.message : String(e);
    if (/GPU|WebGPU/i.test(m)) {
      throw new ErrorIA(
        "No se pudo iniciar WebGPU. Necesitás Chrome/Edge de escritorio con una " +
          "GPU; en gráficas viejas o integradas puede fallar. Detalle: " + m,
        e,
      );
    }
    throw new ErrorIA("No se pudo cargar el modelo local: " + m, e);
  }

  const stream = await engine.chat.completions.create({
    stream: true,
    stream_options: { include_usage: true },
    messages: [
      ...(opts.sistema ? [{ role: "system" as const, content: opts.sistema }] : []),
      ...mensajes.map((m) => ({ role: m.rol, content: m.texto })),
    ],
    max_tokens: opts.maxTokens ?? 4096,
  });

  let crudo = "";
  let acumulado = "";
  let uso: UsoTokens | null = null;
  let finish: string | null = null;
  try {
    for await (const chunk of stream) {
      if (opts.signal?.aborted) {
        await engine.interruptGenerate();
        break;
      }
      const trozo = chunk.choices[0]?.delta?.content ?? "";
      if (chunk.choices[0]?.finish_reason) finish = chunk.choices[0].finish_reason;
      if (chunk.usage) {
        uso = {
          entrada: chunk.usage.prompt_tokens ?? 0,
          salida: chunk.usage.completion_tokens ?? 0,
        };
      }
      if (!trozo) continue;
      crudo += trozo;
      const limpio = sinTokensBasura(sinRazonamiento(crudo));
      if (limpio === acumulado) continue;
      const delta = limpio.startsWith(acumulado)
        ? limpio.slice(acumulado.length)
        : limpio;
      acumulado = limpio;
      opts.onTexto?.(delta, acumulado);
    }
  } catch (e) {
    if (esAbort(e)) throw e;
    if (acumulado) return { texto: acumulado, uso };
    throw new ErrorIA(mensajeLegible(e), e);
  }
  if (acumulado) {
    return { texto: acumulado, uso, truncada: finish === "length" };
  }
  throw new ErrorIA(
    "El modelo local no devolvió texto. Probá de nuevo o cambiá de modelo.",
  );
}

// Lee el stream SSE de una respuesta `/chat/completions` OpenAI-compat y devuelve
// el texto (sin cadena de pensamiento ni tokens internos) + el `usage`.
async function procesarStreamOpenAICompat(
  stream: ReadableStream<Uint8Array>,
  nombre: string,
  opts: LlamadaOpts,
): Promise<RespuestaIA> {
  let crudo = ""; // contenido tal cual llega (puede traer <think>…)
  let acumulado = ""; // lo mismo pero ya sin la cadena de pensamiento
  let errorEnStream: string | null = null;
  let uso: UsoTokens | null = null;
  let finish: string | null = null; // `length` = cortada por el límite de salida
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = "";

  const procesarLinea = (linea: string) => {
    const l = linea.trim();
    if (!l.startsWith("data:")) return;
    const payload = l.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let chunk: OpenAIChunk;
    try {
      chunk = JSON.parse(payload) as OpenAIChunk;
    } catch {
      return; // fragmento parcial
    }
    if (chunk.error?.message) {
      errorEnStream = chunk.error.message;
      return;
    }
    if (chunk.usage) {
      uso = {
        entrada: chunk.usage.prompt_tokens ?? 0,
        salida: chunk.usage.completion_tokens ?? 0,
      };
    }
    if (chunk.choices?.[0]?.finish_reason) {
      finish = chunk.choices[0].finish_reason;
    }
    const trozo = chunk.choices?.[0]?.delta?.content;
    if (!trozo) return; // `reasoning` / `reasoning_content` se ignoran
    crudo += trozo;
    const limpio = sinTokensBasura(sinRazonamiento(crudo));
    if (limpio === acumulado) return;
    const delta = limpio.startsWith(acumulado)
      ? limpio.slice(acumulado.length)
      : limpio;
    acumulado = limpio;
    opts.onTexto?.(delta, acumulado);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lineas = buf.split("\n");
      buf = lineas.pop() ?? "";
      for (const linea of lineas) procesarLinea(linea);
    }
    if (buf) procesarLinea(buf);
  } catch (e) {
    if (esAbort(e)) throw e;
    if (acumulado) return { texto: acumulado, uso }; // stream cortado a mitad
    throw new ErrorIA(mensajeLegible(e), e);
  }

  if (acumulado) return { texto: acumulado, uso, truncada: finish === "length" };
  if (errorEnStream) throw new ErrorIA(`${nombre}: ${errorEnStream}`);
  // Llegó contenido pero quedó vacío tras limpiar: era TODO cadena de pensamiento
  // (nunca cerró el `<think>` / gastó el presupuesto) o TODO tokens internos
  // (`<PAD>`…). En cualquier caso no hay respuesta → error reintentable.
  if (crudo.trim()) {
    throw new ErrorIA(
      `El modelo no devolvió una respuesta usable (solo razonamiento o tokens ` +
        `internos). Probá subir "max tokens", otro modelo, o rehacé.`,
    );
  }
  throw new ErrorIA(`${nombre} no devolvió texto. Probá de nuevo o cambiá de modelo.`);
}

async function mensajeErrorOpenAICompat(
  res: Response,
  nombre: string,
  conImagenes = false,
): Promise<string> {
  let m: string | undefined;
  try {
    // Los proveedores OpenAI-compat no coinciden en la forma del error: unos
    // mandan `{ error: { message } }`, otros `{ error: "…" }`, `{ message }` o
    // `{ detail }`. Probamos todas para no comernos el texto del proveedor.
    const j = (await res.json()) as {
      error?: { message?: string } | string;
      message?: string;
      detail?: string;
    };
    m =
      (typeof j?.error === "string" ? j.error : j?.error?.message) ||
      j?.message ||
      j?.detail ||
      undefined;
  } catch {
    // sin body legible
  }
  const cola = m ? ` ${m}` : "";
  if (res.status === 401) return `API key de ${nombre} inválida.`;
  if (res.status === 429) {
    // Cuota del free tier (se agota por día/mes y se repone) o rate-limit (por
    // minuto). NINGUNO de los dos es "falta de saldo" — el texto del proveedor
    // aclara cuál es.
    return `${nombre}: límite alcanzado (cuota gratuita o rate-limit, no es falta de saldo).${cola}`.trim();
  }
  if (
    res.status === 402 ||
    /\b(balance|billing|insufficient|credit|payment|no funds)\b/i.test(m ?? "")
  ) {
    return `${nombre}: la cuenta no tiene saldo, o el plan no incluye este modelo.${cola}`.trim();
  }
  if (res.status === 403) {
    return `${nombre} (403): ${m ?? "sin acceso — puede que el modelo requiera un plan pago"}.`;
  }
  if (res.status === 404) {
    return m ? `${nombre} (404): ${m}` : `El modelo indicado no existe en ${nombre}.`;
  }
  if (res.status === 502 || res.status === 503) {
    return `${nombre} está caído o saturado. Probá de nuevo.`;
  }
  // El contexto (conversación acumulada) no entra en el modelo. Pasa en ramas
  // profundas con modelos free de poca ventana.
  if (
    res.status === 413 ||
    /context length|context window|maximum context|too many tokens|reduce the length|context_length_exceeded|input is too long|prompt is too long/i.test(
      m ?? "",
    )
  ) {
    return `${nombre}: la conversación es muy larga para este modelo. Empezá una rama nueva (⑂), bajá "ventana de contexto" en ⚙️ · Lienzo, o elegí un modelo con más contexto.`;
  }
  const pistaImg =
    conImagenes && [400, 415, 422].includes(res.status)
      ? ` · ¿Este modelo acepta imágenes? Muchos modelos abiertos no — probá Gemini o Claude.`
      : "";
  return (m ? `${nombre}: ${m}` : `Error ${res.status} de ${nombre}.`) + pistaImg;
}

// ── Listar modelos disponibles para la key del usuario ────────────────────
// Cada key tiene acceso a un set distinto de modelos; esto evita adivinar
// nombres. Lo usa el botón "ver modelos disponibles" de SettingsPanel.
// WebLLM: lista corta curada (el spec pide 2-3 con default 3B). El catálogo
// completo de `prebuiltAppConfig` son ~150 ids.
export const MODELOS_WEBLLM: string[] = [
  "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  "Llama-3.2-3B-Instruct-q4f16_1-MLC",
  "Qwen2.5-7B-Instruct-q4f16_1-MLC",
];

// Info para que el usuario elija (SettingsPanel la muestra al lado de cada
// modelo). `gb` = tamaño aprox. de la descarga; `nota` = para quién es.
export const INFO_MODELO_WEBLLM: Record<
  string,
  { nombre: string; gb: number; nota: string; recomendado?: boolean }
> = {
  "Llama-3.2-1B-Instruct-q4f16_1-MLC": {
    nombre: "Llama 3.2 · 1B",
    gb: 0.9,
    nota: "Rápido pero flojo. Solo si tu compu es limitada o la GPU es vieja.",
  },
  "Llama-3.2-3B-Instruct-q4f16_1-MLC": {
    nombre: "Llama 3.2 · 3B",
    gb: 2.3,
    nota: "Equilibrado. Buen punto de partida — descarga corta, calidad decente.",
    recomendado: true,
  },
  "Qwen2.5-7B-Instruct-q4f16_1-MLC": {
    nombre: "Qwen 2.5 · 7B",
    gb: 5.1,
    nota: "El más capaz. Necesita GPU con ≥6 GB de VRAM libre.",
  },
};

// Qué modelo recomendar según el nivel de equipo detectado (`nivelEquipoWebLLM`
// en webllm.ts). El default estático sigue siendo el `medio` (3B).
export const MODELO_WEBLLM_POR_NIVEL: Record<"bajo" | "medio" | "alto", string> = {
  bajo: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  medio: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
  alto: "Qwen2.5-7B-Instruct-q4f16_1-MLC",
};

export async function listarModelos(config: ConfigIA): Promise<string[]> {
  if (!proveedorSinKey(config.proveedor) && !config.apiKey.trim()) {
    throw new ErrorIA("Falta la API key. Cargala en ⚙️.");
  }
  switch (config.proveedor) {
    case "claude":
      return listarModelosClaude(config);
    case "gemini":
      return listarModelosGemini(config);
    case "deepseek":
    case "gpt":
    case "groq":
    case "openrouter":
    case "huggingface":
      return listarModelosOpenAICompat(config);
    case "ollama":
      return listarModelosOllama();
    case "webllm":
      return MODELOS_WEBLLM;
    default:
      throw new ErrorIA(
        `Listar modelos no está implementado para "${config.proveedor}".`,
      );
  }
}

// Modelos de proveedores OpenAI-compat que NO sirven para un chat en 3maps y se
// esconden de los chips de ⚙️ (el usuario igual puede tiparlos). Ver estado.md
// "Modelos probados". `patron` = STT/TTS/clasificadores (cualquier proveedor);
// `porProveedor` = ids puntuales.
const MODELO_OCULTO_PATRON =
  /whisper|orpheus|prompt-guard|playai|text-to-speech|speech-to-text|\bembed(ding)?\b|moderation/i;
const MODELOS_OCULTOS_POR_PROVEEDOR: Partial<Record<Proveedor, Set<string>>> = {
  // `allam-2-7b` responde en árabe — inútil para un usuario en español (Alan 02-09).
  groq: new Set(["allam-2-7b"]),
};
// `false` para modelos que no son chat útil (STT/TTS/clasificador/idioma raro).
// Lo usa `listarModelosOpenAICompat` para los chips y `configIA` para migrar una
// config vieja que quedó apuntando a uno de estos.
export function modeloListable(proveedor: Proveedor, id: string): boolean {
  if (MODELO_OCULTO_PATRON.test(id)) return false;
  return !MODELOS_OCULTOS_POR_PROVEEDOR[proveedor]?.has(id);
}

async function listarModelosOpenAICompat(config: ConfigIA): Promise<string[]> {
  const nombre = NOMBRE_PROVEEDOR[config.proveedor];
  const proxy = proxyIAUrl();
  if (!proxy) {
    throw new ErrorIA(`El proxy de 3maps no está configurado; ${nombre} no disponible.`);
  }
  let res: Response;
  try {
    res = await fetch(proxy, {
      method: "GET",
      headers: {
        "x-ia-provider": upstreamDe(config.proveedor),
        "x-ia-path": "/models",
        "x-ia-key": config.apiKey,
      },
    });
  } catch (e) {
    throw new ErrorIA(`No se pudo contactar el proxy de 3maps (red o CSP).`, e);
  }
  if (!res.ok) throw new ErrorIA(await mensajeErrorOpenAICompat(res, nombre));
  const j = (await res.json()) as { data?: Array<{ id?: string }> };
  return (j.data ?? [])
    .map((m) => m.id ?? "")
    .filter(Boolean)
    .filter((id) => modeloListable(config.proveedor, id))
    .sort();
}

// Modelos que el usuario ya bajó (`ollama pull …`). `GET /api/tags` de Ollama.
async function listarModelosOllama(): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/tags`);
  } catch (e) {
    throw new ErrorIA(
      `No se pudo contactar Ollama en ${OLLAMA_URL}. ¿Está corriendo el server?`,
      e,
    );
  }
  if (!res.ok) {
    throw new ErrorIA(`Ollama respondió ${res.status} al listar modelos.`);
  }
  const j = (await res.json()) as { models?: Array<{ name?: string }> };
  const ids = (j.models ?? []).map((m) => m.name ?? "").filter(Boolean).sort();
  if (ids.length === 0) {
    throw new ErrorIA(
      `Ollama no tiene modelos bajados. Corré \`ollama pull qwen2.5vl:7b\`.`,
    );
  }
  return ids;
}

async function listarModelosGemini(config: ConfigIA): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
      { headers: { "x-goog-api-key": config.apiKey } },
    );
  } catch (e) {
    throw new ErrorIA(
      "No se pudo conectar con la API de Gemini (red, CORS o CSP).",
      e,
    );
  }
  if (!res.ok) {
    throw new ErrorIA(await mensajeErrorGemini(res));
  }
  const j = (await res.json()) as {
    models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
  };
  return (j.models ?? [])
    .filter((m) =>
      (m.supportedGenerationMethods ?? []).includes("generateContent"),
    )
    .map((m) => (m.name ?? "").replace(/^models\//, ""))
    .filter(
      (name) =>
        name.startsWith("gemini-") &&
        !GEMINI_MODELOS_MUERTOS.has(name) &&
        !/(image|tts|embedding|robotics|computer-use|transcribe|omni)/.test(name),
    )
    .sort();
}

async function listarModelosClaude(config: ConfigIA): Promise<string[]> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({
    apiKey: config.apiKey,
    dangerouslyAllowBrowser: true,
  });
  const ids: string[] = [];
  try {
    for await (const m of client.models.list()) ids.push(m.id);
  } catch (e) {
    if (e instanceof ErrorIA) throw e;
    throw new ErrorIA(mensajeLegible(e), e);
  }
  return ids;
}

// Pausa abortable — para el backoff del reintento de Gemini. Si la llamada se
// cancela durante la espera, rechaza con AbortError (lo trata quien llama).
function esperar(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function esAbort(e: unknown): boolean {
  return (
    !!e &&
    typeof e === "object" &&
    "name" in e &&
    (e as { name?: string }).name === "AbortError"
  );
}

function mensajeLegible(e: unknown): string {
  const err = e as { status?: number; message?: string };
  if (err?.status === 401) return "API key inválida o sin permisos.";
  if (err?.status === 403) return "La API key no tiene acceso a este modelo.";
  if (err?.status === 404) return `No existe el modelo indicado.`;
  if (err?.status === 429)
    return "Límite de la API alcanzado. Probá de nuevo en un rato.";
  if (err?.status === 400)
    return `Pedido inválido${err.message ? `: ${err.message}` : ""}.`;
  if (typeof err?.message === "string" && err.message) {
    // Errores de red del navegador suelen venir como "Failed to fetch".
    if (/failed to fetch|network\s?error/i.test(err.message)) {
      return "No se pudo conectar con la API (red, CORS o CSP).";
    }
    return err.message;
  }
  // Sin status ni message: suele ser la conexión cortada a mitad del stream
  // (proxy/proveedor que dropea la respuesta, a veces por un request muy grande).
  return "La IA cortó la conexión sin dar un motivo. Reintentá; si sigue, la conversación puede ser muy larga para el modelo — probá una rama nueva o un modelo con más contexto.";
}
