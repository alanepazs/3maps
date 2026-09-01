# Plan de acción — próximos cambios (backlog de `docs/estado.md` "Opcionales")

> Creado 01-09-2026. Fuente: la lista "Opcionales" de `docs/estado.md`, priorizada con el usuario.
> Fuera de este plan (más adelante): auto-switch de proveedor al pegar key, export/import `.zip`,
> embeddings 2.5b, fixes de móvil 3.13.

## Overview

Cinco frentes de UX, en 4 fases. La Fase 1 (cancelación + globo pendiente) va primero porque
`stopNode` es infraestructura que también usa la Fase 4, y el globo `pending` es lo más visible.
Fases 2 y 3 son aisladas (un archivo cada una) y pueden entrar en cualquier orden. La Fase 4
(rediseño de `BranchTranscript`) es la más grande y se corta en sub-tareas.

Cada tarea = una rama/commit, con el ciclo `spec-driven` → `incremental-implementation` +
`test-driven` → `code-review` → `git-workflow`. `tsc` + `lint` + `build` en verde siempre.

## Architecture Decisions

- **`stopNode` usa el `enVueloRef` que ya existe** (`FlowCanvas` línea 366, `Map<id, AbortController>`).
  El corte del usuario se distingue con `ctrl.abort("usuario")` → en el `catch` de `responder`,
  `ctrl.signal.reason === "usuario"` → se conserva la respuesta parcial y `pending: false`
  (hoy el abort del usuario es silencioso y deja el globo `pending` para siempre salvo watchdog).
- **`stopNode` entra en `NodeActionsContext`** junto a `deleteNode`/`retryNode`/`resizeNode` —
  mismo patrón, sin tocar `data` de cada nodo.
- **Las 2 pestañas de `SettingsPanel` NO persisten** (estado local `useState`, arranca en "Mapa").
  Es una preferencia de sesión, no de las que van a `Settings`/`localStorage`.
- **Contador de tokens**: `llamarIA` va a devolver `{ texto, usage? }` en vez de `string`. El
  `usage` (prompt/completion/total tokens) se guarda en el `.md` del intercambio como un campo de
  frontmatter opcional (`tokens: 1234` o `tokens_in: … tokens_out: …`). Providers que no lo
  devuelven → sin contador para ese globo (no romper).
- **Contador de contexto** = estimación local (`texto.length / 4` por mensaje, aprox GPT-tokenizer)
  sobre lo que devuelve `armarContexto`. No se baja ningún tokenizer.
- **La heurística de LaTeX crudo va en `Markdown.tsx` `normalizarMath`**, es independiente del
  rediseño de `BranchTranscript` — se puede adelantar si conviene.

## Task List

### Fase 1 — LaTeX crudo + cancelación + UX del globo pendiente

- [ ] **T13 — Heurística de LaTeX crudo en `normalizarMath`.** [S] (adelantada; independiente)
- [ ] **T1 — `stopNode`: cortar el stream de un globo conservando lo parcial.** [S]
- [ ] **T2 — Globo `pending`: badge de lápiz (animado) FUERA del globo + botón cuadrado STOP.** [S]
- [ ] **T3 — Globo nace colapsado mientras streamea.** [S]

#### Checkpoint Fase 1
- [ ] `tsc` + `lint` + `build` verde; `_scratch.mts` de `normalizarMath` (T13) con asserts.
- [ ] En Chrome real: `\frac{...}` suelto renderiza; mando una pregunta, aparece el badge de lápiz
      + STOP; clic en STOP → el globo se queda con lo que llegó, sin spinner, sin error rojo, y
      "↻ Rehacer" sigue disponible.
- [ ] El globo `pending` no crece con el stream (arranca a `ALTO_COLAPSADO`), y el auto-scroll
      del texto entrante sigue funcionando.

### Fase 2 — ⚙️ `SettingsPanel` en 2 pestañas ("Lienzo" / "IA")

- [ ] **T4 — Reestructurar `SettingsPanel` en pestañas "Lienzo" / "IA".** [M]
- [ ] **T5 — Colapsar la caja ámbar del proxy en un `<details>`.** [S]

