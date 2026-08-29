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
  deepseek: ["deepseek-chat"],
  gpt: ["gpt-4o-mini"],
  // El acceso a modelos varía por key (una key nueva de AI Studio puede no tener
  // gemini-2.5-flash y sí gemini-flash-latest). Por eso el default es el alias y
  // hay un botón "ver modelos disponibles" en ⚙️ (listarModelos). gemini-2.0-flash
  // fue retirado (404) — ver decisiones §7b.
  gemini: [
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-3-flash-preview",
  ],
};

export const MODELO_POR_DEFECTO: Record<Proveedor, string> = {
  claude: "claude-haiku-4-5",
  deepseek: "deepseek-chat",
  gpt: "gpt-4o-mini",
  gemini: "gemini-flash-latest",
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
  gemini: "AIza…",
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
    { maxTokens: 512 },
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
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
};

async function llamarGemini(
  config: ConfigIA,
  mensajes: Mensaje[],
  opts: LlamadaOpts,
): Promise<string> {
  const modelo = config.modelo || MODELO_POR_DEFECTO.gemini;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelo,
  )}:streamGenerateContent?alt=sse`;

  const body: Record<string, unknown> = {
    contents: mensajes.map((m) => ({
      role: m.rol === "assistant" ? "model" : "user",
      parts: [{ text: m.texto }],
    })),
    generationConfig: { maxOutputTokens: opts.maxTokens ?? 4096 },
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
    throw new ErrorIA(await mensajeErrorGemini(res, modelo));
  }

  let acumulado = "";
  let finish: string | null = null;
  let bloqueo: string | null = null;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const bloques = buf.split("\n\n");
      buf = bloques.pop() ?? "";
      for (const bloque of bloques) {
        const linea = bloque
          .split("\n")
          .find((l) => l.startsWith("data:"));
        if (!linea) continue;
        const payload = linea.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let chunk: GeminiChunk;
        try {
          chunk = JSON.parse(payload) as GeminiChunk;
        } catch {
          continue;
        }
        const cand = chunk.candidates?.[0];
        const delta = (cand?.content?.parts ?? [])
          .map((p) => p.text ?? "")
          .join("");
        if (delta) {
          acumulado += delta;
          opts.onTexto?.(delta, acumulado);
        }
        if (cand?.finishReason) finish = cand.finishReason;
        if (chunk.promptFeedback?.blockReason) {
          bloqueo = chunk.promptFeedback.blockReason;
        }
      }
    }
  } catch (e) {
    if (esAbort(e)) throw e;
    throw new ErrorIA(mensajeLegible(e), e);
  }

  if (bloqueo || finish === "SAFETY" || finish === "PROHIBITED_CONTENT") {
    throw new ErrorIA("Gemini bloqueó la respuesta por seguridad.");
  }
  if (!acumulado) {
    throw new ErrorIA(
      finish === "MAX_TOKENS"
        ? "Gemini cortó por límite de tokens sin texto útil."
        : "Gemini no devolvió texto.",
    );
  }
  return acumulado;
}

// Traduce una respuesta de error de Gemini (cualquier endpoint) a texto legible.
async function mensajeErrorGemini(res: Response, modelo?: string): Promise<string> {
  let m: string | undefined;
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    m = j?.error?.message;
  } catch {
    // sin body legible
  }
  if (res.status === 400 && /api[_ ]?key/i.test(m ?? "")) {
    return "API key de Gemini inválida.";
  }
  if (res.status === 403) {
    return "La API key de Gemini no tiene acceso (o falta habilitar la API).";
  }
  if (res.status === 404) {
    return modelo
      ? `Tu key no tiene acceso al modelo "${modelo}". Mirá "ver modelos disponibles".`
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
