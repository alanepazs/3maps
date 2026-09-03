# Estado — 3maps

> Snapshot para retomar. Solo **dónde estamos + qué falta + gotchas**. Historial → git +
> `docs/historia.md`. "Qué hace cada archivo" → `docs/arquitectura.md`. Por qué el código es así →
> `docs/decisiones.md`. **Navegar el código: `graphify query "…"` SIEMPRE** (napkin §6b; regenerar
> con `graphify update . --force` tras cambios de estructura). Última actualización: 03-09-2026.

## Dónde estamos

**Fases 1-5 en producción.** **Backlog B1-B10 shippeado y pusheado** salvo **B6** (bloqueado — faltan
los assets del logo en `public/`). Más fixes de robustez de la llamada a la IA (03-09, ver abajo).
`https://alanepazs.github.io/3maps/` (deploy automático en cada push a `main`). Repo
`github.com/alanepazs/3maps`, local `D:\IA\3maps`.
- **Fase 4** (panel rediseñado + contadores de tokens + adjuntos + copiar/guardar): shippeada,
  probada con keys (Gemini imagen+PDF, Groq visión, pegar captura, T15). Claude bloqueado por saldo.
- **Fase 5** — **un globo del canvas = un TRAMO** (cadena `main`), no un intercambio suelto. Enter
  agrega a la punta del mismo globo; globo nuevo solo al ramificar; el globo crece con la
  conversación (slider en "Lienzo"). **Cambio solo de vista, cero migración.** Shippeada.
  Detalle: `docs/historia.md` "Fase 5"; el porqué: `decisiones.md` F5-0..F5-7.
  **"globo" → "tramo" NO se renombró** (dos términos útiles: globo = nodo visual, tramo = cadena
  de datos).
- **Backlog B1-B10**: detalle en `docs/historia.md` "Backlog post-fases"; el porqué en
  `decisiones.md` (B1, B3, B4, B5, B7, §10, F5-7).
- **Fixes de la IA (03-09)** — reporte de Alan (respuestas que se cortan a la mitad, peor con
  2 ramas): watchdog **por fases**, respuesta **truncada** que se marcaba como completa,
  `⌄` con **pointer capture**, **mismatch de hidratación** con ajustes guardados. Todo en
  `decisiones.md` F3-6 (+ B3-b, B5). Pusheado.
- **Falta que Alan confirme en Chrome**: que ya no se corta con 2 ramas; el `:hover` visual de B7;
  la instrumentación `[b2]` con keys reales (después sacarla).

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

### Fase 5 + Backlog B1-B10 — shippeado

Todo en prod. Qué shippeó cada bloque → `docs/historia.md` ("Fase 5", "Backlog post-fases"). El
porqué → `decisiones.md` (F5-*, B1, B3, B4, B5, B7, §10). Probado por Alan en Chrome (02-09):
Enter 10× → 1 globo · ramificar desde el medio · "▤ Ordenar" / solapes · Copiar/Guardar por
respuesta · multi-select con envión parejo (los 4) — todo OK.

**Pendiente de prueba de Alan en Chrome** (el pane no cubre render/inercia/streaming/keys):
- B7: el `:hover` visual del zoom de lupa (scale + z-index).
- B2: correr una rama larga con key real → `localStorage["3maps:debug:b2"]` con `incremental:true`.
  **Después: sacar la instrumentación `[b2]`** (temporal — `console.info` + ese localStorage).
- Fixes IA 03-09: que ya no se corte con 2 ramas; el aviso de respuesta truncada.

### B6 — logo (bloqueado)
Concepto elegido (02-09: árbol verde + copa de globos de diálogo naranjas/verdes + wordmark
"3maps" naranja, sin "3" como tronco). **Falta que Alan suba los assets** a `public/`
(`logo.svg` lockup / `logo-mark.svg` árbol solo / `favicon.svg` + `apple-touch-icon.png`). Ahí:
`<link>` del favicon en `app/layout.tsx` + fondo del canvas con `logo-mark` en opacidad baja.

### Ideas sin empezar
- **T15 "doc card"** — tarjeta compacta cuando la respuesta ES un documento.
- **Export/import `.zip`** de la carpeta de `.md` + File System Access API (con adjuntos — spec §7).
- **Embeddings 2.5b** (`transformers.js`) si `intercambiosRelevantes` (match por palabras) se
  queda corto — misma firma, drop-in.
- Modelos locales tipo Ollama (spec §10) — **descartado** (mixed-content/CORS + el celu no llega a
  `localhost`); los modelos abiertos ya se sirven online vía Groq/OpenRouter/etc.

### Prueba real pre-existente pendiente
- **DeepSeek, GPT** con key real (pagos — cuando Alan tenga saldo). Los 4 free
  (Gemini/Groq/OpenRouter/HuggingFace) ya están probados; lista de proveedores cerrada en 7.
- Panel/globo redimensionable + fixes de móvil (3.11/3.13) en celu.
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
- **Llamada IA que se corta**: watchdog **por fases** (F3-6: resumir 240s + corte propio 50s;
  1er token 90s; entre chunks 45s) + `pendiente: 1` persistido + "↻ Rehacer". Respuesta cortada
  por `MAX_TOKENS`/`length` → `RespuestaIA.truncada` → nota "incompleta" sin borrar el texto.

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
- **Navegar el código**: `graphify query "<pregunta>"` desde `D:\IA\3maps` (napkin §6b). Tras
  cambios de estructura: `graphify update . --force`.
- **Publicar**: `git push` desde `D:\IA\3maps` (credencial en Windows Credential Manager).
  `gh` NO está autenticado. Deploy a Pages = push a `main`.
- **Al cerrar sesión**: `tsc` + `lint` + `build` en verde · `git push` · actualizar los `.md`
  (`estado.md` + `decisiones.md` + `arquitectura.md` si cambió estructura + `historia.md`) ·
  `graphify update . --force` si cambió la estructura.
