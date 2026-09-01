# Estado — 3maps

> Snapshot para retomar. Solo **dónde estamos + qué falta + gotchas**. Historial → git +
> `docs/historia.md`. "Qué hace cada archivo" → `docs/arquitectura.md`. Por qué el código es así →
> `docs/decisiones.md`. Última actualización: 02-09-2026.

## Dónde estamos

**Fases 1-4 implementadas y en producción.** `https://alanepazs.github.io/3maps/`
(deploy automático en cada push a `main`). Repo `github.com/alanepazs/3maps`, local `D:\IA\3maps`.
La **Fase 4** (rediseño del panel + contadores de tokens + adjuntos + copiar/guardar respuesta)
está toda shippeada — falta solo la prueba de Alan en Chrome real con keys (ver "Qué falta").

- **Canvas** (React Flow): árbol de globos, tronco vertical + ramas al costado, envión al soltar,
  2 modos (manito / selección con espacio), redimensionar globo y panel, auto-layout ("▤ Ordenar"),
  varios mapas, esconder la barra de chat. El `arbol` de `Intercambio`s es la fuente de la verdad;
  la vista de React Flow se deriva.
- **IA** (`model/ia.ts`, wired en `FlowCanvas.responder`): streaming, contexto = solo el camino
  raíz→globo con ventana + resumen. **7 proveedores**: Gemini + Claude directos del navegador; el
  resto (DeepSeek, GPT, Groq, OpenRouter, HuggingFace) vía el edge function `ia-proxy` (opt-in
  "usar proxy" en ⚙️). Una key/modelo por proveedor. `⚙️` trae mini-guía de API key por proveedor
  (`GUIA_API_KEY`) y aclara cuáles son open-source.
  **Probados e2e: Gemini + Groq + OpenRouter + HuggingFace** — los 4 free reales y fluidos.
  Claude/DeepSeek/GPT son pagos (el user trae saldo). **Lista de proveedores cerrada en 7.**
- **Modelos probados (31-08 / 01-09)** — referencia rápida, ordenados de funcional a no funcional:
  - **Groq** (proxy):
    1. **Andan**: `allam-2-7b`, `groq/compound`, `qwen3.6-27b`, `qwen3.8-27b`,
       `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `openai/gpt-oss-safeguard-20b`.
    2. **No andan** (no son modelos de chat, esperado): `llama-prompt-guard-2-*`
       (clasificador, `max_tokens` ≤512), `whisper-*` (STT), `orpheus-*` (TTS, piden
       aceptar términos).
  - **Gemini** (directo):
    1. **Andan bien**: `3.7-flash`, `3.6-flash`, `3.1-flash-lite` (+ `-preview`),
       `3-flash-preview`, `2.5-flash`.
    2. **Andan lentos**: `3.5-flash`, `3.5-flash-lite`.
    3. **No andan en key/cuenta nueva** (free tier): `2.5-flash-lite`, `2.5-pro`
       (deprecados; una cuenta vieja o con billing sí los llama). Aliases `*-latest`
       resuelven a modelos paid → ocultos de los chips de modelos + aviso ámbar (decisiones §7b).
  - **OpenRouter** (proxy) — ✅ **free real, probado 01-09**. Sin tarjeta, saldo $0. Límites:
    20 req/min + **50 req/día** ($0 gastado) → 1000/día si alguna vez cargás $10 (no vencen).
    Saldo negativo → 402 hasta en los `:free` (no pasa si nunca ponés plata). Modelos:
    - **Andan**: `minimax/minimax-m3:free`, `nvidia/nemotron-3-super-120b-a12b:free` (= nuevo
      `MODELO_POR_DEFECTO.openrouter`; el viejo `meta-llama/llama-3.3-70b-instruct:free` ya no existe).
    - **Fallan por proveedor upstream saturado** (429 "Provider returned error", NO es tu cuota —
      minimax/nvidia andan al mismo tiempo): `google/gemma-4-31b-it:free`, `z-ai/glm-5.2:free`.
    - `/models` de OpenRouter devuelve ~300 modelos (agregador) → se muestran **todos** en un
      `<details>` plegable con `<input>` de filtro por substring; el contenedor scrollea (F3-13).
  - **Eliminados (01-09): Cerebras, SiliconFlow, Zhipu, Moonshot, Mistral, Qwen** — el free no da
    una experiencia fluida. **13 → 7 proveedores.** Detalle + evidencia en decisiones §7d. Resumen:
    - **Cerebras**: toda llamada → `402 "Payment required. Visit your billing tab"` (confirmado
      en sus Request Logs). El free tier es solo del playground.
    - **SiliconFlow**: 1ª llamada pasa (trial $1), después `"Sorry, your account balance is
      insufficient"`. Los `:free` piden verificación real-name China-only desde may-2026.
    - **Zhipu / Moonshot**: sacados sin probar — registro solo `.cn` (CAPTCHA + teléfono chinos).
    - **Mistral**: free real pero **1 req/min** → mata el ramificar en paralelo. Sacado sin probar.
    - **Qwen** (Alibaba Cloud, consola internacional): el signup pide **verificar tarjeta** con
      cargo de $1 (+ teléfono + KYC), aunque los docs digan "no card". DeepSeek ya cubre ese hueco.
  - **HuggingFace** (proxy) — ✅ **free real, probado 01-09**. Signup limpio (mail, token `hf_`
    tipo "Inference", sin teléfono/CAPTCHA). Los primeros 8 modelos de la key andan perfecto.
    ⚠️ **un modelo devolvió `<PAD>` × 2800** (token de padding) → crasheaba el render → arreglado
    en 3 capas (F3-14). `/models` devuelve ~90 → chips en `<details>` plegable (F3-13).
  - **El strip de `<think>` funciona OK** — verificado con Qwen3-8B (SiliconFlow) antes de sacarlo.
  - Los "`$` crudos" / "`\frac` crudo" que se vieron eran **bundle viejo cacheado**, no bug:
    F3-12 renderiza bien la salida de Gemini (verificado local). gpt-oss sí manda `\frac` sin
    `$` → heurística pendiente (Opcionales).
