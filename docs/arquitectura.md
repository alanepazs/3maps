# Arquitectura del código

> Mapa de `src/` para no tener que leer todo. Actualizar cuando cambie la estructura.
> Última actualización: 29-08-2026 (modelo de datos: árbol de intercambios + `.md`).

## Stack real (lo que está instalado)

- **Next.js 16.3.3** (App Router, Turbopack) + **React 19.2** + **TypeScript 5**
- **Tailwind CSS 4** (`@tailwindcss/postcss`, sin `tailwind.config` — config por CSS)
- **React Flow** `@xyflow/react` ^12.11.5 (con `@xyflow/system` 0.0.81 pinneado)
- Sin backend, sin librerías de IA, sin `transformers.js` todavía (fase 1).

## Árbol de archivos

```
src/
  app/
    layout.tsx      Root layout. metadata.title = "3maps". <html> con suppressHydrationWarning
                    (por Darkreader). body flex-col, main h-screen.
    page.tsx        Renderiza <FlowCanvas /> dentro de <main class="h-screen w-screen">.
    globals.css     Tailwind + tokens de color que siguen prefers-color-scheme (dark por defecto
                    en el SO del usuario).
  model/
    intercambio.ts       ★ Modelo de datos (fuente de la verdad). Tipos Intercambio/Arbol/Rama/
                         Proveedor. Funciones puras: consultas (buscar, hijos, descendientes,
                         caminoRaizA, padre, raices), mutaciones (agregar, quitarSubarbol,
                         conPosicion, conRama, conRespuesta, reparentar), arbolAVista (deriva
                         nodes/edges de React Flow), toMarkdown / parseMarkdown, arbolInicial
                         (semilla de ejemplo).
    persistencia.ts      guardarArbol / cargarArbol en localStorage ("3maps:arbol"), guardando
                         un string .md por intercambio. Cae a arbolInicial() si no hay nada.
    contexto.ts          armarContexto(arbol, nodoId, opts, resumenViejo) → Mensaje[] para la IA:
                         SOLO el camino raíz→nodo, aplanado a user/assistant, con ventana (últimos
                         N completos + resumen del tramo viejo). Secuencia válida para la API
                         (arranca en user, sin roles repetidos). tramoAResumir = los intercambios
                         fuera de la ventana. Todavía sin usar (lo llama #3, la llamada a la IA).
  components/
    FlowCanvas.tsx      ★ El componente central (~370 líneas). Ver detalle abajo.
    MessageNode.tsx     Nodo custom de React Flow. Un globo = un intercambio.
    Composer.tsx        Barra inferior fija para escribir.
    SettingsPanel.tsx   Tuerquita ⚙️ arriba a la izquierda + panel de ajustes.
    settings.ts         Tipo Settings, DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY ("3maps:settings").
    nodeActions.ts       Context (NodeActionsContext) para que los nodos llamen deleteNode hacia arriba.
    inertia.ts           Física compartida del "envión": constantes + sampleVelocity / launchVelocity / runGlide.
    useNodeInertia.ts    Hook: envión al soltar un globo o una selección.
    usePanInertia.ts     Hook: envión al soltar el pan del lienzo.
```

## FlowCanvas.tsx — el corazón

Estructura: `export default FlowCanvas()` = solo `<ReactFlowProvider><Flow/></ReactFlowProvider>`.
Toda la lógica vive en `Flow()`.

### Flujo de datos (importante)

**El `arbol` (useState<Arbol>) es la fuente de la verdad.** Los `nodes`/`edges` de React Flow
son una **vista derivada** (`arbolAVista`). Nunca al revés.

- `arbol` arranca en la **semilla** (`arbolInicial()`), determinística → el primer render coincide
  server/cliente. Un `useEffect` de montaje llama `cargarArbol()` y cambia al árbol persistido
  (patrón local-first en SSR; el `setState` en effect es a propósito, corre una vez). `listo`
  (useState) marca que ya se cargó: hasta entonces no se persiste ni se reconcilia la vista.
- `firma` (useMemo) = JSON del árbol **sin `x`/`y`**. Un `useEffect([firma, listo])` reconstruye
  `nodes`/`edges` cuando cambia contenido o estructura — NO al mover un globo. Reconcilia
  **preservando identidad**: los nodos sin cambios mantienen su objeto (y su posición viva), así
  React Flow no los re-mide (evita el parpadeo / `visibility:hidden`).
