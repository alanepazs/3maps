import type { Mensaje } from "./contexto";
import type { Proveedor } from "./intercambio";
import { proxyIAUrl } from "./supabase";

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
  "siliconflow",
  "zhipu",
  "qwen",
  "moonshot",
  "mistral",
  "huggingface",
  "deepseek",
  "gpt",
];

// Proveedores OpenAI-compatibles que NO habilitan CORS desde el navegador →
// van contra su API vía el proxy `ia-proxy` (opt-in "usar proxy" en ⚙️).
export const PROVEEDORES_VIA_PROXY: Proveedor[] = [
  "deepseek",
  "gpt",
  "groq",
  "openrouter",
  "mistral",
  "huggingface",
  "zhipu",
  "qwen",
  "moonshot",
  "siliconflow",
];

export const MODELO_POR_DEFECTO: Record<Proveedor, string> = {
  claude: "claude-haiku-4-5",
  deepseek: "deepseek-v4-flash",
  gpt: "gpt-5.4-mini",
  gemini: "gemini-3.7-flash",
  groq: "llama-3.3-70b-versatile",
  openrouter: "nvidia/nemotron-3-super-120b-a12b:free",
  mistral: "mistral-small-latest",
  huggingface: "Qwen/Qwen2.5-72B-Instruct",
  zhipu: "glm-4-flash",
  qwen: "qwen-flash",
  moonshot: "moonshot-v1-8k",
  siliconflow: "deepseek-ai/DeepSeek-V3",
};