#### Checkpoint Fase 2
- [ ] `tsc` + `lint` + `build` verde.
- [ ] Pane: la pestaña "Lienzo" muestra envión + ventana de contexto + instrucción de sistema; la
      pestaña "IA" muestra proveedor + key + modelo + proxy + Cuenta + Compartir. El checkbox del
      opt-in del proxy sigue visible sin abrir el `<details>`.
- [ ] Nada de lo que había se perdió; guardar la key sigue andando.

### Fase 3 — Manija de resize usable con zoom out

- [ ] **T6 — `cursor: nwse-resize` + tooltip + contra-escala `1/zoom` de la manija ◢.** [S]

#### Checkpoint Fase 3
- [ ] `tsc` + `lint` + `build` verde.
- [ ] En Chrome real: con zoom out fuerte, la manija sigue siendo agarrable y el cursor cambia
      a la flecha de redimensionar al pasar por encima.

### Fase 4 — Rediseño de `BranchTranscript`

- [ ] **T7 — Diferenciación visual del turno usuario vs. turno IA.** [S]
- [ ] **T8 — Botón STOP en el mini-composer del panel (reusa `stopNode`).** [S]
- [ ] **T9 — Flechas para navegar hermanos / ramas de un globo desde el panel.** [M]
- [x] **T10 — Contador de contexto (estimado) en el panel.** [M] (decisiones F3-20)
- [x] **T11 — `llamarIA` devuelve `{ texto, uso }`; `uso` → `.md`.** [M] (decisiones F3-19)
- [x] **T12 — Contador de tokens gastados por globo (usa T11).** [S] (decisiones F3-21)
- [ ] **T14 — Auto-scroll del panel sigue el texto mientras streamea.** [S]
- [x] **T15 — Respuestas que son un documento: copiar / guardar.** [S] (decisiones F3-23)
      Núcleo: "⧉ Copiar" + "⬇ Guardar" la respuesta en el panel + "copiar" por bloque de código
      (gateado al panel con `conCopiar`); `src/model/exportar.ts` con la heurística de nombre.
- [x] **T16 — Adjuntar archivos al mini-composer.** [L] Spec `tasks/T16-spec.md`. **T16a texto ✅**
      (F3-22) · **T16b imágenes ✅** (F3-22b) · **T16c PDF ✅** (F3-22c). Falta prueba de Alan con keys.
- [x] **T13 — Heurística de LaTeX crudo en `normalizarMath`.** [S] (F3-14b, ya shippeada)

#### Checkpoint Fase 4 — **TODAS las tareas hechas** (T7-T16). Falta solo la prueba de Alan.
- [x] `tsc` + `lint` + `build` verde en cada tarea; scratch por tarea.
- [ ] **Chrome real (Alan)**: turnos, STOP, flechas, contadores, `\frac`, adjuntos (texto/imagen/
      PDF con Gemini/Claude, pegar captura), copiar/guardar respuesta.

## Detalle de tareas

### T1 — `stopNode`
**Descripción:** Handler nuevo que corta la llamada IA en vuelo de un globo y deja la respuesta
parcial visible como respuesta final (no `pending`, no `error`).

**Acceptance criteria:**
- [ ] `NodeActionsContext` tiene `stopNode(id: string): void`.
- [ ] `FlowCanvas.stopNode` hace `enVueloRef.current.get(id)?.abort("usuario")`.
- [ ] `responder`: en el `catch`, si `ctrl.signal.reason === "usuario"` → `setArbol` con
      `conRespuesta(a, id, { respuesta: acumulado || null, pending: false, proveedor })`.
- [ ] Un abort por watchdog (`cortadoPorTimeout`) y un abort por re-disparo siguen comportándose
      como hoy.

**Verification:** `tsc`/`lint`/`build`; pane: disparar `responder` con un stream mockeado, llamar
`stopNode`, chequear que el árbol queda con `pending:false` y el texto parcial; Chrome real para
el flujo completo.

**Dependencies:** None. **Files:** `nodeActions.ts`, `FlowCanvas.tsx`. **Scope:** S.

### T2 — Badge de lápiz + STOP en el globo pendiente
**Descripción:** Mientras `data.pending`, `MessageNode` muestra un **badge de lápiz FUERA del
globo** (sobresaliendo del borde superior, tipo el `<NodeToolbar>`) con animación CSS sutil, y un
**botón cuadrado STOP** al lado que llama `stopNode(id)`.