- **Respuestas** (`Markdown.tsx`): matemática con KaTeX (`$…$`, `$$…$$`, `\[ \]`, `\( \)`, `\frac`
  suelto), HTML del modelo saneado (`<br>` en tablas), `ia.ts` saca el `<think>…</think>` de los
  modelos reasoning. En el panel: botón "⧉" por bloque de código (`conCopiar`). Decisiones F3-12,
  F3-14b, F3-23.
- **Panel `BranchTranscript`** (Fase 4): turnos Vos/IA, STOP en el mini-composer, flechas `‹`/`›`
  de navegación por ramas, contador de contexto (`≈ N tokens`) en el header + tokens gastados por
  turno, **adjuntar archivos** (texto/imagen/PDF) al mini-composer, "⧉ Copiar" / "⬇ Guardar" la
  respuesta. Detalle: `docs/historia.md` "Fase 4" + decisiones F3-18..F3-23.
- **Backend opcional** (Supabase, `ref` ejecjjpdjoxgrbqrhwwd): login Google/magic-link, compartir
  por link (`?compartir=<slug>`), "mis árboles" + despublicar, **sync entre dispositivos**. Sin
  las env `NEXT_PUBLIC_SUPABASE_*` la app es 100% local.
- **Sync entre dispositivos** (con sesión, LWW): árboles per-mapa (`sync/<uid>/<mapId>.json`),
  lista de mapas (`_mapas.json` = `{mapas, borrados, epoch}`), keys/modelos (`config.json`).
  **NO es push**: poll cada 15s + al volver a foco. Latencia ≤15s. "🧹 Empezar de cero" / borrar
  el último mapa suben un `epoch` → reset duro en el otro dispositivo. **Probado OK con celu
  + PC**: crear / borrar / renombrar / reset / tamaño del globo convergen. Detalle: decisiones F3-4.
- **Persistencia local**: `localStorage["3maps:arbol:<mapId>"]` = un string `.md` por intercambio.
  Vista en `"3maps:vista"`, ajustes en `"3maps:settings"`, IA en `"3maps:ia"`.

## Qué falta

### Fase 4 — implementada, pendiente prueba de Alan

**T1-T16 (+ T13) todo en prod.** Qué shippeó cada tarea: `docs/historia.md` "Fase 4"; el porqué:
`decisiones.md` F3-14b..F3-23; el plan: `tasks/plan.md` + `tasks/todo.md`.

**Falta que Alan pruebe en Chrome real con keys** (el pane no cubre render/inercia/streaming real
ni llamadas con key):
- Adjuntos: imagen y PDF con **Gemini** y **Claude** (bloques nativos); un modelo de visión de
  **Groq** (llama-4/3.2-vision) + el aviso "sin visión"; **pegar una captura** de pantalla.
  Nota: los formatos de imagen/PDF de Gemini usan `inline_data`/`mime_type` (snake_case) — si
  Gemini 400ea, probar camelCase (decisiones F3-22b).
- `stream_options.include_usage` (T11) — asumido que anda en Groq/OpenRouter/HuggingFace; si
  alguno tira 400 habría que gatearlo por proveedor en `llamarOpenAICompat`.
