# TODO — próximos cambios (ver `tasks/plan.md` para el detalle)

## Fase 1 — Cancelación + UX del globo pendiente
- [x] T13 — Heurística de LaTeX crudo en `normalizarMath` (`Markdown.tsx`) [S] — adelantada; independiente
- [x] T1 — `stopNode`: cortar el stream conservando lo parcial (`nodeActions.ts`, `FlowCanvas.tsx`) [S]
- [x] T2 — Globo `pending`: badge de lápiz animado FUERA del globo + botón STOP cuadrado (`MessageNode.tsx`, `globals.css`) [S] — dep: T1
- [x] T3 — Globo nace colapsado mientras streamea + auto-scroll (`MessageNode.tsx`, `vista.ts`) [S]

### Checkpoint Fase 1
- [x] `tsc` + `lint` + `build` verde; `_scratch.mts` de `normalizarMath` con asserts
- [x] Chrome real (Alan): `\frac{...}` renderiza; badge de lápiz anda (pulso con reduce-motion);
      STOP deja lo parcial sin spinner ni error; "↻ Rehacer" ok
- [x] Globo `pending` no crece; auto-scroll del texto entrante ok

## Fase 2 — ⚙️ SettingsPanel en 2 pestañas
- [x] T4 — Reestructurar en pestañas "Lienzo" / "IA" (`SettingsPanel.tsx`) [M]
- [x] T5 — Colapsar la caja ámbar del proxy en `<details>` (`SettingsPanel.tsx`) [S] — dep: T4

### Checkpoint Fase 2
- [x] `tsc` + `lint` + `build` verde
- [x] Pane: cada pestaña muestra sus secciones; checkbox del proxy visible sin abrir el `<details>`
- [x] Guardar la key sigue andando; ningún control se perdió

## Fase 3 — Manija de resize con zoom out
- [x] T6 — `cursor: nwse-resize` + tooltip + contra-escala `1/zoom` (`MessageNode.tsx`) [S]

### Checkpoint Fase 3
- [x] `tsc` + `lint` + `build` verde
- [x] Chrome real: con zoom out la manija sigue agarrable; cursor cambia al pasar por encima

## Fase 4 — Rediseño de `BranchTranscript`
- [x] T7 — Turno usuario vs. IA diferenciados (`BranchTranscript.tsx`) [S]
- [x] T8 — STOP en el mini-composer del panel (`BranchTranscript.tsx`, `FlowCanvas.tsx`) [S] — dep: T1
- [x] T9 — Flechas de navegación (rediseñado, decisiones F3-18/b/c): 2 flechas laterales `‹` `›`
      que navegan SOLO a globos unidos por línea de costado (ramas hijas + padre si el abierto es
      rama). El panel abre en el "Vos". Drag ahora respetado (F3-18b). (`BranchTranscript.tsx`, `FlowCanvas.tsx`)
- [x] T10 — Contador de contexto estimado. `contexto.ts` `estimarTokens(mensajes)` = `Σ chars / 4`.
      `FlowCanvas` calcula `estimarTokens(armarContexto(…))` para el globo abierto (usa resumen
      cacheado si hay, nunca lo dispara) → prop `contextoTokens` → header del panel
      "≈ N tokens de contexto". (`contexto.ts`, `FlowCanvas.tsx`, `BranchTranscript.tsx`; decisiones F3-20)
- [x] T11 — `llamarIA` devuelve `{ texto, uso }`; `uso` (tokens in/out) → `.md` como `tokens_in`/`tokens_out`.
      Claude `final.usage` · Gemini `usageMetadata` (thoughts van a salida) · OpenAI-compat `stream_options:{include_usage:true}`
      → chunk final. Proveedor sin usage → `uso: null`, sin contador. (`ia.ts`, `intercambio.ts`, `FlowCanvas.tsx`; decisiones F3-19)
      ⚠️ Falta que Alan confirme e2e que `stream_options` no rompe Groq/OpenRouter/HuggingFace.
- [x] T12 — Contador de tokens gastados por globo: cada turno IA del panel muestra
      "`{fmtTokens(tokensEntrada)} → {fmtTokens(tokensSalida)} tok`" junto al nombre del proveedor,
      con `title`. Si el `.md` no tiene tokens → no muestra nada (nunca "0"). (`BranchTranscript.tsx`; decisiones F3-21)
- [x] T14 — Auto-scroll del `BranchTranscript` sigue el texto mientras streamea (hoy no lo hace bien) (`BranchTranscript.tsx`) [S]
- [x] Bugfix — ramificar una rama en árbol ancho tiraba el globo lejos/suelto: `ubicarNuevoGlobo`
      búsqueda en anillos acotada + `resolverSolapes()` al crear (`layout.ts`, `FlowCanvas.tsx`; decisiones F3-7b)