**Acceptance criteria:**
- [ ] Solo aparece con `pending === true` y `!readOnly`.
- [ ] El badge sobresale del borde del globo (no tapa el cuerpo).
- [ ] El botón STOP es cuadrado, chico, con `title="Detener"`, y dispara `stopNode`.
- [ ] La animación del lápiz respeta `prefers-reduced-motion`.

**Verification:** `tsc`/`lint`/`build`; pane: verificar que los elementos existen con `pending`;
Chrome real para la animación.

**Dependencies:** T1. **Files:** `MessageNode.tsx`, `globals.css` (keyframes). **Scope:** S.

### T3 — Globo nace colapsado mientras streamea
**Descripción:** `mostrarColapsado` de `MessageNode` también es `true` cuando `pending` (hoy
`colapsable` mira `respuesta.length` de la respuesta final). El cuerpo arranca a `ALTO_COLAPSADO`
con scroll, y auto-scrollea al final a medida que entra texto.

**Acceptance criteria:**
- [ ] Con `pending`, el cuerpo está clampeado a `ALTO_COLAPSADO` y scrollea.
- [ ] El texto que entra auto-scrollea al fondo (nuevo `useEffect` con `ref` al cuerpo).
- [ ] Un tamaño manual (`data.ancho/alto`, F3-8) sigue ganando sobre el colapso.
- [ ] Al terminar (`pending:false`), vuelve la lógica de F3-1 (colapsa solo si > 400 chars).

**Verification:** `tsc`/`lint`/`build`; pane: inyectar un globo `pending` con texto largo, chequear
`maxHeight`; Chrome real para el auto-scroll.

**Dependencies:** None (se lleva bien con T2). **Files:** `MessageNode.tsx`, `vista.ts`. **Scope:** S.

### T4 — `SettingsPanel` en 2 pestañas ("Lienzo" / "IA")
**Descripción:** Header con 2 tabs: **"Lienzo"** (envión, ventana de contexto, instrucción de
sistema) y **"IA"** (proveedor, API key + guía, modelo + chips, toggle proxy, sección Cuenta,
sección Compartir). Estado del tab en `useState` (no persiste), arranca en "Lienzo".

**Acceptance criteria:**
- [ ] Las dos pestañas renderizan sus secciones; ningún control se perdió.
- [ ] El panel no crece más que hoy (`max-h` + scroll se mantienen por pestaña).
- [ ] `commit()` / guardar key / cambiar proveedor siguen funcionando desde "IA".

**Verification:** `tsc`/`lint`/`build`; pane: click en cada tab, contar los controles; verificar
que guardar una key (con fetch mockeado) sigue andando.

**Dependencies:** None. **Files:** `SettingsPanel.tsx` (grande pero un solo archivo). **Scope:** M.

### T5 — Caja ámbar del proxy colapsable
**Descripción:** La explicación larga del proxy ("no habilita CORS… tu key pasa por el servidor…")
va dentro de un `<details>` ("¿por qué pasa por un proxy? ▸"). El checkbox del opt-in y el aviso
"esta instancia no tiene proxy" quedan fuera, siempre visibles.

**Acceptance criteria:**
- [ ] El checkbox `usarProxyIA` es visible sin abrir el `<details>`.
- [ ] El texto explicativo está plegado por defecto.

**Verification:** `tsc`/`lint`/`build`; pane: elegir un proveedor vía proxy, verificar que el
checkbox se ve y el `<details>` está cerrado.

**Dependencies:** T4 (se hace en el mismo archivo). **Files:** `SettingsPanel.tsx`. **Scope:** S.

### T6 — Manija de resize con zoom out
**Descripción:** A la manija ◢ de `MessageNode`: `cursor: nwse-resize` (ya lo tiene como
`cursor-se-resize` — revisar), `title` ya existe. Nuevo: contra-escalar el tamaño de la manija por
`1 / zoom` (leyendo `useReactFlow().getZoom()` o `useViewport().zoom`) para que mantenga un tamaño
de click ~constante en pantalla, con un mínimo/máximo.

