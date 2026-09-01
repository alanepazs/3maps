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
- **F5-2 ~** — Enter a la punta: casi hecho en F5-1. Falta verificar el mini-composer del panel.
- **F5-3 ✅** — ramificar desde cualquier intercambio. "⑂ ramificar desde acá" por turno IA en el
  panel → chip "Ramificando desde: «...»" + Enter/botón ramifican desde ese punto. `onSubmit`
  gana `desdeId?`. `ubicarNuevoGlobo` ahora es tramo-aware (`layout.ts`). Decisiones F5-3.
  8 asserts + pane.
- **F5-4 ✅** — `Settings.crecimientoPxPorMensaje` (0-24, def 9) + `crecimientoTope` (def 320);
  sliders en "Lienzo". `MessageNode` alto = `ALTO_BASE_GLOBO(108) + min(n*px, tope)` (por
  `NodeActionsContext`). Se sacó "expandir/colapsar" del globo (F3-1) + `vista.ts`. Decisiones F5-4.
- **F5-5** — adaptar `calcularLayout` ("Ordenar"), `resolverSolapes`, streaming del globo.
- **F5-6** — docs (CLAUDE.md invariante ✅ ya) + `arquitectura.md` + `historia.md` + renombres.

## Fuera de este plan (más adelante — pedidos de Alan 01-09)
- **B1** — color por globo: marcar la esquina sup-derecha del título con un color a elección.

## Fuera de este plan (más adelante — pedidos de Alan 01-09)
- **B1** — color por globo: marcar la esquina sup-derecha del título con un color a elección.
  Va al `.md` (`Intercambio.color`), se elige desde el `NodeToolbar`.
- **B2** — optimizar la ventana de contexto a medida que el mapa crece (resumen más agresivo,
  ventana adaptativa). ❓ **Pregunta pendiente**: ¿es mucho el gasto de tokens que hace el
  `resumir()` con keys gratuitas? Medir antes de tocar.
- **B3** — multi-select move: al mover varios globos seleccionados, uno solo queda con envión.
  Decidir: quitarle el envión a ese, o dárselo a todos (probablemente ninguno — el envión de
  grupo no aporta y confunde). Toca `useNodeInertia` / `onSelectionDrag*`.
- **B4** — Setting "grosor de líneas": engrosar/afinar los edges conectores (`Settings.edgeWidth`
  → `arbolAVista` / CSS de `.react-flow__edge-path`).
- **B5** — Settings "fuente" (un puñado de las conocidas) + "tamaño de texto". Toca `globals.css`
  / `layout.tsx` (cargar las fuentes) + `Settings`.
- **B6** — preparar el código para un fondo del mapa con el logo de 3maps (o usar la marca en
  algún lado). Abrir a sugerencias cuando se llegue. Probablemente un `<Background>` custom de
  React Flow o un div de fondo con el SVG del logo, opacidad baja.
- **B7** — "zoom de lupa": los globos reaccionan al mouse y se agrandan al pasar por encima
  (hover → `transform: scale()` o lente). Setting en la pestaña "Lienzo": `Settings.hoverZoom`
  (on/off). Cuidar: no romper el drag/selección, ni el layout de los vecinos (¿scale desde el
  centro? ¿z-index alto en hover?).

## Fuera de este plan (más adelante — pre-existentes)
- Auto-switch de proveedor al pegar una key de otro
- Export/import `.zip` de la carpeta de `.md` + File System Access API
- Embeddings 2.5b (`transformers.js`) si el match por palabras se queda corto
- Fixes de móvil (3.13) en Chrome real / celu
- Watchdog de 45s que no corte un stream lento-pero-vivo
