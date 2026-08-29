# Arquitectura del código

> Mapa de `src/` para no tener que leer todo. Actualizar cuando cambie la estructura.
> Última actualización: 29-08-2026 (llamada real a la IA + deploy a GitHub Pages).

## Stack real (lo que está instalado)

- **Next.js 16.3.3** (App Router, Turbopack) + **React 19.2** + **TypeScript 5**
- **Tailwind CSS 4** (`@tailwindcss/postcss`, sin `tailwind.config` — config por CSS)
- **React Flow** `@xyflow/react` ^12.11.5 (con `@xyflow/system` 0.0.81 pinneado)
- **`@anthropic-ai/sdk`** — se importa **dinámicamente** dentro de `model/ia.ts` (solo se baja
  cuando el usuario dispara una llamada; no pesa en la carga inicial).
- **`react-markdown` + `remark-gfm`** — render de las respuestas de la IA (`components/Markdown.tsx`).
- Sin backend, sin `transformers.js` todavía (fase 1). Deploy: **GitHub Pages** (`output: "export"`).

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
                         fuera de la ventana.
    ia.ts                llamarIA(config, mensajes, opts) → string. Punto único; switch(proveedor).
                         Adaptadores: Claude (@anthropic-ai/sdk dinámico) y Gemini (fetch + SSE).
                         Ambos con streaming vía opts.onTexto. resumir() para el resumen de
                         contexto. ErrorIA con mensajes ya legibles.
    configIA.ts          cargar/guardarConfigIA en localStorage ("3maps:ia"). No persiste sin API
                         key. Aparte de "3maps:settings" porque es sensible.
  components/
    FlowCanvas.tsx      ★ El componente central (~500 líneas). Ver detalle abajo.
    MessageNode.tsx     Nodo custom. Estados del cuerpo: pending ("escribiendo…" + texto + ▍),
                        error (recuadro rojo + "↻ Reintentar"), respuesta (markdown), o vacío.
    Markdown.tsx        <Markdown>{texto}</Markdown> — react-markdown + remark-gfm con estilos
                        compactos para el globo (código y tablas con scroll horizontal propio;
                        links con target=_blank). Sin HTML crudo → seguro.
    Composer.tsx        Barra inferior fija para escribir.
    SettingsPanel.tsx   Tuerquita ⚙️: ajustes del lienzo (envión, ventana de contexto) +
                        config de IA (proveedor, API key, modelo). Campos sin estado local:
                        se leen de la prop `configIA` y persisten en cada cambio.
    settings.ts         Settings = {inertia, ventanaContexto}. DEFAULT_SETTINGS, storage key.
    nodeActions.ts       NodeActionsContext: deleteNode + retryNode (hacia FlowCanvas).
    inertia.ts           Física compartida del "envión": constantes + sampleVelocity / launchVelocity / runGlide.
    useNodeInertia.ts    Hook: envión al soltar un globo o una selección.
    usePanInertia.ts     Hook: envión al soltar el pan del lienzo.

.github/workflows/deploy.yml   Build estático (NEXT_PUBLIC_PAGES=1 → basePath /3maps) + deploy a
                               GitHub Pages en cada push a main.
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
- `handleSubmit(text, kind)` — arma el árbol nuevo con `agregar(crearIntercambio({..., pending:true}))`
  colgando del activo, lo setea, y llama `responder(id, arbolNuevo)`. `kind` "main" → rama "main",
  abajo; "branch" → rama "branch-right", a la derecha.
- `responder(nodeId, arbolBase)` — **la llamada a la IA**. Si no hay API key → `conError`. Si no:
  `conRespuesta({pending:true})` + limpia error; arma el contexto con `armarContexto` (tratando a
  `nodeId` como pendiente, así un reintento descarta la respuesta parcial vieja); si el camino
  supera la ventana, genera/cachea el `resumenViejo` con `resumir`; `llamarIA` con `onTexto`
  throttleado a 80ms → `conRespuesta({respuesta: acc, pending:true})` (streaming); al terminar
  `conRespuesta({pending:false, proveedor})`; en error `conError`. `enVueloRef` (Map<id,
  AbortController>) para cancelar. `arbolRef` espeja `arbol` para leerlo en callbacks async.
- `retryNode(id)` — `responder(id, arbolRef.current)`. Via NodeActionsContext.
- `asentar(id)` — escribe la posición final al árbol (`conPosicion`) y, si es rama, fija el lado
  (`conRama`) según dónde quedó respecto del padre. Es el `onSettle` de `useNodeInertia`.