**Acceptance criteria:**
- [ ] Con zoom 0.2, la manija ocupa ~5x su tamaño en coords de lienzo (≈ mismo tamaño en px de
      pantalla que con zoom 1).
- [ ] El cálculo del `onResizeStart` (`/ zoom`) sigue dando el tamaño correcto.

**Verification:** `tsc`/`lint`/`build`; pane: leer el `width` computado de la manija a distintos
zooms via `javascript_tool`; Chrome real para agarrarla.

**Dependencies:** None. **Files:** `MessageNode.tsx`. **Scope:** S.

### T7 — Turno usuario vs. IA en `BranchTranscript`
**Descripción:** Estilos más claros: la pregunta (usuario) y la respuesta (IA) como dos bloques
visualmente distintos (alineación, fondo, o un rótulo/ícono por rol), no el chat plano de hoy.

**Acceptance criteria:**
- [ ] Cada intercambio del `caminoRaizA` se ve como "user turn" + "assistant turn" diferenciados.
- [ ] Sigue siendo vista derivada (sin estado nuevo en el árbol).

**Verification:** `tsc`/`lint`/`build`; Chrome real (es visual).

**Dependencies:** None. **Files:** `BranchTranscript.tsx`. **Scope:** S.

### T8 — STOP en el mini-composer del panel
**Descripción:** Cuando el globo abierto en el panel está `pending`, el mini-composer muestra un
STOP que llama `stopNode(transcriptNodeId)`.

**Acceptance criteria:**
- [ ] Solo con el globo del panel en `pending`.
- [ ] Reusa `stopNode` (pasado a `BranchTranscript` como prop o vía contexto).

**Verification:** `tsc`/`lint`/`build`; Chrome real.

**Dependencies:** T1. **Files:** `BranchTranscript.tsx`, `FlowCanvas.tsx` (pasar la prop). **Scope:** S.

### T9 — Flechas de navegación (todas las direcciones)
**Descripción:** En el header del panel, flechas para moverse por el árbol desde el globo abierto:
**◀▶** entre hermanos (mismo `padreId`), **▲** al padre, **▼** al primer hijo. Mueve `transcriptNodeId`.

**Acceptance criteria:**
- [ ] ◀▶ entre hermanos; deshabilitadas en los extremos. Indicador "2 / 4".
- [ ] ▲ va al `padreId` (deshabilitada en la raíz). ▼ va al primer hijo (deshabilitada si no tiene).
- [ ] Nada rompe si el globo no tiene hermanos / padre / hijos.

**Verification:** `tsc`/`lint`/`build`; pane: árbol con 3 hijos de un padre, click en las flechas,
verificar que `transcriptNodeId` cambia.

**Dependencies:** None. **Files:** `BranchTranscript.tsx`, `FlowCanvas.tsx`, `intercambio.ts`
(helper `hermanos(a, id)` si no existe). **Scope:** M.

### T10 — Contador de contexto estimado ✅ (decisiones F3-20)
**Hecho:** `contexto.ts` exporta `estimarTokens(mensajes) = Math.round(Σ texto.length / 4)`.
`FlowCanvas` tiene un `useMemo` `contextoTokens` = `estimarTokens(armarContexto(arbol,
transcriptNodeId, {ventana}, resumenCacheado, relevantes))` — usa el resumen SOLO si ya está en
`resumenCacheRef` (de una llamada previa de esa rama), nunca lo dispara. Se pasa como prop
`contextoTokens` a `BranchTranscript`, que lo muestra en el header: "N interc. · ≈ N tokens de
contexto" (con `title` que aclara que es estimación y que la llamada real puede mandar menos).
`fmtTokens` (exportado de `BranchTranscript.tsx`) formatea "1.2k". **Un solo número (el del globo
abierto)** — no hay total del árbol entero (el panel es de una rama; iría al lado del
`MapaSwitcher` si se quiere después).

**Acceptance criteria:**
- [x] Número plausible: caso conocido (2 interc., ~590 chars) → 150, verificado en el pane.
- [x] "≈" explícito.
- [x] No dispara la llamada ni el resumen (solo lee el árbol + el cache existente).

