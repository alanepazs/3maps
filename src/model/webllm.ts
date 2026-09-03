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
    engines.set(modelo, e);
  }
  return e;
}
