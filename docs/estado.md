# Estado — 3maps

> Snapshot para retomar. Solo **dónde estamos + qué falta + gotchas**. Historial → git +
> `docs/historia.md`. "Qué hace cada archivo" → `docs/arquitectura.md`. Por qué el código es así →
> `docs/decisiones.md`. Última actualización: 02-09-2026.

## Dónde estamos

**Fases 1-5 en producción.** Backlog B1/B3/B4/B8/B9/B10 shippeado y pusheado. Queda B2/B5/B7
(+ B6 bloqueado por assets). `https://alanepazs.github.io/3maps/` (deploy automático en cada
push a `main`). Repo `github.com/alanepazs/3maps`, local `D:\IA\3maps`.
- **Fase 4** (panel rediseñado + contadores de tokens + adjuntos + copiar/guardar): shippeada,
  probada con keys (Gemini imagen+PDF, Groq visión, pegar captura, T15). Claude bloqueado por saldo.
- **Fase 5** — **un globo del canvas = un TRAMO** (cadena `main`), no un intercambio suelto. Enter
  agrega a la punta del mismo globo; globo nuevo solo al ramificar; el globo crece con la
  conversación (slider en "Lienzo"). **Cambio solo de vista, cero migración.** Detalle por
  sub-tarea: `docs/historia.md` "Fase 5"; el porqué: `decisiones.md` F5-0..F5-6.
  - F5-0..F5-6 ✅ y **pusheado** (incl. F5-4c/5/6).
  - **El `⌄` de un click**: la manija de resize salió del `overflow-hidden` (F5-4c). El swallower
    global de click (`tragarClickSintetico`) se reemplazó por **pointer capture**
    (`arrastrarConCaptura` en `gestos.ts`) — el `click` sintético post-drag va a la manija, no al
    pane. Adiós carrera, adiós doble-click (decisiones B3-b, 03-09).
  - **F5-6**: `BranchTranscript` → `PanelConversacion`; "⧉ Copiar"/"⬇ Guardar" en CADA respuesta
    del panel. **"globo" → "tramo" NO se hizo** (dos términos útiles: globo = nodo visual,
    tramo = cadena de datos).
  - **Falta**: prueba de Alan en Chrome real (Enter 10× → 1 globo, ramificar desde el medio,
    mapa viejo se agrupa, crecimiento, "▤ Ordenar" con tramos altos). Backlog **B8** (drag lageado
    a ~5 fps — ver "Qué falta").

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
    1. **Chat de texto**: `groq/compound(-mini)`, `openai/gpt-oss-20b/120b/safeguard-20b`,
       `llama-3.3-70b-versatile`.
    2. **Con visión** (leen imagen adjunta, 02-09): `qwen/qwen3.6-27b`, `qwen/qwen3.8-27b`. Los
       demás → 400 `messages[N].content must be a string` + aviso "¿acepta imágenes?".
    3. **Escondidos de los chips + migrados si estaban guardados** (`modeloListable` en `ia.ts`,
       usado por `listarModelosOpenAICompat` y `configIA.modeloVigente`): `allam-2-7b` (árabe,
       Alan 02-09), `whisper-*` (STT), `orpheus-*` (TTS), `llama-prompt-guard-2-*` (clasificador).
       Se pueden tipear a mano igual.
    4. **PDF**: NO se manda a Groq a propósito (solo Gemini/Claude nativo) — el modelo recibe
       solo el texto y responde "no veo imagen". El aviso ámbar lo anticipa.
  - **Gemini** (directo):
    1. **Andan bien** (leen imagen adjunta, 02-09): `3.7-flash`, `3.6-flash`, `3.5-flash(-lite)`,
       `3.1-flash-lite` (+ `-preview`), `3-flash-preview`, `2.5-flash`.
    2. **Rate-limit** (429, no muertos): `3.1-pro-preview` (+ `-customtools`).
    3. **404 "no longer available to new users"** → en `GEMINI_MODELOS_MUERTOS` (ocultos de los
       chips + migrados + aviso ámbar): `2.5-flash-lite`, `2.5-pro`, `2.0-flash`, `1.5-flash`,
       `pro`, aliases `*-latest`. Decisiones §7b.
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
  Ajustes en `"3maps:settings"`, IA en `"3maps:ia"`. (`"3maps:vista"` quedó muerta en F5-4.)