- [x] T15 — Respuestas que SON un documento: copiar / guardar. `src/model/exportar.ts` nuevo
      (`nombreArchivoRespuesta` heurística: fence único → interior + ext; parece markdown → `.md`;
      slug del `# Título` · `descargarTexto` · `copiarTexto`). "⧉ Copiar" + "⬇ Guardar" en el turno
      IA del panel; "⧉" por bloque de código en `Markdown.tsx` (prop `conCopiar`, solo el panel).
      Sin doc card, sin tocar systemPrompt. (decisiones F3-23) — 14 asserts + verificado en el pane.
- [x] T16 — Adjuntar archivos al mini-composer del panel (texto + imágenes + PDF). Spec:
      `tasks/T16-spec.md`. **T16a texto ✅ · T16b imágenes ✅ · T16c PDF ✅** (F3-22/b/c). Falta
      prueba de Alan con keys reales (imagen/PDF con Gemini/Claude, modelo de visión de Groq,
      pegar captura).
  - [x] **T16a — texto punta a punta.** `Adjunto`/`Intercambio.adjuntos` + `.md` (frontmatter JSON
        1 línea) + `Mensaje.adjuntos` + `armarContexto` pega el texto adjunto a la pregunta (NO se
        re-manda a los hijos) + `src/model/adjuntos.ts` (leer/validar/topes) + dropzone/paste/📎 +
        chips + badge "📎 N" en el globo + chip lectura en el panel. (`intercambio.ts`, `contexto.ts`,
        `adjuntos.ts`, `BranchTranscript.tsx`, `FlowCanvas.tsx`, `MessageNode.tsx`, `compartir.ts`;
        decisiones F3-22) — 25 asserts scratch + verificado en el pane (drop, reject, send, reload).
  - [x] **T16b — imágenes.** `comprimirImagen` (`<canvas>`, 1568px, JPEG q0.82/0.6 salvo PNG con
        transparencia). 3 adaptadores mapean `tipo:"imagen"` (Claude `image` / Gemini `inline_data`
        / OpenAI-compat `image_url`); error sugiere Gemini/Claude si el modelo no tiene visión.
        `estimarTokens` +1300/imagen. Thumbnails en chips y turno "Vos" + lightbox. eslint apaga
        `no-img-element`. (`adjuntos.ts`, `ia.ts`, `contexto.ts`, `BranchTranscript.tsx`,
        `eslint.config.mjs`; decisiones F3-22b) — 13 asserts + verificado en el pane (compresión
        2000→1568px PNG→JPEG 87→29KB, transparencia queda PNG, envío persiste, lightbox).
        Falta prueba de Alan: imagen real con Gemini/Claude/Groq-vision + pegar captura.
  - [x] **T16c — PDF.** `leerArchivo` acepta PDF (base64, tope 1MB). `multimediaDe(m)` en Claude
        (bloque `document`) y Gemini (`inline_data` application/pdf); OpenAI-compat NO manda el PDF
        (solo el texto). `BranchTranscript` recibe `proveedorLeePdf`/`proveedorNombre` → aviso
        ámbar "solo Gemini/Claude" cuando el proveedor activo es otro (no bloquea). `estimarTokens`
        +3000/pdf. (`adjuntos.ts`, `ia.ts`, `contexto.ts`, `BranchTranscript.tsx`, `FlowCanvas.tsx`;
        decisiones F3-22c) — 11 asserts + verificado en el pane (chip 📕, aviso con Groq / sin aviso
        con Gemini, envío persiste). **T16 COMPLETO.**

### Checkpoint Fase 4 — **TODO IMPLEMENTADO (T7-T16 + T13)**. Probado por Alan (02-09):
- [x] `tsc` + `lint` + `build` verde (en cada tarea)
- [x] Gemini imagen+PDF · Groq visión (`qwen3.6/3.8`) + avisos · pegar captura · T15 copiar/guardar
- [ ] Claude/DeepSeek/GPT (bloqueado por saldo) · turnos/STOP/flechas/contadores · `\frac` · resize zoom out

## Fase 5 — el globo pasa a ser un TRAMO de la conversación

**Spec: `tasks/fase5-spec.md`** (decisiones cerradas con Alan 02-09, esperando "dale"). Cambio
**solo de vista** (el modelo de datos no cambia; cero migración). Enter agrega al mismo globo;
globo nuevo solo al ramificar; el globo crece unos px por mensaje (slider en "Lienzo").
Sub-tareas:
- **F5-0 ✅** — fix del `⌄` del Composer (`tragarClickSintetico` en `gestos.ts`; el `{once:true}`
  de las manijas de resize se comía cualquier click posterior).