// Modelos de Gemini que ya no sirven para una key free tier nueva y hay que
// migrar al default (`configIA.ts`) + esconder de la lista (`listarModelosGemini`,
// datalist de ⚙️). Ver decisiones §7b.
//  - retirados por Google → 404 "no existe el modelo"
//  - alias `*-latest` → resuelven a un flash paid / "invalid argument" en free tier
// Los `gemini-2.5-*` NO van acá a propósito: una cuenta vieja / con billing los usa.
export const GEMINI_MODELOS_MUERTOS = new Set([
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-pro",
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
  mistral: "Mistral",
  huggingface: "Hugging Face",
  zhipu: "Zhipu / GLM",
  qwen: "Qwen (Alibaba)",
  moonshot: "Moonshot / Kimi",
  siliconflow: "SiliconFlow",
};

// Pista de formato de la API key, por proveedor (para el placeholder del input).
export const PISTA_API_KEY: Record<Proveedor, string> = {
  claude: "sk-ant-…",
  deepseek: "sk-…",
  gpt: "sk-…",
  gemini: "AQ.… o AIza…",
  groq: "gsk_…",
  openrouter: "sk-or-…",
  mistral: "tu API key de Mistral",
  huggingface: "hf_…",
  zhipu: "tu API key de Zhipu",
  qwen: "sk-…",
  moonshot: "sk-…",
  siliconflow: "sk-…",
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
  mistral: {
    url: "https://console.mistral.ai/api-keys",
    gratis: true,
    pasos: [
      "Abrí el link y creá una cuenta.",
      'Clic en "Create new key".',
      "Copiá la clave y pegala acá. (El plan gratis es 1 pedido por minuto.)",
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
  zhipu: {
    url: "https://open.bigmodel.cn/usercenter/apikeys",
    gratis: true,
    pasos: [
      "Abrí el link y registrate (la web está en chino — usá el traductor del navegador).",
      "En el panel de API Keys, creá una nueva.",
      'Copiá la clave y pegala acá. Modelo gratis: "glm-4-flash".',
    ],
  },
  qwen: {
    url: "https://bailian.console.aliyun.com/?apiKey=1",
    gratis: true,
    pasos: [
      "Abrí el link y creá una cuenta de Alibaba Cloud.",
      'Buscá "API-KEY" y creá una.',
      "Copiá la clave (empieza con sk-) y pegala acá.",
    ],
  },
  moonshot: {
    url: "https://platform.moonshot.cn/console/api-keys",
    gratis: true,
    pasos: [
      "Abrí el link y registrate (pide número de teléfono).",
      "En API Keys, creá una nueva.",
      "Copiá la clave (empieza con sk-) y pegala acá.",
    ],
  },
  siliconflow: {
    url: "https://cloud.siliconflow.cn/account/ak",
    gratis: true,
    abierto: true,
    pasos: [
      "Abrí el link y registrate con mail o GitHub.",
      'En "API Keys" → "Create Access Token".',
      "Copiá la clave (empieza con sk-) y pegala acá. Trae créditos gratis y da acceso a DeepSeek, Qwen, GLM, etc.",
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
};

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
    case "qwen":
    case "moonshot":
    case "siliconflow":
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
      return null; // mistral / zhipu no tienen prefijo fijo
  }
}

export type LlamadaOpts = {
  sistema?: string;
  maxTokens?: number;
  // Se llama con cada fragmento de texto que llega (para stremear en vivo).
  onTexto?: (delta: string, acumulado: string) => void;
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
): Promise<string> {
  if (!config.apiKey.trim()) {
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
    case "mistral":
    case "huggingface":
    case "zhipu":
    case "qwen":
    case "moonshot":
    case "siliconflow":
      return llamarOpenAICompat(config, mensajes, opts);
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
export async function resumir(
  config: ConfigIA,
  intercambios: { pregunta: string; respuesta: string | null }[],
  opts: { usarProxy?: boolean } = {},
): Promise<string> {
  const texto = intercambios
    .map(
      (i) =>
        `Pregunta: ${i.pregunta}\nRespuesta: ${i.respuesta ?? "(sin respuesta)"}`,
    )
    .join("\n\n");
  return llamarIA(
    config,
    [
      {
        rol: "user",
        texto:
          "Resumí en pocas frases esta parte previa de una conversación, " +
          "conservando los datos, decisiones y preferencias que importan para " +
          "seguir el hilo. Sin preámbulo.\n\n" +
          texto,
      },
    ],
    { maxTokens: 2048, usarProxy: opts.usarProxy },
  );
}

// ── Adaptador: Claude / Anthropic ──────────────────────────────────────────
// El SDK se importa dinámicamente: solo se baja cuando el usuario realmente
// dispara una llamada (no pesa en la carga inicial).

async function llamarClaude(
  config: ConfigIA,
  mensajes: Mensaje[],
  opts: LlamadaOpts,
): Promise<string> {
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
        messages: mensajes.map((m) => ({ role: m.rol, content: m.texto })),
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
    return acumulado;
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
): Promise<string> {
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
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelo,
  )}:streamGenerateContent?alt=sse`;

  const body: Record<string, unknown> = {
    contents: mensajes.map((m) => ({
      role: m.rol === "assistant" ? "model" : "user",
      parts: [{ text: m.texto }],
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
    const msg = await mensajeErrorGemini(res, modelo);
    if (res.status === 503) throw new ErrorGemini503(msg);
    throw new ErrorIA(msg);
  }

  let acumulado = "";
  let finish: string | null = null;
  let bloqueo: string | null = null;
  let huboThoughts = false;
  let errorEnStream: string | null = null;
  let error503EnStream = false;

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
    if (acumulado) return acumulado;
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
  if (acumulado) return acumulado;

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
async function mensajeErrorGemini(res: Response, modelo?: string): Promise<string> {
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
  return m ?? `Error ${res.status} de Gemini.`;
}

// ── Adaptador: OpenAI-compatible vía el proxy de 3maps ────────────────────
// DeepSeek, GPT, Groq, OpenRouter, Mistral, Hugging Face: APIs
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
  mistral: "mistral",
  huggingface: "huggingface",
  zhipu: "zhipu",
  qwen: "qwen",
  moonshot: "moonshot",
  siliconflow: "siliconflow",
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
};

// Los modelos "reasoning" (gpt-oss, qwen3, Kimi, DeepSeek-R1…) mandan su cadena
// de pensamiento antes de la respuesta: a veces en un campo aparte (`reasoning`
// / `reasoning_content`, que ignoramos), a veces inline entre `<think>…</think>`
// (Kimi usa `◁think▷…◁/think▷`). No es la respuesta → se saca. Durante el
// stream, un `<think>` sin cerrar todavía oculta todo lo que viene después.
function sinRazonamiento(s: string): string {
  return s
    .replace(/<think>[\s\S]*?<\/think>\s*/gi, "")
    .replace(/◁think▷[\s\S]*?◁\/think▷\s*/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .replace(/◁think▷[\s\S]*$/i, "");
}

async function llamarOpenAICompat(
  config: ConfigIA,
  mensajes: Mensaje[],
  opts: LlamadaOpts,
): Promise<string> {
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

  const body = {
    model: config.modelo,
    stream: true,
    messages: [
      ...(opts.sistema ? [{ role: "system", content: opts.sistema }] : []),
      ...mensajes.map((m) => ({ role: m.rol, content: m.texto })),
    ],
    // OpenAI (modelos nuevos) renombró `max_tokens` → `max_completion_tokens`;
    // DeepSeek sigue con `max_tokens`.
    [config.proveedor === "gpt" ? "max_completion_tokens" : "max_tokens"]:
      opts.maxTokens ?? 4096,
  };

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
      body: JSON.stringify(body),
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
    throw new ErrorIA(await mensajeErrorOpenAICompat(res, nombre));
  }

  let crudo = ""; // contenido tal cual llega (puede traer <think>…)
  let acumulado = ""; // lo mismo pero ya sin la cadena de pensamiento
  let errorEnStream: string | null = null;
  const reader = res.body.getReader();
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
    const trozo = chunk.choices?.[0]?.delta?.content;
    if (!trozo) return; // `reasoning` / `reasoning_content` se ignoran
    crudo += trozo;
    const limpio = sinRazonamiento(crudo);
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
    if (acumulado) return acumulado; // stream cortado a mitad
    throw new ErrorIA(mensajeLegible(e), e);
  }

  if (acumulado) return acumulado;
  if (errorEnStream) throw new ErrorIA(`${nombre}: ${errorEnStream}`);
  // Llegó contenido pero era TODO cadena de pensamiento (nunca cerró el
  // `<think>` o gastó el presupuesto razonando).
  if (crudo.trim()) {
    throw new ErrorIA(
      `El modelo se quedó razonando y no llegó a responder. ` +
        `Probá subir "max tokens", otro modelo, o uno sin "reasoning".`,
    );
  }
  throw new ErrorIA(`${nombre} no devolvió texto. Probá de nuevo o cambiá de modelo.`);
}

async function mensajeErrorOpenAICompat(
  res: Response,
  nombre: string,
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
  return m ? `${nombre}: ${m}` : `Error ${res.status} de ${nombre}.`;
}

// ── Listar modelos disponibles para la key del usuario ────────────────────
// Cada key tiene acceso a un set distinto de modelos; esto evita adivinar
// nombres. Lo usa el botón "ver modelos disponibles" de SettingsPanel.
export async function listarModelos(config: ConfigIA): Promise<string[]> {
  if (!config.apiKey.trim()) {
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
    case "mistral":
    case "huggingface":
    case "zhipu":
    case "qwen":
    case "moonshot":
    case "siliconflow":
      return listarModelosOpenAICompat(config);
    default:
      throw new ErrorIA(
        `Listar modelos no está implementado para "${config.proveedor}".`,
      );
  }
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
    .sort();
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
    if (/failed to fetch|networkerror/i.test(err.message)) {
      return "No se pudo conectar con la API (red, CORS o CSP).";
    }
    return err.message;
  }
  return "Error llamando a la IA.";
}
