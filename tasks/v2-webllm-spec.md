# Spec: v2 — Modelo local in-browser (proveedor `webllm`)

> Estado: **IMPLEMENT** (rama `spike/webllm-build`). Spec aprobado + spike de build OK
> (Open Question #1 resuelto) + toda la mecánica armada. **Falta**: la prueba de generación
> de Alan en Chrome real (WebGPU + descarga). Fecha: 03-09-2026. El "por qué" del código:
> decisiones §7g. Contexto previo: memoria `project-3maps-v2-modelo-local`.

## Objective

Que un visitante de 3maps **sin cuenta y sin API key** pueda usar la IA, corriendo un
LLM chico **dentro de su propio navegador** con WebGPU. Cero tokens, cero costo para
nadie, la app sigue siendo la web estática en GitHub Pages.

- **Usuario:** alguien que abre `alanepazs.github.io/3maps` desde el portfolio, en
  Chrome/Edge de escritorio, y quiere probar la herramienta sin dar de alta una key.
- **También:** fallback honesto para el usuario habitual cuando se le acaba la cuota
  free de su proveedor cloud.
- **Éxito:** desde una instalación limpia, sin ninguna key cargada, el usuario elige
  "modelo local", baja los pesos una vez (con barra de progreso), y mantiene una
  conversación ramificada en el canvas — mismo streaming, mismo árbol, mismos globos
  que con un proveedor cloud.

> **Actualización 03-09-2026**: se sumó el proveedor **`ollama`** a `ia.ts` (`case "ollama"`,
> `fetch` a `localhost:11434`, sin key — decisiones §7f). Es una opción **local/avanzada** para
> quien ya corre Ollama; **NO reemplaza** este spec. WebLLM in-browser sigue siendo el camino de
> "IA gratis para cualquiera" porque no depende de nada instalado (Ollama-HTTP tiene los
> problemas de §7a: Safari, CORS, móvil).

### No-objetivos (fuera de este spec)

- Rediseño del onboarding / primera pantalla para gente sin cuenta → spec aparte.
- Imagen / PDF con el modelo local (WebLLM no los maneja bien).
- Móvil (sin VRAM suficiente).
- Rotación automática entre proveedores free en 429 (idea separada de la memoria).
- Modelos locales vía HTTP (Ollama) — descartado en `decisiones §7a`, sigue descartado.

## Tech Stack

- Igual que el proyecto: Next.js 16 (App Router, Turbopack, `output: "export"`),
  React 19, TypeScript, Tailwind 4.
- **Nueva dependencia:** `@mlc-ai/web-llm` (Apache-2.0, MLC AI / CMU). Evaluada
  explícitamente (ver `feedback-3maps-no-unknown-deps`): WebGPU LLM inference no
  existe en browser APIs vanilla; el proyecto ya usa libs (`@anthropic-ai/sdk`,
  `react-markdown`, `katex`…). Se carga con `import()` dinámico → **cero peso en la
  carga inicial**, igual que el SDK de Claude hoy ([ia.ts:350](src/model/ia.ts:350)).
- Los pesos NO se hostean en 3maps: WebLLM los baja de la CDN de Hugging Face
  (`huggingface.co/mlc-ai/...`) + el `.wasm` del modelo de
  `raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs`. Sin costo de ancho de banda
  para Alan. (3maps no tiene CSP, no hay que abrir nada.)

## Commands

```bash
cd D:\IA\3maps
npm install @mlc-ai/web-llm     # única dep nueva
npm run dev                     # http://localhost:3000
npx tsc --noEmit -p tsconfig.json
npm run lint
npm run build                   # out/ estático — verificar que el worker bundlee con output:export
```

## Project Structure

```
src/model/ia.ts              → + case "webllm" en llamarIA(); + adaptador llamarWebLLM()
src/model/webllm.ts          → NUEVO: wrapper del engine (carga, caché, progreso, capacidad)
src/model/webllm.worker.ts   → NUEVO: entrypoint del Web Worker (MLCEngineHandler)
src/model/intercambio.ts     → Proveedor += "webllm"
src/model/configIA.ts        → default de modelo webllm; no requiere apiKey
src/components/SettingsPanel.tsx → UI: detección WebGPU, selección de modelo, barra de progreso, botón "descargar / usar"
docs/spec-proyecto.md        → §nuevo: modelo local (reemplaza el "descartado" de §10 con matices)
docs/decisiones.md           → V2-1..V2-n (el porqué de cada decisión de abajo)
docs/{estado,arquitectura,historia}.md → al cerrar
```

## Code Style

Igual que `ia.ts` hoy: adaptador por proveedor, aislado, con el mismo contrato.

```ts
// src/model/ia.ts
case "webllm":
  return llamarWebLLM(config, mensajes, opts);

// Adaptador: modelo local vía WebGPU (@mlc-ai/web-llm). El engine se importa y
// se instancia dinámicamente — nada baja hasta que el usuario dispara la 1ª llamada.
// La "api key" no aplica: llamarIA() saltea el chequeo de apiKey para "webllm".
async function llamarWebLLM(
  config: ConfigIA,
  mensajes: Mensaje[],
  opts: LlamadaOpts,
): Promise<RespuestaIA> {
  const engine = await obtenerEngine(config.modelo, opts.onProgreso);
  const stream = await engine.chat.completions.create({
    messages: mensajes.map(aMensajeOpenAI),   // reusa el mapeo OpenAI-compat existente
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: opts.maxTokens ?? 4096,
  });
  let acumulado = "";
  let truncada = false;
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (delta) { acumulado += delta; opts.onTexto?.(delta, acumulado); }
    if (chunk.choices[0]?.finish_reason === "length") truncada = true;
    if (chunk.usage) uso = { entrada: chunk.usage.prompt_tokens, salida: chunk.usage.completion_tokens };
  }
  return { texto: sinTokensBasura(sinRazonamiento(acumulado)), uso, truncada };
}
```

## Testing Strategy

- **Lógica pura sin runner** (napkin §13): `webllm.ts` — que `capacidadWebGPU()`,
  la selección de modelo y el mapeo de mensajes se testeen con `tsx _scratch.mts`.
- **`tsc` + `lint` + `build` en verde** (Definition of Done del proyecto).
- **El preview pane NO sirve** para WebGPU (congela rAF, no hay `navigator.gpu` real).
  La prueba de que genera texto la hace **Alan en Chrome real** con su GPU dedicada:
  bajar el 3B, ramificar 2-3 veces, ver streaming y el árbol.
- Verificar que `npm run build` (con `output: export`) emite el worker y que la app
  publicada en Pages lo carga (no un `file://` roto por basePath).

## Boundaries

- **Always:** `import()` dinámico para web-llm; feature-detect `navigator.gpu` antes de
  ofrecer nada; barra de progreso visible en toda descarga; reusar el aviso ámbar
  existente cuando hay adjuntos + proveedor sin visión.
- **Ask first:** cambiar el proveedor por defecto de la app; agregar un segundo modelo
  fuera de la lista corta; tocar `contexto.ts` (ventana/resumen) para el context
  window chico del modelo local; cualquier dep además de `@mlc-ai/web-llm`.
- **Never:** hostear pesos en el repo; hacer que la carga inicial de 3maps baje algo
  de web-llm; ofrecer el modelo local en móvil; romper el modo 100% local sin
  Supabase.

## Success Criteria

1. Con `localStorage` limpio y sin keys: SettingsPanel muestra "Modelo local (beta)"
   con los requisitos claros (Chrome/Edge escritorio, ~X GB de descarga, GPU).
2. Sin WebGPU (`navigator.gpu` undefined) o viewport móvil: la opción aparece
   deshabilitada con el motivo, no rota nada.
3. Elegir un modelo + "Descargar" → barra de progreso 0→100% (MB / %), cacheado en
   Cache API; segunda vez carga de caché en < 5 s sin red.
4. Enviar una pregunta → streaming token-a-token en el globo, igual que un proveedor
   cloud. `RespuestaIA.uso` poblado; `truncada` se marca si `finish_reason: "length"`.
5. Ramificar desde una respuesta del modelo local → contexto = solo camino raíz→nodo,
   ventana + resumen (el resumen lo hace el mismo modelo local).
6. Adjuntar una imagen con el modelo local → aviso ámbar "este modelo no lee
   imágenes", la pregunta se manda igual (solo texto).
7. `tsc` + `lint` + `build` verde. `out/` publicable, worker incluido.
8. La conversación con modelo local se guarda/exporta como cualquier `.md`
   (`proveedor: webllm` en el frontmatter).

## Decisiones a registrar (docs/decisiones.md V2-*)

- **V2-1 — `@mlc-ai/web-llm` como dep.** Por qué se acepta pese a "vanilla".
- **V2-2 — WebGPU, no fallback.** Sin `navigator.gpu` la opción no existe. Nada de
  WASM-CPU (inutilizablemente lento).
- **V2-3 — Modelos ofrecidos (lista corta).** Default **Llama-3.2-3B-Instruct-q4f16_1-MLC**
  (~2.26 GB, `low_resource_required`). Alternativas:
  - Chico: **Llama-3.2-1B-Instruct-q4f16_1-MLC** (~0.88 GB) — máquinas flojas.
  - Grande: **Qwen2.5-7B-Instruct-q4f16_1-MLC** (~5.1 GB) — GPU con ≥6 GB VRAM.
  - (Descartar Phi-3.5 / Gemma-2: no aportan sobre Llama/Qwen y pesan parecido.)
- **V2-4 — Web Worker.** `CreateWebWorkerMLCEngine` para no congelar el canvas.
  Service Worker (persistencia entre pestañas) descartado por complejidad con
  `output: export` — la Cache API ya persiste los pesos entre visitas.
- **V2-5 — `apiKey` no aplica.** `llamarIA()` saltea el chequeo para `webllm`;
  `configIA` no exige key; SettingsPanel no muestra input de key para este proveedor.
- **V2-6 — Context window de 4096.** Los modelos MLC vienen con 4k por defecto (vs
  32k-1M de los cloud). `armarContexto()` ya windowea; documentar que con `webllm` la
  ventana efectiva es más chica y el resumen entra antes. NO tocar `contexto.ts` en
  este spec salvo que la prueba de Alan muestre que se rompe.
- **V2-7 — `webllm` NO es el default.** El default sigue "traé tu key". Se ofrece como
  opción prominente y opt-in.

## Open Questions

1. ~~**Next 16 + `output: export` + Web Worker de módulo.**~~ **RESUELTO (03-09, spike
   `spike/webllm-build`)** — `new Worker(new URL("./webllm.worker.ts", import.meta.url),
   { type: "module" })` + `import("@mlc-ai/web-llm")` **bundlea bien** con Turbopack en
   modo `export`:
   - `npm run build` compila; `tsc` verde. web-llm 0.2.84 no necesita stubs de
     `fs`/`module`/`perf_hooks` (el ejemplo webpack viejo sí, esta versión no).
   - Turbopack emite un bootstrap `turbopack-worker-*.js` + el entry del worker
     (`.js`, no `.ts`) + el chunk de web-llm (6 MB). Convierte el `type: "module"` a
     worker **clásico** (`importScripts`) → sin líos de MIME en GitHub Pages.
   - **El chunk de web-llm (6 MB) es lazy** — NO está en el `index.html`, solo se baja
     cuando se dispara el proveedor. Carga inicial de 3maps intacta.
   - Con `NEXT_PUBLIC_PAGES=1` (basePath `/3maps`) los chunks del worker resuelven a
     `/3maps/_next/static/chunks/...` correctamente (probado sirviendo `out/` bajo `/3maps/`).
   - El worker corrió web-llm de verdad; solo falló al init de WebGPU porque el pane de
     Claude no tiene WebGPU real ("Failed to create WebGPU Context Provider"). **Falta la
     prueba de generación en el Chrome real de Alan** (GPU + descarga de pesos).
   - No hizo falta plan B (in-main-thread / esm.run).
2. **`stream_options: { include_usage: true }`** en WebLLM — asumido que anda (es
   OpenAI-compat). Si no, `uso: null` y listo (ya pasa con varios proveedores free).
3. ¿La barra de progreso va en SettingsPanel o en un overlay a pantalla completa la
   primera vez? (UX menor, decidir en Plan.)
4. ¿Se ofrecen los 3 modelos de entrada o solo el 3B y los otros dos detrás de un
   "más opciones"? (Alan pidió 2-3 con recomendado; decidir presentación en Plan.)
