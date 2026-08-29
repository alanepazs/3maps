# Arquitectura del código

> Mapa de `src/` para no tener que leer todo. Actualizar cuando cambie la estructura.
> Última actualización: 29-08-2026 (fase 1, esqueleto visual).

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
  components/
    FlowCanvas.tsx      ★ El componente central (~350 líneas). Ver detalle abajo.
    MessageNode.tsx     Nodo custom de React Flow. Un globo = un intercambio.
    Composer.tsx        Barra inferior fija para escribir.
    SettingsPanel.tsx   Tuerquita ⚙️ arriba a la izquierda + panel de ajustes.
    settings.ts         Tipo Settings, DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY ("3maps:settings").
    nodeActions.ts       Context (NodeActionsContext) para que los nodos llamen deleteNode hacia arriba.
    inertia.ts           Física compartida del "envión": constantes + sampleVelocity / launchVelocity / runGlide.
    useNodeInertia.ts    Hook: envión al soltar un globo o una selección.
    usePanInertia.ts     Hook: envión al soltar el pan del lienzo (⚠ ver estado.md — sin verificar bien).
```

## FlowCanvas.tsx — el corazón

Estructura: `export default FlowCanvas()` = solo `<ReactFlowProvider><Flow/></ReactFlowProvider>`.
Toda la lógica vive en `Flow()`.

Estado / hooks clave:
- `useNodesState` / `useEdgesState` — nodos y edges (React Flow).
- `activeNodeId` (useState) — el globo "activo" desde el que se escribe. Se sincroniza con la
  selección vía `onSelectionChange`.
- `settings` (useState con lazy init desde `localStorage`, sin mismatch de hidratación porque el
  panel arranca cerrado). `updateSettings` persiste.
- `spaceHeld` (useState) — listener propio de keydown/keyup en `window` (guarda contra inputs y
  contra scroll de la página). Invierte el modo del lienzo.
- `nextId` (useRef) — contador de ids para globos nuevos.

Handlers:
- `handleSubmit(text, kind)` — crea UN globo `{ pregunta, respuesta: null, pending: true }`
  colgando del activo. `kind` "main" → abajo, `sourceHandle: "main"`; "branch" → derecha,
  `sourceHandle: "branch-right"`. El globo nuevo pasa a ser el activo.
- `finalizeBranchSide(nodeId)` — si un edge de rama quedó con el hijo a la izquierda del padre,
  cambia su `sourceHandle` a `branch-left` (o `branch-right`). Corre al soltar / al frenar el envión.
- `deleteNode(id)` (via NodeActionsContext) — BFS de descendientes, `window.confirm` si borra >1,
  filtra nodes+edges, deja activo al padre.
- Envión: `useNodeInertia(setNodes, finalizeBranchSide, settings.inertia)` devuelve
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

`initialNodes` / `initialEdges`: 3 globos de ejemplo (Raíz + hilo + una rama a la derecha).

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

## inertia.ts (física del envión)

- Constantes: `FLICK_THRESHOLD` 0.35 px/ms · `DECAY_PER_SEC` 0.004 · `STOP_SPEED` 0.03 ·
  `MAX_FRAME_MS` 40 · `MIN_SAMPLES` 3.
- `sampleVelocity(prev, x, y)` — EMA de velocidad (0.4 prev / 0.6 raw), cuenta muestras.
- `launchVelocity(sample, strength, maxSpeed)` — velocidad inicial del glide o `null` si no
  corresponde (poco movimiento, sin flick, NaN). Escala por `strength` (el slider de la tuerquita).
- `runGlide(vx, vy, apply, onDone)` — loop de `requestAnimationFrame` con decaimiento exponencial.
  `apply(dx, dy)` mueve lo que sea. Devuelve una función para cortar.

`useNodeInertia`: `MAX_SPEED` 2. `usePanInertia`: `MAX_SPEED` 4 + guarda contra gestos de zoom
(si el zoom cambia entre muestras, no lanza envión) y contra el re-loop de `onMove`.