- `deleteNode(id)` (via NodeActionsContext) — `descendientes` para el conteo, `window.confirm` si
  borra >1, aborta las llamadas en vuelo de lo que se borra, `quitarSubarbol`, deja activo al padre.
- `onConnect` — conectar handles a mano = `reparentar` el target (con guarda anti-ciclo).

Config de IA: `configIA` (useState, lazy init desde `cargarConfigIA()`), `updateConfigIA` persiste.
Puede tener `apiKey: ""` en memoria (para editar el modelo antes de la key); `configIA.ts` no lo
persiste sin key. `resumenCacheRef` (Map) cachea resúmenes del tramo viejo por sesión.
- Envión: `useNodeInertia(setNodes, asentar, settings.inertia)` devuelve
  `onNodeDragStart/Drag/Stop` + `onSelectionDrag*` + `cancelInertia`.
  `usePanInertia(setViewport, getViewport, settings.inertia)` devuelve `onMoveStart/Move/MoveEnd`.

Props de `<ReactFlow>` que importan:
- `panOnDrag={!spaceHeld}` / `selectionOnDrag={spaceHeld}` — sin teclas = manito (pan);
  espacio = puntero (recuadro de selección). `selectionMode={SelectionMode.Partial}`.
- `selectionKeyCode={null}` y `panActivationKeyCode={null}` — se maneja todo con `spaceHeld`.
- `deleteKeyCode={null}` — borrar es solo por el botón 🗑 (pasa por `deleteNode`).
- `nodeDragThreshold={3}` — para que rozar un globo no dispare un arrastre.
- `colorMode="dark"`, `fitView` (+ un `fitView()` extra tras cargar el árbol guardado).
- `devIndicators.position = "bottom-right"` (next.config) para no tapar la tuerquita.
- `agentRules: false` (next.config) para que `next dev` no escriba en CLAUDE.md.

## IA (model/ia.ts)

- `ConfigIA = { proveedor, apiKey, modelo }`. `PROVEEDORES_DISPONIBLES = ["claude", "gemini"]`
  (`deepseek`/`gpt` declarados en el tipo pero sin adaptador). `MODELO_POR_DEFECTO`,
  `MODELOS_SUGERIDOS`, `NOMBRE_PROVEEDOR`, `PISTA_API_KEY` por proveedor.
- `llamarIA(config, mensajes, opts)` → `switch(config.proveedor)`. Sumar proveedor = un `case`
  nuevo, sin tocar nada del árbol (spec §6). `resumir()` usa el mismo proveedor configurado.
- La API key va **directo del navegador al proveedor**, nunca a un servidor de 3maps.
- **Adaptador Claude** (`llamarClaude`): `await import("@anthropic-ai/sdk")` (dinámico),
  `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })`, `client.messages.stream(...)` con
  `signal`. CORS habilitado por el header `anthropic-dangerous-direct-browser-access` del SDK.
  Default `claude-haiku-4-5`.
- **Adaptador Gemini** (`llamarGemini`): **`fetch` directo** (sin SDK), a
  `generativelanguage.googleapis.com/v1beta/models/{modelo}:streamGenerateContent?alt=sse` con
  header `x-goog-api-key`. Mensajes → `contents:[{role:"user"|"model", parts:[{text}]}]`. Parser
  SSE propio (líneas `data: {json}`), acumula `candidates[0].content.parts[].text`. `finishReason`
  SAFETY / `promptFeedback.blockReason` → error de seguridad. CORS de Gemini **anda desde el
  navegador** (verificado: key trucha → 400 real, no bloqueo CORS). Tiene free tier. Default
  `gemini-2.0-flash`.
- `mensajeLegible` mapea status/errores → texto legible (usado por ambos adaptadores).

## Deploy (next.config.ts + .github/workflows/deploy.yml)

- `output: "export"` → `next build` genera `out/` (estático puro; todo el canvas y la llamada a la
  IA corren client-side).
- `basePath: "/3maps"` **solo** cuando `NEXT_PUBLIC_PAGES === "1"` (lo setea el workflow). En
  `next dev` local la app queda en la raíz.
- El workflow: `npm ci` → `npm run build` (con el env) → `touch out/.nojekyll` →
  `upload-pages-artifact` → `deploy-pages`. Corre en cada push a `main`.
- URL: `https://alanepazs.github.io/3maps/`. Requiere una vez: repo → Settings → Pages → Source =
  "GitHub Actions".

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
