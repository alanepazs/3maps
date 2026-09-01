# Estado — 3maps

> Snapshot para retomar. Solo **dónde estamos + qué falta + gotchas**. Historial → git +
> `docs/historia.md`. "Qué hace cada archivo" → `docs/arquitectura.md`. Por qué el código es así →
> `docs/decisiones.md`. Última actualización: 01-09-2026.

## Dónde estamos

**Fase 1 + 2 + 3 shippeadas y en producción.** `https://alanepazs.github.io/3maps/`
(deploy automático en cada push a `main`). Repo `github.com/alanepazs/3maps`, local `D:\IA\3maps`.

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
- **Respuestas** (`Markdown.tsx`): matemática con KaTeX (`$…$`, `$$…$$`, `\[ \]`, `\( \)`), HTML
  del modelo saneado (`<br>` en tablas), y `ia.ts` saca el `<think>…</think>` de los modelos
  reasoning. Decisiones F3-12.
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

### Prueba real pendiente (la hace el usuario, con key/login)
- Faltan probar con key real: **DeepSeek, GPT** (pagos — cuando el user tenga saldo). Los 4 free
  (Gemini/Groq/OpenRouter/HuggingFace) ya están probados; la lista de proveedores está cerrada.
- Revalidar en vivo gpt-oss / qwen3 con el bundle F3-12: strip de `<think>` + `<br>` literal
  (el render `$…$` de Gemini ya está OK en local; primero forzar bundle nuevo con `?v=<algo>`).
- Panel lateral redimensionable (3.11) + fixes de móvil (3.13) en Chrome real / celu.
- Que el watchdog de 45s no corte un stream lento-pero-vivo.
- ⚠️ LWW de títulos usa el reloj del navegador: relojes MUY desfasados podrían elegir mal.

### Plan de trabajo activo → `tasks/plan.md` + `tasks/todo.md`

**Fase 1 SHIPPEADA + probada en Chrome (01-09)**: T13 heurística LaTeX crudo (`normalizarMath`,
F3-14b) · T1 `stopNode` + T2 badge de lápiz (pulsa con reduce-motion) + STOP sobre el globo
`pending` · T3 globo nace colapsado a 220px mientras streamea con auto-scroll (decisiones F3-15).

**Fase 2 SHIPPEADA (01-09)**: ⚙️ `SettingsPanel` en 2 pestañas "Lienzo" (envión, ventana de
contexto, systemPrompt) / "IA" (proveedor, key, modelo, proxy, Cuenta, Compartir) + caja ámbar del
proxy colapsada en un `<details>` (checkbox del opt-in siempre visible). Decisiones F3-16.

**Fase 3 SHIPPEADA (01-09)**: manija de resize del globo (◢) `cursor-nwse-resize` + contra-escala
`clamp(1, 1/zoom, 4)` → agarrable con zoom out. Decisiones F3-17. Falta que Alan lo pruebe en
Chrome real (agarrarla con zoom out).

**Fase 4 EN CURSO — rediseño de `BranchTranscript`** (`tasks/plan.md` T7-T16):
- **Hecho (01-09)**: T7 turno usuario/IA diferenciados · T8 STOP en el mini-composer (reusa
  `stopNode`) · T14 auto-scroll del panel sigue el texto mientras streamea · **T9** (rediseñado,
  decisiones F3-18/c/d): flechas laterales `‹` `›` en el margen del panel — **una por cada rama**
  unida por ese costado (ramas hijas + el padre si el globo abierto es una rama), apiladas y
  ordenadas por el `y` del destino; se reordenan si un globo se mueve. Muestran la pregunta del
  destino al hover. Hijos `main`, hermanos y contexto: por scroll o click. El panel **abre en el
  "Vos"** del globo, no al final.
- **Falta**: T10 contador de contexto estimado (`≈ chars/4`) por globo y árbol · T11 `llamarIA`
  devuelve `usage` → al `.md` · T12 contador de tokens gastados por globo (usa T11) · **T15**
  respuestas que son un documento entero (`.md`/código): UX (spec) · **T16** drag & drop de
  archivos al mini-composer (spec + scope con Alan).
- **Bugfix layout (01-09, decisiones F3-7b/c)**: ramificar una rama en un árbol ancho mandaba el
  globo nuevo lejísimo abajo ("suelto") o **pisando otro globo**. `ubicarNuevoGlobo`: `H_NUEVO`
  260 (real, nace colapsado), búsqueda en anillos ampliada, y fallback `bajarHastaLibre` que baja
  por la columna hasta un hueco que **no pisa a nadie** (prioridad de Alan). 31 asserts → 0 solapes.
- **Bugfix drag (01-09, decisiones F3-18b)**: al mover un globo, la flecha `‹`/`›` (y la posición
  guardada) a veces quedaban en la ubicación de creación — `asentar` leía `getNode`, un commit
  atrasado. Ahora usa la posición autoritativa del `onNodeDragStop` + envión acumulado.
- **Flechas de enlace (01-09, decisiones F3-2b)**: la rama entraba por ARRIBA del hijo (solo el
  lado del padre era costado). Ahora `MessageNode` tiene handles `target` `t-top`/`t-left`/`t-right`
  y `arbolAVista` conecta la rama costado↔costado (opuestos); el tronco sigue abajo↔arriba.
- **Auto-switch de proveedor** al pegar una key de otro (hoy `avisoFormatoKey` solo avisa).
- **Export/import** `.zip` de la carpeta de `.md` + File System Access API (spec §7).
- **2.5b — embeddings** (`transformers.js`) si `intercambiosRelevantes` (match por palabras) se
  queda corto. Misma firma → drop-in.
- Modelos locales tipo Ollama (spec §10) — descartado por ahora (mixed-content/CORS + el celu no
  llega a `localhost`); los modelos abiertos ya se sirven online vía Groq/OpenRouter/etc.

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