- **F5-1 ✅** — `calcularTramos`/`tramoDesde`/`cabezaDeTramo` + `arbolAVista` reescrito (1 nodo =
  1 tramo = cadena `main`) + `MessageNode` renderiza el tramo + `datosIguales` usa `data.rev` +
  `FlowCanvas` resuelve todo a cabeza/punta. `handleSubmit` main → agrega a la punta (no crea
  globo). Cero migración. Decisiones F5-1. 18 asserts + pane.
- **F5-2 ✅** — Enter a la punta (folded en F5-1). Verificado en el pane.
- **F5-3 ✅** — ramificar desde cualquier intercambio. "⑂ ramificar desde acá" por turno IA en el
  panel → chip "Ramificando desde: «...»" + Enter/botón ramifican desde ese punto. `onSubmit`
  gana `desdeId?`. `ubicarNuevoGlobo` ahora es tramo-aware (`layout.ts`). Decisiones F5-3.
  8 asserts + pane.
- **F5-4 ✅** — `Settings.crecimientoPxPorMensaje` (0-24, def 9) + `crecimientoTope` (def 320);
  sliders en "Lienzo". `MessageNode` alto = `ALTO_BASE_GLOBO(108) + min(n*px, tope)` (por
  `NodeActionsContext`). Se sacó "expandir/colapsar" del globo (F3-1) + `vista.ts`. Decisiones F5-4.
- **F5-4b ✅** — auto-scroll del stream (patrón `pegado`) en panel + globos; grip 16→28px.
- **F5-4c ✅** — el `⌄` y el cursor de resize DE VERDAD (F5-0/F5-4b no cerraron; reproducidos en
  Chrome real con CDP). `tragarClickSintetico` traga por **target** (`.react-flow__pane` /
  `[data-cierra-al-click]`), no por tiempo. La manija de resize sale del `overflow-hidden` del
  `MessageNode` y cuelga 4px por fuera. Decisiones F5-4c.
- **F5-5 ✅** — `calcularLayout` ("▤ Ordenar") + `resolverSuperposiciones` recorren TRAMOS (1
  posición por tramo, la de la cabeza; ramas alineadas al top). `ubicarNuevoGlobo` ya era
  tramo-aware. 19 asserts + e2e. Decisiones F5-5.
- **F5-6 ✅** — `historia.md` sección Fase 5; `arquitectura.md` + `decisiones.md` al día; CLAUDE.md
  invariante ya decía "un globo (nodo del canvas) = un TRAMO". `BranchTranscript` → `PanelConversacion`
  (archivo + refs vivas). "⧉ Copiar"/"⬇ Guardar" en CADA respuesta del panel (F3-23). **"globo" →
  "tramo" NO se hizo** — quedaron dos términos útiles (globo = nodo visual, tramo = cadena de datos).

### Checkpoint Fase 5 — probado por Alan en Chrome real (02-09)
- [x] `tsc` + `lint` + `build` verde (en cada tarea) + `_scratch` de tramos (19 asserts) + e2e pane
- [x] Enter 10-11× → **1 globo** · ramificar desde el medio · "▤ Ordenar" no solapa · Copiar/Guardar
      por respuesta · el `⌄` de un click · cursor de resize
- [ ] "mapa viejo se agrupa en 1 tramo" — no gatillado (caso interno)
- [x] push (deploy a Pages) — hecho (`7079332..d1ff407`, run OK)
- [x] B8 / B9 / B10 (bugs de la prueba) arreglados — ver "Fuera de este plan" + decisiones F5-7.
      Falta que Alan confirme B9 (scroll-follow) en Chrome con key real.

## Fuera de este plan (más adelante — pedidos de Alan 01-09)
- **B1 ✅** — color por globo. Paleta fija de 6 (`ambar/verde/rojo/cian/violeta/rosa`) + sin color,
  no hex. `Intercambio.color` en la cabeza del tramo → `.md` (`color:`) → sync/compartir gratis.
  Punto en la esquina del header + fila de swatches en el `NodeToolbar`. `conColor` / `colorNode`.
  12 asserts + e2e. Decisiones B1.
- **B2 ✅** — contexto adaptativo = **resumen incremental**: `resumir()` acepta `resumenPrevio`;
  `responder` busca el prefijo cacheado más largo y resume solo la cola nueva. Se descartó la
  "ventana que se achica". Instrumentación `[b2]` temporal (sacar tras confirmar). Decisiones §10.
- **B3 ✅** — multi-select move: envión **parejo a todo el grupo** (`FlowCanvas` arma el grupo con
  `getNodes().filter(selected)`); selección se mantiene tras mover; **toolbar compartida**
  `ToolbarGrupo` con >1 seleccionado. Decisiones B3.
- **B4 ✅** — Setting "grosor de líneas" (edges). `Settings.grosorLineas` (1-5, def 1.5), slider en
  "Lienzo". Se aplica como CSS var `--xy-edge-stroke-width` en el contenedor del canvas (no pasa
  por `arbolAVista`). En vivo, persiste. Decisiones B4.