## Qué falta

### Fase 4 — implementada, pendiente prueba de Alan

**T1-T16 (+ T13) todo en prod.** Qué shippeó cada tarea: `docs/historia.md` "Fase 4"; el porqué:
`decisiones.md` F3-14b..F3-23; el plan: `tasks/plan.md` + `tasks/todo.md`.

**Falta que Alan pruebe en Chrome real con keys** (el pane no cubre render/inercia/streaming real
ni llamadas con key):
- **02-09 — imagen + PDF con Gemini CONFIRMADO** ✅: `gemini-2.5-flash`, `3-flash-preview`,
  `3.1-flash-lite(-preview)`, `3.5-flash(-lite)`, `3.6-flash`, `3.7-flash` leen imagen Y PDF bien
  (`inline_data`/`mime_type` snake_case anda, no hizo falta camelCase). El adjunto se envía OK
  (thumbnail en el turno "Vos"). `3.1-pro-preview(-customtools)` = solo rate-limit (429).
  - `gemini-2.5-flash-lite` y `gemini-2.5-pro` → 404 "no longer available to new users" →
    **agregados a `GEMINI_MODELOS_MUERTOS`** (Alan). El `2.5-flash` a secas sigue. Decisiones §7b.
- **02-09 — Groq visión + pegar captura + T15 CONFIRMADO** ✅: `qwen/qwen3.6-27b` y `qwen3.8-27b`
  leen la imagen (`image_url` OK); el aviso "¿acepta imágenes?" sale bien con los que no. **Ctrl+V
  de una captura** adjunta bien. **T15**: "⧉ Copiar" (respuesta entera) + "⬇ Guardar" + "⧉" por
  bloque de código — los tres andan. Modelos junk escondidos + migrados (ver arriba).
- **Falta probar**: turnos/STOP/flechas/contadores del panel; `\frac` suelto de gpt-oss; manija
  de resize con zoom out. (Claude/DeepSeek/GPT: bloqueado por saldo.)

- **Bloqueado por saldo** (Alan no tiene, 02-09): imagen/PDF con **Claude** (código igual al de
  Gemini — bloques `image`/`document` nativos, sin beta header; debería andar). Idem DeepSeek/GPT.
- `stream_options.include_usage` (T11) — asumido que anda en Groq/OpenRouter/HuggingFace; si
  alguno tira 400 habría que gatearlo por proveedor en `llamarOpenAICompat`.

### Fase 5 — en producción

F5-0..F5-6 ✅ y pusheado (detalle: `historia.md` "Fase 5").

**Probado por Alan en Chrome real (02-09) ✅**: Enter 10-11× → 1 globo · ramificar desde el
medio → OK · "▤ Ordenar" / solapes → nada se solapó · Copiar/Guardar por respuesta → OK · la
herramienta en general anda bien. (No probó "mapa viejo se agrupa" — es un caso interno, sin
UI para gatillarlo.)

**Freeze levantado** (Alan 02-09): el "rediseño grande de los globos" que estaba evaluando ERA
Fase 5 (moverse entre globos + ramificar al costado, no hacia abajo). Ya está hecho. B1-B10 abiertos.

### Backlog (fuera del plan de fases) → `tasks/todo.md` "Fuera de este plan"

- **B1 ✅** (decisiones B1) — color por globo. Paleta fija de 6 + sin color (no hex). `Intercambio.color`
  en la cabeza del tramo → `.md` → sync/compartir gratis. Punto en el header + swatches en el toolbar.
- **B4 ✅** (decisiones B4) — Setting "grosor de líneas". `Settings.grosorLineas` (1-5, def 1.5),
  slider en "Lienzo", vía CSS var `--xy-edge-stroke-width`. En vivo.
- **B3 ✅** (decisiones B3) — multi-select move + envión parejo a todo el grupo. **Confirmado por
  Alan en Chrome (02-09): los 4 vuelan parejo.** `useNodeInertia` sin `onSelectionDrag*`;
  `FlowCanvas` envuelve `onNodeDragStop` y arma el grupo con `getNodes().filter(selected)` (el 3er
  arg de RF no es confiable — según agarres globo o recuadro trae uno solo). `glide(grupo)` una
  velocidad; `onSettle` → `asentarVarios` (batch, persiste x/y + rama de todos en un `setArbol`).
  Tras un drag de grupo la selección se mantiene (se limpia al clickear el fondo — default RF).
  Con >1 seleccionado: toolbar compartida `ToolbarGrupo` ("🗑 Eliminar N" + swatches de color a
  todos), las toolbars por-globo se esconden. 10 asserts + tsc/lint/build verde + pane + Alan en
  Chrome.
