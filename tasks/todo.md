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
- [ ] T7 — Turno usuario vs. IA diferenciados (`BranchTranscript.tsx`) [S]
- [ ] T8 — STOP en el mini-composer del panel (`BranchTranscript.tsx`, `FlowCanvas.tsx`) [S] — dep: T1
- [ ] T9 — Flechas de navegación: hermanos + subir al padre + bajar al primer hijo (`BranchTranscript.tsx`, `FlowCanvas.tsx`, `intercambio.ts`) [M]
- [ ] T10 — Contador de contexto estimado por globo y árbol (`contexto.ts`, `BranchTranscript.tsx`) [M]
- [ ] T11 — `llamarIA` devuelve `usage`; se guarda en el `.md` (`ia.ts`, `intercambio.ts`, `FlowCanvas.tsx`, `contexto.ts`) [M]
- [ ] T12 — Contador de tokens gastados por globo (`BranchTranscript.tsx`) [S] — dep: T11
- [ ] T14 — Auto-scroll del `BranchTranscript` sigue el texto mientras streamea (hoy no lo hace bien) (`BranchTranscript.tsx`) [S]
- [ ] T15 — Respuestas que SON un documento (`.md`, código largo): investigar UX — ¿bloque plegable + copiar/descargar? ¿mejor instrucción de sistema? (spec primero) [investigar]
- [ ] T16 — Drag & drop de archivos al mini-composer del panel (adjuntar al contexto) — investigar alcance: text/imagen, límites, qué proveedores lo soportan (spec primero) [L]

### Checkpoint Fase 4
- [ ] `tsc` + `lint` + `build` verde
- [ ] Chrome real: turnos diferenciados; STOP corta; flechas navegan; contadores plausibles

## Fuera de este plan (más adelante)
- Auto-switch de proveedor al pegar una key de otro
- Export/import `.zip` de la carpeta de `.md` + File System Access API
- Embeddings 2.5b (`transformers.js`) si el match por palabras se queda corto
- Fixes de móvil (3.13) en Chrome real / celu
- Watchdog de 45s que no corte un stream lento-pero-vivo