**Verificado:** `_scratch.mts` 7 asserts (`estimarTokens` + `estimarTokens(armarContexto(...))`);
`tsc`/`lint`/`build` verde; pane: panel abierto muestra "2 interc. · ≈ 150 tokens de contexto".

**Files:** `contexto.ts`, `FlowCanvas.tsx`, `BranchTranscript.tsx`. **Scope:** M.

### T11 — `llamarIA` devuelve `usage` ✅ (decisiones F3-19)
**Hecho:** `llamarIA` → `Promise<{ texto: string; uso: UsoTokens | null }>` (`UsoTokens =
{ entrada, salida }`). Claude: `final.usage` (entrada suma cache read/creation). Gemini:
`usageMetadata` del último chunk (`thoughtsTokenCount` → salida). OpenAI-compat: se agrega
`stream_options: { include_usage: true }` al body → el chunk final trae `usage` (`choices: []`).
`resumir()` sigue devolviendo `string` (desenvuelve `.texto` internamente — `contexto.ts` NO se
tocó). `FlowCanvas.responder`: destructura `{ texto, uso }`, pasa `tokensEntrada/Salida` a
`conRespuesta` en la escritura final y `null` en el reset del reintento. `intercambio.ts`:
`Intercambio.tokensEntrada/tokensSalida` (`number | null`), frontmatter `tokens_in`/`tokens_out`.

**Acceptance criteria:**
- [x] `llamarIA` compila con la nueva firma; call sites (`responder`, `resumir`) actualizados.
- [x] `.md` con y sin tokens hace round-trip; `.md` viejo (sin las líneas) → `null`.
- [x] Provider sin `usage` → `uso: null`, nada rompe (scratch con SSE sin `usage`).
- [ ] **Alan (Chrome real):** `stream_options` no rompe Groq/OpenRouter/HuggingFace; el `.md`
      del globo guarda `tokens_in`/`tokens_out` tras una llamada real.

**Verificado:** `_scratch.mts` con 14 asserts (round-trip + `conRespuesta`) + 6 asserts (fetch
stub: Gemini `usageMetadata`, OpenAI-compat `usage` en chunk final, sin-usage → null).
`tsc`/`lint`/`build` verde.

**Files:** `ia.ts`, `intercambio.ts`, `FlowCanvas.tsx`. **Scope:** M.

### T12 — Contador de tokens gastados ✅ (decisiones F3-21)
**Hecho:** Cada turno IA del panel muestra, junto al nombre del proveedor,
`{fmtTokens(ic.tokensEntrada)} → {fmtTokens(ic.tokensSalida)} tok` (`title` con los números
exactos y qué es cada uno). Solo si ambos son `number` (el `.md` los tiene) — si no, nada.
Total de la rama: NO se hizo (marcado opcional; sería sumar sobre `intercambios`).

**Acceptance criteria:**
- [x] Muestra los números del `.md`; sin tokens → no muestra nada (verificado en el pane: 3er
      globo sin `tokens_*` no muestra "0").

**Verificado:** `tsc`/`lint`/`build` verde; pane con `.md` inyectado — 2 globos con tokens muestran
"1.2k → 400 tok" / "1.9k → 520 tok", el 3ro (sin tokens) no muestra nada.

**Dependencies:** T11. **Files:** `BranchTranscript.tsx`. **Scope:** S.

### T14 — Auto-scroll del `BranchTranscript` (pedido de Alan, 01-09)
**Descripción:** El panel lateral tiene "auto-scroll al último" pero NO sigue el texto que entra
mientras un globo streamea. Arreglar: mientras el último intercambio del camino está `pending`,
el panel scrollea al fondo en cada actualización de `respuesta` (mismo patrón que T3 en `MessageNode`).

**Acceptance criteria:**
- [ ] Con una respuesta larga en streaming, el panel se mantiene abajo siguiendo el texto.
- [ ] Si el usuario scrollea hacia arriba a mano, no lo forzamos abajo (respetar el scroll manual).

**Verification:** Chrome real con streaming.

**Dependencies:** None. **Files:** `BranchTranscript.tsx`. **Scope:** S.