- **B5 ✅** — Settings "fuente" (sistema/geist/serif Lora/mono) + "tamaño de texto" (0.8-1.3).
  `FlowCanvas` escala el `font-size` del `<html>` + `--fuente-3maps`. `Markdown.tsx` px → `em`.
  Decisiones B5.
- **B6 ✅** — Alan subió `public/{logo.png, 3.png}` (ya transparentes). Generados:
  `src/app/{favicon.ico,icon.png,apple-icon.png}` (marca sobre blanco; Next los linkea con
  basePath) + `public/logo-mark.png` (watermark del canvas al 5%, hijo de `<ReactFlow>`).
  `src/model/assets.ts` `rutaAsset()`. Decisiones B6.
  <!-- notas viejas del concepto, ya no relevantes: -->
- ~~logo de 3maps + usarlo en la app. **Bloqueado hasta que Alan suba los assets buenos.**~~
  - **Concepto elegido (Alan, 02-09)**: árbol **verde** de tronco/ramas simples (NO "3" — lo
    descartó), copa de **globos de diálogo** naranjas/ámbar (algunos verdes), + wordmark "3maps"
    naranja lowercase debajo. Plano, 3 colores (`#F5A524` ámbar, `#E8590C` naranja quemado,
    `#57A639` verde). Se iteró en Recraft V4.1 Pro; la última versión (árbol + globos + wordmark,
    transparente) está OK.
  - **Falta**: Alan tiene que subir a `public/` los archivos BUENOS — **PNG con transparencia
    real o SVG** (las capturas `.jpg` que subió tenían el damero quemado, no sirven, se sacaron).
    Nombres sugeridos: `logo.png` (lockup) · `logo-mark.png` (solo el árbol) · `favicon.png`
    (cuadrado, recortado ajustado, ~512px) · `apple-touch-icon.png` (180×180).
  - **Cuando estén**: `<link rel="icon">` en `app/layout.tsx` (metadata `icons`) + fondo del canvas
    con `logo-mark` en opacidad baja (`<div>` de fondo o `<Background>` custom de React Flow).
- **B7 ✅** — "zoom de lupa": `Settings.hoverZoom` (def off). CSS puro
  `:root[data-hoverzoom="on"] .react-flow__node:hover .globo-root { scale(1.35); z-index }`
  (transform → no corre a los vecinos), excluye `.dragging`/`.selected`. `data-hoverzoom` en el
  `<html>` (evita mismatch). `onResizeStart` → `offsetWidth`. Decisiones B7.
- **B8 ✅** — arrastrar un globo iba a ~5 fps. `Markdown` = `memo` + `useMemo`; la transcripción
  del `MessageNode` sale a `CuerpoTramo` (`memo` por `rev`/`readOnly`). 0 mutaciones DOM en
  zoom+drag. Decisiones F5-7.
- **B9 ✅** — el scroll-follow del panel se plantaba a mitad del stream. `useLayoutEffect` + ref
  `autoScroll` (ignora el `scroll` event propio). Aplicado a `PanelConversacion` y `MessageNode`.
  Decisiones F5-7.
- **B10 ✅** — manija de resize + scrollbar del panel pegados con `side="left"`. La manija sale
  entera del panel (`left-full ml-1`); el 1er intento con `mr-4` en `scrollRef` dejaba la flecha
  `›` de nav flotando en un hueco (reporte de Alan) → descartado. Decisiones F5-7.

## Fixes de robustez de la llamada a la IA (03-09) — ✅
- **Watchdog por fases** (F3-6): resumir bajo `TOTAL_MS` (240s) + corte propio a 50s; 1er token
  `PRIMER_BYTE_MS` (90s); entre chunks `INACTIVIDAD_MS` (45s). `resumir()` recibe `signal`.
- **Respuesta truncada** por `MAX_TOKENS`/`length` → `RespuestaIA.truncada` → nota "incompleta"
  sin borrar el texto; el render muestra respuesta + aviso juntas.
- **`⌄` de un click** → pointer capture (`arrastrarConCaptura`), adiós swallower global.
- **Mismatch de hidratación** con ajustes guardados → `sVista = hidratado ? settings : DEFAULT`.
- **Auto-switch de proveedor** ✅ — `proveedorDeLaKey`; botón "Cambiar a X" cuando pegás una key
  de otro proveedor (conserva la key cruzando el cambio). Decisiones §8c.

## Fuera de este plan (más adelante — pre-existentes)
- Export/import `.zip` de la carpeta de `.md` + File System Access API
- Embeddings 2.5b (`transformers.js`) si el match por palabras se queda corto
- Fixes de móvil (3.13) en Chrome real / celu
