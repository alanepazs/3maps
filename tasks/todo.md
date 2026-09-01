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
- [ ] T12 — Contador de tokens gastados por globo (`BranchTranscript.tsx`) [S] — dep: T11
- [x] T14 — Auto-scroll del `BranchTranscript` sigue el texto mientras streamea (hoy no lo hace bien) (`BranchTranscript.tsx`) [S]
- [x] Bugfix — ramificar una rama en árbol ancho tiraba el globo lejos/suelto: `ubicarNuevoGlobo`
      búsqueda en anillos acotada + `resolverSolapes()` al crear (`layout.ts`, `FlowCanvas.tsx`; decisiones F3-7b)
- [ ] T15 — Respuestas que SON un documento (`.md`, código largo): investigar UX — ¿bloque plegable + copiar/descargar? ¿mejor instrucción de sistema? (spec primero) [investigar]
- [ ] T16 — Drag & drop de archivos al mini-composer del panel (adjuntar al contexto) — investigar alcance: text/imagen, límites, qué proveedores lo soportan (spec primero) [L]

### Checkpoint Fase 4
- [ ] `tsc` + `lint` + `build` verde
- [ ] Chrome real: turnos diferenciados; STOP corta; flechas navegan; contadores plausibles

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
