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

export const PROVEEDORES_DISPONIBLES: Proveedor[] = ["claude"];

export const MODELOS_SUGERIDOS: Record<Proveedor, string[]> = {
  claude: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"],
  deepseek: ["deepseek-chat"],
  gpt: ["gpt-4o-mini"],
  gemini: ["gemini-2.0-flash"],
};

export const MODELO_POR_DEFECTO: Record<Proveedor, string> = {
  claude: "claude-haiku-4-5",
  deepseek: "deepseek-chat",
  gpt: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
};

export const NOMBRE_PROVEEDOR: Record<Proveedor, string> = {
  claude: "Claude (Anthropic)",
  deepseek: "DeepSeek",
  gpt: "OpenAI",
  gemini: "Gemini",
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