### T15 — Respuestas que son un documento: copiar / guardar (pedido de Alan, 01-09)
**Spec: `tasks/T15-spec.md`.** Decisiones con Alan (02-09): solo el núcleo (copiar + guardar la
respuesta, en el panel; + copiar por bloque de código gateado al panel). Heurística de nombre de
archivo. Sin doc card. Sin tocar `systemPrompt`.

**Núcleo:**
- `src/model/exportar.ts` (nuevo): `nombreArchivoRespuesta(respuesta)` → `{ nombre, contenido,
  mime }` (fence único → interior + ext del lang; parece markdown → `.md`; si no → `.txt`; nombre
  del slug del 1er `# Título` o `respuesta`). `descargarTexto(nombre, contenido, mime)` (Blob + `<a download>`).
- `Markdown.tsx`: prop `conCopiar?`; con ella, `components.pre` envuelve cada bloque con un botón
  "⧉" (hover) que copia el código crudo (`extraerTextoCodigo(node)`).
- `BranchTranscript.tsx`: en el turno IA del último globo (junto a "↻ Rehacer"), "⧉ Copiar" +
  "⬇ Guardar" (solo con `respuesta` y sin `pending`); pasa `conCopiar` a su `<Markdown>`.

**Acceptance:** ✅ todas verificadas.
- [x] Guardar una respuesta `.md` baja el texto FUENTE (no el render) — el pane confirmó
      `readme-de-3maps.md` con el markdown crudo.
