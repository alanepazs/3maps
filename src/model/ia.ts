import type { Mensaje } from "./contexto";
import type { Proveedor } from "./intercambio";

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

export const PROVEEDORES_DISPONIBLES: Proveedor[] = ["claude", "gemini"];

export const MODELOS_SUGERIDOS: Record<Proveedor, string[]> = {
  claude: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"],
  deepseek: ["deepseek-v4-flash", "deepseek-v4-pro"],
  gpt: ["gpt-5.4-mini", "gpt-5.5"],
  // El free tier de Gemini (desde abr-2026) es solo Flash / Flash-Lite; los Pro
  // pasaron a pago. Una key free tier NUEVA además devuelve 404 en los 2.5-*
  // ("no longer available to new users, use gemini-3.x"). El botón "ver modelos
  // disponibles" en ⚙️ lista lo que la key concreta puede usar. Ver decisiones §7b.
  gemini: [
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
  ],
};

export const MODELO_POR_DEFECTO: Record<Proveedor, string> = {
  claude: "claude-haiku-4-5",
  deepseek: "deepseek-v4-flash",
  gpt: "gpt-5.4-mini",
  gemini: "gemini-3.7-flash",
};

export const NOMBRE_PROVEEDOR: Record<Proveedor, string> = {
  claude: "Claude (Anthropic)",
  deepseek: "DeepSeek",
  gpt: "OpenAI",
  gemini: "Google Gemini",
};

// Pista de formato de la API key, por proveedor (para el placeholder del input).
export const PISTA_API_KEY: Record<Proveedor, string> = {
  claude: "sk-ant-…",
  deepseek: "sk-…",
  gpt: "sk-…",
  gemini: "AQ.…",
};

export type LlamadaOpts = {
  sistema?: string;
  maxTokens?: number;
  // Se llama con cada fragmento de texto que llega (para stremear en vivo).
  onTexto?: (delta: string, acumulado: string) => void;
  signal?: AbortSignal;
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
    default:
      throw new ErrorIA(
        `El proveedor "${config.proveedor}" todavía no está implementado.`,
      );
  }
}

// Resumen corto de un tramo de la conversación (para la ventana de contexto,
// spec §5). Usa el mismo proveedor/modelo configurado.
export async function resumir(
  config: ConfigIA,
  intercambios: { pregunta: string; respuesta: string | null }[],
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
    { maxTokens: 2048 },
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
    default:
      throw new ErrorIA(
        `Listar modelos no está implementado para "${config.proveedor}".`,
      );
  }
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