- Copiar/guardar respuesta (T15): copiar-pegar y descargar de verdad.
- Turnos/STOP/flechas/contadores del panel; `\frac` suelto de gpt-oss; manija de resize con
  zoom out.

### Backlog (fuera del plan de fases) → `tasks/todo.md` "Fuera de este plan"

- **B1-B7** (pedidos de Alan 01-09): color por globo · ventana de contexto adaptativa (medir el
  gasto de `resumir()` primero — se cruza con T11) · multi-select move + envión · grosor de líneas
  · fuente + tamaño de texto · logo de fondo · zoom de lupa en hover.
- **T15 "doc card"** — tarjeta compacta cuando la respuesta ES un documento; si el núcleo de T15
  no alcanza.
- **Auto-switch de proveedor** al pegar una key de otro (hoy `avisoFormatoKey` solo avisa).
- **Export/import** `.zip` de la carpeta de `.md` + File System Access API (spec §7). Ahora con
  T16, los adjuntos van en el `.md` → un export tiene que incluirlos.
- **2.5b — embeddings** (`transformers.js`) si `intercambiosRelevantes` (match por palabras) se
  queda corto. Misma firma → drop-in.
- Modelos locales tipo Ollama (spec §10) — descartado (mixed-content/CORS + el celu no llega a
  `localhost`); los modelos abiertos ya se sirven online vía Groq/OpenRouter/etc.

### Prueba real pre-existente pendiente
- **DeepSeek, GPT** con key real (pagos — cuando Alan tenga saldo). Los 4 free
  (Gemini/Groq/OpenRouter/HuggingFace) ya están probados; lista de proveedores cerrada en 7.
- Panel/globo redimensionable + fixes de móvil (3.11/3.13) en celu.
- Que el watchdog de 45s no corte un stream lento-pero-vivo.
- ⚠️ LWW de títulos usa el reloj del navegador: relojes MUY desfasados podrían elegir mal.

## Issues conocidos / gotchas

- **Preview pane** (`mcp__Claude_Browser__*`): congela rAF/ResizeObserver, throttlea `setTimeout`,
  **no corre transiciones CSS**, a veces reporta viewport 0; los gestos sintéticos de teclado/drag
  no disparan. **No es bug de la app.** En el pane se verifica **lógica/datos**; render, inercia y
  animaciones los prueba el usuario en Chrome real. (napkin §2-3.)
- **Un globo con basura del modelo (`<PAD>` × miles, floods `****`/`[[[[`/`> > >`) crasheaba/colgaba
  TODO el canvas.** Arreglado 01-09, 3 capas (decisiones F3-14): (1) `ia.ts` `sinTokensBasura` saca
  los tokens del stream → no se guardan; (2) `Markdown.tsx` `sanitizarCrudo` limpia contenido ya
  guardado (strip + colapso de floods + techo 60k); (3) `<LimiteError>` boundary en `Markdown` y
  en cada `MessageNode` → un globo roto muestra fallback, el resto vive. Si aparece otro token,
  sumar el patrón a `TOKENS_BASURA` (está en `ia.ts` Y `Markdown.tsx`).
- **CDN de GitHub Pages cachea `index.html` ~10 min.** Deploy nuevo ya: `?v=<algo>`. (3maps NO
  es una PWA — no hay `manifest.json` ni service worker; "agregar a pantalla de inicio" es solo
  un atajo con el caché normal del navegador. El `?v=` alcanza.)
- **Darkreader** en `localhost` rompe la hidratación y los colores.
- **Un dispositivo con bundle viejo rompe el sync** (sube el índice sin `epoch` → lo borra). Ver arriba.
- **Llamada IA "estática"**: watchdog + `pendiente: 1` persistido + botón "↻ Rehacer" (F3-6).

## Cómo correr / verificar / publicar

```bash
cd D:\IA\3maps
npm run dev                         # http://localhost:3000 (sin basePath)
npx tsc --noEmit -p tsconfig.json   # typecheck
npm run lint
npm run build                       # out/ estático; con NEXT_PUBLIC_PAGES=1 → basePath /3maps
```

- **`.env.local`** (gitignoreado): `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  Sin eso `npm run dev` corre igual, sin la parte de Supabase. En prod van como repo secrets.
- **Lógica pura sin runner**: `npx --yes tsx _scratch.mts`, y borrar el scratch (napkin §13).
- **Publicar**: `git push` desde `D:\IA\3maps` (credencial en Windows Credential Manager).
  `gh` NO está autenticado. Deploy a Pages = push a `main`.
- **Al cerrar sesión**: `tsc` + `lint` en verde · `git push` · actualizar este archivo.