- [x] Copiar pone el texto fuente en el portapapeles, feedback "✓ Copiado".
- [x] El bloque ```` ```bash ```` del panel tiene su botón; el globo del canvas NO (0 botones).
- [x] `tsc`/`lint`/`build` verde; 14 asserts de `nombreArchivoRespuesta`.

**Files:** `src/model/exportar.ts` (nuevo), `Markdown.tsx`, `BranchTranscript.tsx`. **Scope:** S.
**Falta prueba de Alan**: copiar/pegar y descargar de verdad en Brave.

### T16 — Adjuntar archivos al mini-composer del panel (pedido de Alan, 01-09)
**Spec completa: `tasks/T16-spec.md`.** Decisiones con Alan (02-09): texto + imágenes + PDF; el
adjunto vive en el `.md` del intercambio; solo el mini-composer del panel; el texto de la
pregunta es obligatorio; tipo no soportado → rechazo + lista de tipos; badge de adjuntos en el
globo Y en el panel; topes 128 KB (texto) / 1 MB (bin) / 2 MB (intercambio); orden
texto → imágenes → PDF.

**T16a — texto punta a punta ✅ (decisiones F3-22)**
- `Adjunto` / `TipoAdjunto` + `Intercambio.adjuntos: Adjunto[]` (`intercambio.ts`).
- `.md`: `adjuntos: <JSON en 1 línea>` en el frontmatter (los `contenido` no tienen `\n` real
  tras `JSON.stringify` → no rompe el parser mínimo). JSON roto → `[]`, `.md` viejo → `[]`.
- `Mensaje.adjuntos?` (solo imagen/pdf, para los adaptadores en T16b/c). `armarContexto` pega los
  adjuntos de TEXTO al mensaje del usuario del intercambio actual, delimitados
  (`--- archivo adjunto: … ---`). **NO se re-mandan** cuando el globo es contexto de un hijo.
  `normalizar` preserva `.adjuntos`.
- `src/model/adjuntos.ts` (nuevo): `tipoDeArchivo`, `leerArchivo` (T16a: solo texto; img/pdf →
  aviso "pronto"), `pesoAdjunto`, `fmtBytes`, `iconoAdjunto`, `descargarAdjunto`, los topes.
- UI (`BranchTranscript`): dropzone en el mini-composer + `onPaste` + botón 📎 (`<input file>`
  oculto) + chips con ✕ + aviso ámbar. `onSubmit` → `(text, kind, adjuntos)`. Placeholder cambia
  con adjuntos. Chips en modo lectura en el turno "Vos" (descargan al click).
- `MessageNode`: badge "📎 N" en el header (`data.adjuntosN` desde `arbolAVista`).
- `compartir.ts`: si el árbol con adjuntos supera `MAX_BYTES_COMPARTIR` → error que menciona los
  adjuntos.
- **Verificado**: 25 asserts scratch (round-trip `.md`, folding de contexto, no-reenvío a hijos,
  helpers) + pane (drop→chip, rechazo de imagen y de archivo >128KB, envío crea globo con adjunto,
  persiste tras reload, badge en el canvas, chip lectura en el panel). `tsc`/`lint`/`build` verde.
- **Falta que Alan pruebe en Brave**: paste de una captura (rechaza, "solo texto"), ✕ para quitar
  un chip, descarga de un adjunto desde el panel.

**T16b — imágenes ✅ (decisiones F3-22b)**
- `comprimirImagen` (`adjuntos.ts`): `<canvas>`, achica a 1568px, re-encode JPEG q0.82 (baja a
  0.6 si sigue > 1MB), salvo PNG con transparencia → PNG. base64 sin prefijo.
- 3 adaptadores mapean `tipo:"imagen"` antes del texto (Claude `image` block / Gemini
  `inline_data` / OpenAI-compat `image_url` data-URI). Si el proveedor 400/415/422ea con
  imágenes → el error sugiere Gemini/Claude.
- `estimarTokens`: +1300 por imagen, +3000 por pdf.
- UI: `accept` suma png/jpeg/webp; chip con thumbnail 20px; turno "Vos" thumbnail 64px → lightbox
  (`verImagen`, overlay z-40, Esc cierra el lightbox antes que el panel).
- `eslint.config.mjs`: apaga `@next/next/no-img-element` (`next/image` no va con `output:export`).
- Verificado: 13 asserts scratch (estimarTokens, `armarContexto` imagen en `.adjuntos`, shaping
  Gemini/OpenAI-compat via fetch stub) + pane (2000px PNG → 1568px JPEG 87→29KB, transparencia
  queda PNG, envío persiste, thumbnail + lightbox). `tsc`/`lint`/`build` verde.
- **Falta prueba de Alan** (keys reales): imagen con Gemini/Claude/un modelo de visión de Groq;
  el aviso "sin visión"; pegar una captura de pantalla.

**T16c — PDF ✅ (decisiones F3-22c)**
- `leerArchivo` acepta PDF (base64 tal cual, tope 1MB). `multimediaDe(m)` = imágenes + PDF en
  Claude (bloque `document`) y Gemini (`inline_data` application/pdf). OpenAI-compat: el PDF NO se
  manda (solo el texto).
- `BranchTranscript` recibe `proveedorLeePdf` / `proveedorNombre` → línea ámbar "El PDF solo lo
  leen Gemini (gratis) o Claude — con {N} se va a ignorar" cuando el proveedor activo no es
  gemini/claude. **No bloquea el envío.**
- `estimarTokens` +3000/pdf.
- Verificado: 11 asserts scratch (round-trip, `multimediaDe`, Gemini `inline_data`, OpenAI-compat
  no-manda-pdf, `leerArchivo` pdf/tope) + pane (chip 📕, aviso con Groq, sin aviso con Gemini,
  envío persiste). `tsc`/`lint`/`build` verde.

**T16 completo (texto + imágenes + PDF).** Falta prueba de Alan con keys reales.

**Dependencies:** `BranchTranscript.tsx`, `contexto.ts`, `intercambio.ts`, `adjuntos.ts`,
`ia.ts` (T16b/c: mensajes multimodales). **Scope:** L.

### T13 — Heurística de LaTeX crudo
**Descripción:** En `normalizarMath` (`Markdown.tsx`): si una línea tiene `\frac{`, `\sqrt{`,
`\sum`, `\int`, `\text{`, etc. y NO tiene `$` ni está en un bloque de código, envolverla en `$…$`.
Falla típica de gpt-oss-120b (`\frac{a}{b}` entre paréntesis normales).

**Acceptance criteria:**
- [ ] `"El resultado es \\frac{a}{b} aprox"` → renderiza la fracción.
- [ ] Una línea que YA tiene `$...$` no se toca.
- [ ] Código (` ``` ` o indentado) no se toca.
- [ ] Un `\n` o `\t` literal en prosa normal no dispara la envoltura.

**Verification:** `_scratch.mts` con ~8 casos (positivos y negativos) por `renderToStaticMarkup`;
`tsc`/`lint`/`build`.

**Dependencies:** None. Adelantada a la **Fase 1**. **Files:** `Markdown.tsx`. **Scope:** S.

## Risks and Mitigations

| Risk | Impacto | Mitigación |
|---|---|---|
| El preview pane no corre animaciones/drag/streaming real | Alto para T2/T3/T6/T7/T8 | Verificar el **estado final** en el pane (clases, `maxHeight`, refs); el usuario prueba animación/inercia/drag en Chrome real (napkin §2-3). |
| `usage` no viene de todos los providers (free/proxy) | Medio (T11/T12) | `usage?` opcional; sin él, sin contador para ese globo. Nunca "0" falso. |
| Cambiar la firma de `llamarIA` toca muchos call sites | Medio (T11) | Hacer T11 aislada, con `tsc` como red; `resumir()` también usa `llamarIA`. |
| `stopNode` deja el globo en un estado raro (parcial + sin pending) al sincronizar | Medio (T1) | El `.md` ya soporta respuesta sin `pending`; el otro dispositivo lo ve como respuesta normal. Probar sync tras un STOP. |
| Reestructurar `SettingsPanel` (745 líneas) y romper algo | Medio (T4) | Solo mover JSX a 2 contenedores + un `useState` de tab; no tocar la lógica de `commit`/`verModelos`/`snap`. Diff review con `code-reviewer`. |
| La contra-escala de la manija (T6) desincroniza el cálculo del drag | Bajo | El `onResizeStart` ya divide por `zoom`; la escala visual es CSS aparte, no toca el cálculo. |

## Decisiones del usuario (01-09)

- **T2**: el lápiz va **como badge FUERA del globo** (no dentro del cuerpo). `<NodeToolbar>` o un
  absolute que sobresale del borde superior.
- **T9**: las flechas navegan **a todo** — hermanos (◀▶), subir al padre (▲), bajar al primer
  hijo (▼).
- **T4**: pestañas **"Lienzo" / "IA"**.
- **T13**: **adelantada a la Fase 1** (chica, independiente, destraba el render de gpt-oss).

## Open Questions (menores, decidir al diseñar)

- **T10/T12**: ¿los contadores van en el header del panel, al pie, o por-globo inline? Decidir con
  el diseño de T7.

## Backlog nuevo (pedidos de Alan 01-09, fuera del plan de 4 fases)

- **B1 — color por globo**: marcar la esquina sup-derecha del título con un color a elección.
  `Intercambio.color` → `.md` + frontmatter; picker desde el `NodeToolbar`. [S/M]
- **B2 — ventana de contexto adaptativa**: resumir más agresivo / ventana que se achica a medida
  que la rama crece. ❓ **Pregunta a responder primero**: ¿cuánto gasta el `resumir()` con keys
  gratuitas? Instrumentar y medir (relacionado con T11 `usage`). [investigar → M]
- **B3 — multi-select move + envión**: hoy al soltar una selección de varios globos, uno queda con
  envión (el que trackeó `useNodeInertia`). Decidir: sin envión de grupo (recomendado — no aporta,
  confunde) o envión parejo a todos. Toca `useNodeInertia` `onSelectionDrag*`. [S]
- **B4 — Setting "grosor de líneas"**: `Settings.edgeWidth` → CSS de `.react-flow__edge-path`
  (`stroke-width`). Slider en la pestaña "Lienzo". [S]
- **B5 — Setting "fuente" + "tamaño de texto"**: un puñado de fuentes conocidas (cargar en
  `layout.tsx` con `next/font`), `Settings.fontFamily` / `fontScale` → CSS var en `<html>`. [M]
- **B6 — marca 3maps en el mapa**: preparar el código para un fondo con el logo (un `<Background>`
  custom de React Flow, o un div de fondo con el SVG a opacidad baja, detrás del `<ReactFlow>`).
  Sugerir opciones cuando se llegue (watermark esquina vs. fondo tenue vs. logo en el header). [M]
- **B7 — zoom de lupa (hover)**: al pasar el mouse por un globo, se agranda para leerlo mejor.
  `Settings.hoverZoom` (on/off) en la pestaña "Lienzo". `transform: scale()` en `:hover` con
  `z-index` alto y origen centrado; que no interfiera con drag/selección ni empuje a los vecinos.
  [M]