- Las **posiciones** vuelven al árbol al soltar / frenar el envión (`asentar`), no en cada frame.
- `guardarArbol(arbol)` se llama en cada cambio del árbol (una vez `listo`).
- `seleccionarLuegoRef` — id a seleccionar tras la próxima reconstrucción (globo nuevo, o el
  padre tras un borrado). El effect de `firma` lo consume.

Estado / hooks clave:
- `arbol` / `listo` / `seleccionarLuegoRef` — ver arriba.
- `useNodesState` / `useEdgesState` — la vista de React Flow (derivada del árbol).
- `activeNodeId` (useState) — el globo "activo" desde el que se escribe. Se sincroniza con la
  selección vía `onSelectionChange`. `activeNode` sale de `buscar(arbol, activeNodeId)`.
- `settings` (useState con lazy init desde `localStorage`, sin mismatch de hidratación porque el
  panel arranca cerrado). `updateSettings` persiste.
- `spaceHeld` (useState) — listener propio de keydown/keyup en `window`. Invierte el modo del lienzo.

Handlers (todos operan sobre `arbol` vía `setArbol`):
- `handleSubmit(text, kind)` — `agregar` un `crearIntercambio(...)` colgando del activo. `kind`
  "main" → rama "main", abajo; "branch" → rama "branch-right", a la derecha. El globo nuevo pasa
  a ser el activo (`seleccionarLuegoRef`).
- `asentar(id)` — escribe la posición final al árbol (`conPosicion`) y, si es rama, fija el lado
  (`conRama`) según dónde quedó respecto del padre. Es el `onSettle` de `useNodeInertia`.
- `deleteNode(id)` (via NodeActionsContext) — `descendientes` para el conteo, `window.confirm` si
  borra >1, `quitarSubarbol`, deja activo al padre.
- `onConnect` — conectar handles a mano = `reparentar` el target (con guarda anti-ciclo).
- Envión: `useNodeInertia(setNodes, asentar, settings.inertia)` devuelve
  `onNodeDragStart/Drag/Stop` + `onSelectionDrag*` + `cancelInertia`.
  `usePanInertia(setViewport, getViewport, settings.inertia)` devuelve `onMoveStart/Move/MoveEnd`.

Props de `<ReactFlow>` que importan:
- `panOnDrag={!spaceHeld}` / `selectionOnDrag={spaceHeld}` — sin teclas = manito (pan);
  espacio = puntero (recuadro de selección). `selectionMode={SelectionMode.Partial}`.
- `selectionKeyCode={null}` y `panActivationKeyCode={null}` — se maneja todo con `spaceHeld`.
- `nodeDragThreshold={3}` — para que rozar un globo no dispare un arrastre.
- `colorMode="dark"`, `fitView`.
- `devIndicators.position = "bottom-right"` (next.config) para no tapar la tuerquita.
- `agentRules: false` (next.config) para que `next dev` no escriba en CLAUDE.md.

Semilla (`arbolInicial()` en `model/intercambio.ts`): 3 intercambios de ejemplo con ids fijos
`nodo-ejemplo-*` (Raíz + hilo + una rama a la derecha).

## MessageNode.tsx

