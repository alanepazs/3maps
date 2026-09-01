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
- [ ] **T10 — Contador de contexto (estimado) por globo y del árbol.** [M]
- [ ] **T11 — `llamarIA` devuelve `usage`; se guarda en el `.md`.** [M]
- [ ] **T12 — Contador de tokens gastados por globo (usa T11).** [S]
- [ ] **T14 — Auto-scroll del panel sigue el texto mientras streamea.** [S]
- [ ] **T15 — Respuestas que son un documento entero (`.md`/código): UX.** [investigar]
- [ ] **T16 — Drag & drop de archivos al mini-composer del panel.** [L — spec primero]
- [ ] **T13 — Heurística de LaTeX crudo en `normalizarMath`.** [S] (independiente; adelantable)

#### Checkpoint Fase 4
- [ ] `tsc` + `lint` + `build` verde; `_scratch.mts` de `normalizarMath` (T13) con asserts.
- [ ] En Chrome real: el panel distingue turnos, el STOP corta, las flechas navegan, los
      contadores muestran números plausibles, y `\frac{...}` suelto de gpt-oss ahora renderiza.

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

### T10 — Contador de contexto estimado
**Descripción:** Mostrar, por globo abierto en el panel y para el árbol/rama, una estimación de
tokens de contexto (`≈ chars/4`). Por globo = lo que `armarContexto` mandaría para ESE globo.

**Acceptance criteria:**
- [ ] Número plausible (comparar contra un conteo real de un caso conocido, ±20%).
- [ ] "≈" explícito (es estimación).
- [ ] No dispara la llamada real ni el resumen (solo lee el árbol).

**Verification:** `_scratch.mts`: `estimarTokens(armarContexto(...))` contra un caso a mano;
`tsc`/`lint`/`build`.

**Dependencies:** None. **Files:** `contexto.ts` (export `estimarTokens`), `BranchTranscript.tsx`.
**Scope:** M.

### T11 — `llamarIA` devuelve `usage`
**Descripción:** Cambiar la firma de `llamarIA` (y los 3 adaptadores) para devolver
`{ texto: string; usage?: { in: number; out: number } }`. Parsear el `usage` del último chunk SSE
(OpenAI-compat), `usageMetadata` (Gemini), `message.usage` (Claude). `FlowCanvas.responder` guarda
`usage` en el intercambio; `intercambio.ts` `toMarkdown`/`parseMarkdown` suman el campo.

**Acceptance criteria:**
- [ ] `llamarIA` compila con la nueva firma; todos los call sites actualizados (`responder`,
      `resumir`).
- [ ] Un `.md` con `usage` hace round-trip (`toMarkdown` → `parseMarkdown`).
- [ ] Un provider sin `usage` → `usage` undefined, nada rompe.

**Verification:** `_scratch.mts` para el round-trip del `.md`; `tsc`/`lint`/`build`; pane con SSE
mockeado que incluye `usage`.

**Dependencies:** None (pero es la más invasiva de la Fase 4). **Files:** `ia.ts`, `intercambio.ts`,
`FlowCanvas.tsx`, `contexto.ts` (firma de `resumir`). **Scope:** M.

### T12 — Contador de tokens gastados
**Descripción:** En el panel, por globo, mostrar `usage.in` / `usage.out` / total si el `.md` lo
tiene. Opcional: total de la rama.

**Acceptance criteria:**
- [ ] Muestra los números del `.md`; si no hay `usage`, no muestra nada (no "0").

**Verification:** `tsc`/`lint`/`build`; Chrome real con una llamada real que devuelve usage.

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

### T15 — Respuestas que son un documento entero (pedido de Alan, 01-09)
**Descripción:** Alan pidió a un globo un `.md` y el modelo devolvió texto suelto (no un archivo /
bloque). Investigar la UX correcta: (a) reforzar la instrucción de sistema para que devuelva el
documento en un fence ```` ```markdown ````; (b) en `MessageNode`/`Markdown`, un fence largo →
bloque plegable + botón "copiar" / "descargar .md"; (c) ¿un botón "guardar como archivo" a nivel
globo? Spec primero (decidir con Alan qué comportamiento).

**Acceptance criteria:** por definir en la spec.

**Dependencies:** puede tocar `settings.systemPrompt` default, `Markdown.tsx`, `MessageNode.tsx`.
**Scope:** investigar → S/M.

### T16 — Drag & drop de archivos al mini-composer del panel (pedido de Alan, 01-09)
**Descripción:** Poder arrastrar y soltar archivos dentro del chat lateral y que se sumen al
contexto de la próxima pregunta. Investigar alcance: ¿solo texto (`.md`, `.txt`, código) o también
imágenes? Los proveedores difieren mucho (Claude/Gemini/GPT tienen visión + file API; los
open-source vía proxy en general no). Límites de tamaño. Dónde vive el adjunto (¿en el `.md` del
intercambio? ¿efímero?). Spec + decisión de scope con Alan antes de implementar.

**Acceptance criteria:** por definir en la spec.

**Dependencies:** `BranchTranscript.tsx` (mini-composer), `contexto.ts`, `ia.ts` (mensajes multimodales),
`intercambio.ts` (persistir el adjunto). **Scope:** L — cortar en sub-tareas.

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
