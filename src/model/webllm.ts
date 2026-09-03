// WebLLM: modelo de lenguaje corriendo in-browser con WebGPU (spike v2).
// `@mlc-ai/web-llm` se importa dinámicamente — nada baja hasta que el usuario
// dispara la 1ª llamada (mismo patrón que `@anthropic-ai/sdk` en ia.ts).

import type { MLCEngineInterface } from "@mlc-ai/web-llm";

export function hayWebGPU(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof (navigator as Navigator & { gpu?: unknown }).gpu !== "undefined"
  );
}

// ── Detección "mejor esfuerzo" del equipo, para recomendar un modelo ──────────
// El navegador limita a propósito el fingerprinting de hardware. Lo que se puede:
// string del renderer WebGL (nombre de la GPU), límites del adapter WebGPU, y
// `navigator.deviceMemory` (RAM aprox, tope 8). No hay API de VRAM. Devuelve un
// nivel + un motivo honesto; si no se puede decidir → "medio".

export type NivelEquipo = "bajo" | "medio" | "alto";

function rendererWebGL(): string {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ||
      c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? "")
      : String(gl.getParameter(gl.RENDERER) ?? "");
  } catch {
    return "";
  }
}

const GPU_DEDICADA =
  /\b(rtx|gtx|radeon rx|radeon pro|arc a\d|quadro|tesla|titan|apple m[1-9])\b/i;
const GPU_LENTA =
  /(swiftshader|llvmpipe|software|microsoft basic|uhd graphics|hd graphics|iris|mali|adreno|videocore)/i;

export async function nivelEquipoWebLLM(): Promise<{
  nivel: NivelEquipo;
  motivo: string;
}> {
  if (!hayWebGPU()) return { nivel: "bajo", motivo: "sin WebGPU" };

  const ram = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const r = rendererWebGL();
  let maxBuf = 0;
  try {
    // WebGPU no está en el `lib` de TS por defecto → tipo mínimo inline.
    const gpu = (
      navigator as Navigator & {
        gpu?: {
          requestAdapter?: () => Promise<{
            limits?: { maxBufferSize?: number };
          } | null>;
        };
      }
    ).gpu;
    const adapter = await gpu?.requestAdapter?.();
    maxBuf = adapter?.limits?.maxBufferSize ?? 0;
  } catch {
    /* ignorar */
  }

  const dedicada = GPU_DEDICADA.test(r) || maxBuf >= 2 * 1024 * 1024 * 1024;
  const lenta =
    GPU_LENTA.test(r) || (maxBuf > 0 && maxBuf < 512 * 1024 * 1024);
  // Nombre legible: los strings ANGLE son `ANGLE (vendor, RENDERER Direct3D11…, D3D11)`.
  const gpuTxt = (() => {
    if (!r) return "";
    const m = r.match(
      /ANGLE \([^,]+,\s*(.+?)(?:\s+Direct3D\d+|\s+vs_|\s*\(0x|\s*,\s*(?:D3D|OpenGL|Vulkan))/i,
    );
    if (m) return m[1].trim();
    return r.replace(/^ANGLE \(/, "").split(",")[0].trim();
  })();

  if (lenta && !dedicada) {
    return {
      nivel: "bajo",
      motivo: gpuTxt
        ? `GPU integrada / lenta (${gpuTxt})`
        : "GPU integrada o software",
    };
  }
  if (dedicada && (ram === undefined || ram >= 8)) {
    return {
      nivel: "alto",
      motivo: gpuTxt ? `GPU dedicada (${gpuTxt})` : "GPU dedicada",
    };
  }
  if (dedicada) {
    return { nivel: "medio", motivo: `GPU dedicada, RAM ~${ram} GB` };
  }
  return {
    nivel: "medio",
    motivo: "no pudimos detectar bien tu GPU",
  };
}

// Un engine por modelo, cacheado a nivel módulo (bajar los pesos 1 vez por
// sesión; el navegador además los persiste en Cache API entre visitas).
const engines = new Map<string, Promise<MLCEngineInterface>>();

// Devuelve (creando/bajando la 1ª vez) el engine para `modelo`. El Web Worker se
// instancia con `new Worker(new URL(...))` — es lo que el build tiene que saber
// bundlear bajo `output: "export"` + Turbopack (Open Question #1 del spec).
export function obtenerEngineWebLLM(
  modelo: string,
  onProgreso?: (fraccion: number, texto: string) => void,
): Promise<MLCEngineInterface> {
  let e = engines.get(modelo);
  if (!e) {
    e = (async () => {
      const webllm = await import("@mlc-ai/web-llm");
      const worker = new Worker(
        new URL("./webllm.worker.ts", import.meta.url),
        { type: "module" },
      );
      return webllm.CreateWebWorkerMLCEngine(worker, modelo, {
        initProgressCallback: (r) => onProgreso?.(r.progress, r.text),
      });
    })();
    // No cachear un rechazo: si la carga falla (WebGPU, red), un reintento
    // vuelve a probar en vez de devolver el mismo error.
    e.catch(() => engines.delete(modelo));
    engines.set(modelo, e);
  }
  return e;
}