`data`: `{ pregunta, respuesta, pending?, isRoot? }`.
- Render: encabezado con la pregunta (si hay) + cuerpo con la respuesta (o "Respuesta pendiente
  (IA no conectada)" en gris itálica si `respuesta` es null). Ancho fijo `w-[260px]`.
- Handles: `target` arriba (el raíz NO lo tiene) · `source id="main"` abajo ·
  `source id="branch-right"` derecha · `source id="branch-left"` izquierda.
- `<NodeToolbar>` con botón "🗑 Eliminar" visible solo cuando `selected` y `!isRoot`.
  Llama `deleteNode(id)` del `NodeActionsContext`.
- Anillo celeste (`ring-sky-400`) cuando `selected`.

## Composer.tsx

Barra `absolute inset-x-0 bottom-0`. Props: `activeNodeLabel` (la pregunta del activo),
`onSubmit(text, "main"|"branch")`.
- `Enter` → submit("main"). `Shift+Enter` → salto de línea (default del textarea).
- Botones "⑂ Ramificar" y "↓ Continuar hilo". Deshabilitados si no hay activo o el texto está vacío.

## model/intercambio.ts (modelo de datos)

`Intercambio` = `{ id, padreId, rama, x, y, proveedor, fecha, pregunta, respuesta, pending }`.
`Arbol` = `{ intercambios: Intercambio[] }`. Coincide con el frontmatter del `.md` (spec §3).
- `rama`: `"main"` (tronco, por abajo) | `"branch-left"` | `"branch-right"` (costado). Los ids de
  los handles del `MessageNode` se llaman igual → `arbolAVista` hace `sourceHandle: ic.rama`.
- `nuevoId()` → `"nodo-" + 8 hex` (crypto). `crearIntercambio` acepta `id`/`fecha` opcionales
  (la semilla los pasa fijos → determinística para SSR).
- Todas las funciones son **puras**: las mutaciones devuelven un `Arbol` nuevo.
- `caminoRaizA(arbol, id)` → intercambios de la raíz al nodo. Con guarda anti-ciclo.
- `toMarkdown` / `parseMarkdown` — `---` frontmatter (`key: value`, parser mínimo sin YAML) +
  `## Pregunta` / `## Respuesta`. `padre_id` / `proveedor` vacíos → `null`.

## model/persistencia.ts

`localStorage["3maps:arbol"]` = `{ [id]: "<string .md>" }` (un archivo por intercambio, igual que
va a ser el export a disco — spec §7). `guardarArbol` serializa todo; `cargarArbol` parsea y cae
a `arbolInicial()` si no hay nada o falla el parseo. El `.zip` / carpetas reales queda pendiente.

## model/contexto.ts (armado del contexto para la IA)

`Mensaje` = `{ rol: "user" | "assistant", texto }`.

`armarContexto(arbol, nodoId, opts?, resumenViejo?)` → `Mensaje[]`:
- **Solo el camino raíz→`nodoId`** (`caminoRaizA`), nunca el árbol entero (invariante CLAUDE.md).
- Cada intercambio se aplana: pregunta no vacía → `user`, respuesta no vacía → `assistant`.
- **Ventana** (`opts.ventana`, default 6): los últimos N intercambios van completos; el tramo
  anterior se reemplaza por `resumenViejo` (un `user` con el resumen + un `assistant` "Listo…").
  Si `resumenViejo` es `null` (fase 1, sin IA que resuma), ese tramo va completo igual.
- `normalizar`: arranca en `user` (si la raíz tiene pregunta vacía, mete un `user` placeholder) y
  concatena mensajes seguidos del mismo rol → secuencia siempre válida para la API.
- Si `nodoId` es un intercambio **pendiente**, su pregunta queda de último `user` → listo para
  mandar sin agregar nada.
- **Determinístico** para un `(camino, opts, resumen)` dado, y el prefijo solo crece al final →
  aprovecha el prompt caching del proveedor (spec §5).

`tramoAResumir(arbol, nodoId, opts?)` → los `Intercambio[]` fuera de la ventana (lo que habría
que resumir). Lo usará la lógica de resumen de #3.

Verificado con 22 asserts (script scratch, borrado). Todavía **sin usar** — lo llama #3.

## inertia.ts (física del envión)

- Constantes: `FLICK_THRESHOLD` 0.35 px/ms · `DECAY_PER_SEC` 0.004 · `STOP_SPEED` 0.03 ·
  `MAX_FRAME_MS` 40 · `MIN_SAMPLES` 3.
- `sampleVelocity(prev, x, y)` — EMA de velocidad (0.4 prev / 0.6 raw), cuenta muestras.
- `launchVelocity(sample, strength, maxSpeed)` — velocidad inicial del glide o `null` si no
  corresponde (poco movimiento, sin flick, NaN). Escala por `strength` (el slider de la tuerquita).
- `runGlide(vx, vy, apply, onDone)` — loop de `requestAnimationFrame` con decaimiento exponencial.
  `apply(dx, dy)` mueve lo que sea. Devuelve una función para cortar.

`useNodeInertia`: `MAX_SPEED` 2, `onSettle` = `asentar` (persiste posición + lado de la rama).
`usePanInertia`: `MAX_SPEED` 4 + guarda contra gestos de zoom + flag `applyingRef` (el glide
llama `setViewport`, que React Flow traduce a un `d3-zoom.transform()` que dispara `start`
reentrante — sin el flag el envión se cortaba en el primer frame).