- **B5 ✅ codeado** (decisiones B5) — fuente + tamaño de texto. `Settings.fuenteTexto`
  (sistema/geist/serif/mono) + `escalaTexto` (0.8-1.3). `FlowCanvas` escala el `font-size` del
  `<html>` (todo lo `rem`) + setea `--fuente-3maps` (lo lee `body`). `select` + slider en "Lienzo".
  `Lora` sumada a `layout.tsx`. `Markdown.tsx` px sueltos → `em`. tsc/lint/build verde + pane.
  **Falta**: prueba de Alan + push.
- **B7 ✅ codeado** (decisiones B7) — zoom de lupa en hover. `Settings.hoverZoom` (def off). CSS
  puro: `:root[data-hoverzoom="on"] .react-flow__node:hover .globo-root { scale(1.35) }` (transform
  → no corre a los vecinos), excluye `.dragging`/`.selected`, `@media (hover: hover)`.
  `data-hoverzoom` va en el `<html>` desde el effect de B5 (evita mismatch de hidratación).
  `onResizeStart` usa `offsetWidth` (inmune al transform). Checkbox en "Lienzo". tsc/lint/build
  verde + pane (el `:hover` visual lo prueba Alan). **Falta**: prueba de Alan + push.
- **B2 ✅ codeado** (decisiones §10) — contexto adaptativo = **resumen incremental**. Cuando la
  ventana se corre, `responder` busca el prefijo cacheado más largo del set viejo y resume solo la
  cola nueva sobre él (`resumir(..., { resumenPrevio })`). La entrada de la llamada oculta deja de
  crecer sin tope en ramas largas (pane: 8 viejos → 1600 chars la 1ª, 617 la 2ª). Se descartó la
  "ventana que se achica". Instrumentación `[b2]` mantiene (registra `incremental`/`nNuevos`).
  6 asserts + pane e2e con fetch stub + tsc/lint/build verde. **Falta**: prueba de Alan + push +
  sacar la instrumentación cuando confirme.
- **B6 logo** — concepto elegido (02-09: árbol verde + copa de globos de diálogo naranjas/verdes +
  wordmark "3maps" naranja, sin "3" como tronco). **Falta que Alan suba los assets** a `public/`
  (`logo.svg` lockup / `logo-mark.svg` árbol solo / `favicon.svg` + `apple-touch-icon.png`). Ahí:
  `<link>` del favicon en `app/layout.tsx` + fondo del canvas con `logo-mark` en opacidad baja.
- **B8 ✅** (decisiones F5-7) — arrastrar un globo iba a ~5 fps: `MessageNode` re-parseaba toda la
  transcripción del tramo por frame del drag. `Markdown` = `memo` + `useMemo` del texto; la
  transcripción sale a `CuerpoTramo` (`memo` por `rev`/`readOnly`). 0 mutaciones de DOM en zoom+drag.
- **B9 ✅** (decisiones F5-7) — el scroll-follow del panel se plantaba a mitad del stream: el
  `scrollTop = scrollHeight` propio disparaba `alScrollear` y apagaba `pegado`. `useLayoutEffect` +
  ref `autoScroll` (prende antes del scroll propio, apaga en rAF). Aplicado también al globo.
- **B10 ✅** (decisiones F5-7) — manija de resize + scrollbar del panel pegados con `side="left"`:
  la manija sale entera del panel (`left-full ml-1`), despejada del scrollbar y de la flecha `›`.
  (1er intento con `mr-4` en `scrollRef` dejaba la `›` flotando en un hueco → descartado.)
  `side="right"` sin cambio.
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
- Que el watchdog de 45s no corte un stream lento-pero-vivo. **Mejorado 03-09** (F3-6): watchdog
  por fases — resumir bajo TOTAL_MS (240s) + su propio corte a 50s; 1er token 90s; entre chunks
  45s. Falta que Alan confirme en Chrome que ya no se corta con 2 ramas.
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
