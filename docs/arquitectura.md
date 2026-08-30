# Arquitectura del código

> Mapa de `src/` para no tener que leer todo. Actualizar cuando cambie la estructura.
> Última actualización: 29-08-2026 (fase 2.0/2.3: Supabase opcional + compartir por link).

## Stack real (lo que está instalado)

- **Next.js 16.3.3** (App Router, Turbopack) + **React 19.2** + **TypeScript 5**
- **Tailwind CSS 4** (`@tailwindcss/postcss`, sin `tailwind.config` — config por CSS)
- **React Flow** `@xyflow/react` ^12.11.5 (con `@xyflow/system` 0.0.81 pinneado)
- **`@anthropic-ai/sdk`** — se importa **dinámicamente** dentro de `model/ia.ts` (solo se baja
  cuando el usuario dispara una llamada; no pesa en la carga inicial).
- **`react-markdown` + `remark-gfm`** — render de las respuestas de la IA (`components/Markdown.tsx`).
- **`@supabase/supabase-js`** — backend **opcional** (fase 2). Sin las env `NEXT_PUBLIC_SUPABASE_*`,
  `getSupabase()` → null y la app sigue 100% local. Sin `transformers.js` todavía.
- **Edge function** `supabase/functions/ia-proxy` (Deno) — proxy stateless para DeepSeek/GPT
  (no habilitan CORS). Se deploya aparte con la CLI de Supabase, no por el workflow de Pages.
- Deploy de la web: **GitHub Pages** (`output: "export"`).

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
                         (= { intercambios: [] }, árbol vacío — el 1er submit crea la raíz).
    persistencia.ts      guardarArbol / cargarArbol en localStorage ("3maps:arbol"), guardando
                         un string .md por intercambio. Cae a arbolInicial() si no hay nada.
    contexto.ts          armarContexto(arbol, nodoId, opts, resumenViejo, relevantes) → Mensaje[]:
                         SOLO el camino raíz→nodo, aplanado a user/assistant, con ventana (últimos
                         N completos + resumen del tramo viejo). `relevantes` = intercambios viejos
                         rescatados textuales JUSTO antes de la pregunta (no parte el prefijo).
                         tramoAResumir = fuera de la ventana. intercambiosRelevantes(viejos,
                         pregunta) = match por raíz de palabra + peso por rareza (fase 2.5 liviana).
    ia.ts                llamarIA(config, mensajes, opts) → string. Punto único; switch(proveedor).
                         Adaptadores: Claude (@anthropic-ai/sdk dinámico), Gemini (fetch + SSE), y
                         DeepSeek/GPT vía llamarOpenAICompat (contra el edge function ia-proxy;
                         SSE estilo OpenAI). Streaming vía opts.onTexto. opts.usarProxy gatea
                         deepseek/gpt (si false → ErrorIA explicativo). resumir(). listarModelos
                         (Claude client.models.list(), Gemini GET /v1beta/models, deepseek/gpt via
                         proxy GET /models). PROVEEDORES_DISPONIBLES = 4; PROVEEDORES_VIA_PROXY =
                         [deepseek, gpt]. ErrorIA con mensajes legibles.
    configIA.ts          localStorage "3maps:ia" = { activo, keys: {[proveedor]:{apiKey,modelo}} } —
                         UNA key por proveedor (cambiar y volver no la pierde). cargarConfigIA()
                         (siempre devuelve ConfigIA, default gemini), guardarConfigIA(c),
                         cambiarProveedorActivo(p), borrarKeyProveedor(p), configGuardadaDe(p).
                         Migra el formato viejo. Aparte de "3maps:settings" porque es sensible.
    supabase.ts          getSupabase() → SupabaseClient | null (null si no hay env). haySupabase()
                         para mostrar/ocultar UI. proxyIAUrl() = <supabaseUrl>/functions/v1/ia-proxy.
                         auth con persistSession/detectSessionInUrl true (fase 2.2, magic link).
    sync.ts              Sync del árbol de trabajo entre dispositivos (fase 2.4, solo con sesión).
                         Bucket privado sync/<uid>/arbol.json (formato .md-por-intercambio).
                         planInicial(arbolLocal, uid) decide subir/traer/nada. subirArbolNube /
                         bajarArbolNube / metaNube (lee updated_at del SERVIDOR via storage.list).
                         localStorage "3maps:sync" = { at, hash }. LWW por hora del servidor
                         (decisiones F2-8).
    compartir.ts         compartirArbol(arbol, titulo) → sube arboles/<slug>.json a Storage (mismo
                         formato que persistencia.ts), devuelve {slug, url}, y si hay sesión hace
                         insert en shared_trees (soft-fail). cargarArbolCompartido(slug) lo baja y
                         reconstruye. misArbolesCompartidos() (RLS filtra a las tuyas) /
                         despublicarArbol(slug) (borra Storage + fila). slugDeLaUrl /
                         limpiarSlugDeLaUrl / linkCompartir. Topes: 50 intercambios / ~1 MB.
  components/
    FlowCanvas.tsx      ★ El componente central (~500 líneas). Ver detalle abajo.
    MessageNode.tsx     Nodo custom. Estados del cuerpo: pending ("escribiendo…" + texto + ▍),
                        error (recuadro rojo + "↻ Reintentar"), respuesta (markdown), o vacío.
    Markdown.tsx        <Markdown>{texto}</Markdown> — react-markdown + remark-gfm con estilos
                        compactos para el globo (código y tablas con scroll horizontal propio;
                        links con target=_blank). Sin HTML crudo → seguro.
    BranchTranscript.tsx  Panel lateral read-only: la rama raíz→globo (`caminoRaizA`) aplanada a
                        Q/A tipo chat. Vista derivada, sin estado propio. Se abre con doble-click
                        en un globo o el botón ⤢; cierra con Esc / ✕ / click en el fondo. Botón ⇄
                        en el header cambia el lado (izq/der) → `settings.transcriptSide`.
                        Props: {intercambios, side, onFlipSide, onClose}.
    SharedBanner.tsx    Cartel arriba cuando se ve un árbol compartido (`?compartir=`). Props:
                        {titulo, onGuardar, onSalir}. "Guardar en mi 3maps" = pasa a local editable.
    useSesion.ts        Hook de auth (fase 2.2): {usuario, cargando, signInWithGoogle,
                        enviarMagicLink, cerrarSesion}. onAuthStateChange + getUser. Google OAuth
                        (principal) o magic link. Sin Supabase → usuario null, cargando false.
    useSync.ts          Hook de sync (fase 2.4): sync inicial al loguear (traer si la nube es más
                        nueva, si no subir), push con debounce 1.5s + flush en pagehide. Devuelve
                        EstadoSync ("off"|"sincronizando"|"ok"|"error"). No corre en modo compartido.
    Composer.tsx        Barra inferior fija para escribir.
    SettingsPanel.tsx   Tuerquita ⚙️: ajustes del lienzo (envión, ventana de contexto) +
                        config de IA. API key y modelo son BORRADORES (estado local) que se
                        persisten con el botón "Guardar" (o Enter); el proveedor aplica al toque y
                        TRAE la key guardada de ese proveedor (una por proveedor, ver configIA.ts).
                        "✓ Guardado" / "Cambios sin guardar" /
                        "✓ Aplicado" (2s tras guardar) / "Borrar key". Aviso ámbar bajo el input
                        si el formato de la key no pinta del proveedor (avisoFormatoKey, local).
                        Botón "verificar key y ver sus modelos" → listarModelos() (gratis, no gasta
                        tokens; 401 si la key es inválida) → chips clickeables + datalist. Aplica a
                        Claude y Gemini; commit() lo dispara al guardar.
                        Textarea "instrucción de sistema" → onChange({systemPrompt}) directo.
    settings.ts         Settings = {inertia, ventanaContexto, systemPrompt, transcriptSide,
                        usarProxyIA}. DEFAULT_SETTINGS, storage key. systemPrompt "" = ninguna;
                        se antepone a la respuesta, no al resumen. transcriptSide "left"|"right"
                        (default "right"). usarProxyIA = opt-in para DeepSeek/GPT (default false).
    nodeActions.ts       NodeActionsContext: deleteNode + retryNode + openNode + readOnly (hacia
                         FlowCanvas). readOnly=true (árbol compartido) esconde Eliminar/Reintentar.
    inertia.ts           Física compartida del "envión": constantes + sampleVelocity / launchVelocity / runGlide.
    useNodeInertia.ts    Hook: envión al soltar un globo o una selección.
    usePanInertia.ts     Hook: envión al soltar el pan del lienzo.

.github/workflows/deploy.yml   Build estático (NEXT_PUBLIC_PAGES=1 → basePath /3maps) + deploy a
                               GitHub Pages en cada push a main. Inyecta NEXT_PUBLIC_SUPABASE_*
                               desde repo secrets.

supabase/
  config.toml                  project_id + [functions.ia-proxy] verify_jwt=false.
  schema.sql                    bucket `arboles` + RLS (incl. delete dueño-solo) + tabla
                               `shared_trees` + bucket privado `sync` (RLS por carpeta `<uid>/`,
                               fase 2.4). Lo corre el usuario.
  functions/ia-proxy/index.ts   Edge function Deno. Proxy stateless para DeepSeek/GPT: reenvía a
                               api.openai.com / api.deepseek.com con x-ia-key, agrega CORS, pipe
                               del stream. Sin logs, sin storage. Se deploya con `supabase
                               functions deploy ia-proxy`.
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
- `guardarArbol(arbol)` se llama en cada cambio del árbol (una vez `listo`) **salvo en modo
  compartido** (`readOnly`): el árbol es de otro, no se persiste.
- `seleccionarLuegoRef` — id a seleccionar tras la próxima reconstrucción (globo nuevo, o el
  padre tras un borrado). El effect de `firma` lo consume.

Modo compartido (fase 2.3):
- `slugInicial` (useMemo, una vez) = `slugDeLaUrl()`. Si hay slug, el effect de hidratación baja
  el árbol con `cargarArbolCompartido` en vez de leer `localStorage`; si el link está roto,
  `limpiarSlugDeLaUrl()` + cae al árbol local.
- `compartido` (useState `{titulo} | null`). `readOnly = compartido !== null` → se propaga por
  `NodeActionsContext`, oculta el `<Composer>`, y `handleSubmit`/`deleteNode`/`retryNode` son no-op.
- `<SharedBanner>`: "Guardar en mi 3maps" (`guardarArbol` + `limpiarSlugDeLaUrl` + `setCompartido(null)`)
  / "Salir" (`limpiarSlugDeLaUrl` + `location.reload()`).
- `compartir(titulo)` → `compartirArbol(arbolRef.current, titulo)`, pasado a `<SettingsPanel>`
  como `onCompartir` solo si `haySupabase() && !readOnly`.

Estado / hooks clave:
- `arbol` / `listo` / `seleccionarLuegoRef` — ver arriba.
- `useNodesState` / `useEdgesState` — la vista de React Flow (derivada del árbol).
- `activeNodeId` (useState) — el globo "activo" desde el que se escribe. Se sincroniza con la
  selección vía `onSelectionChange`. `activeNode` sale de `buscar(arbol, activeNodeId)`.
- `settings` (useState con lazy init desde `localStorage`, sin mismatch de hidratación porque el
  panel arranca cerrado). `updateSettings` persiste.
- `spaceHeld` (useState) — listener propio de keydown/keyup en `window`. Invierte el modo del lienzo.

Handlers (todos operan sobre `arbol` vía `setArbol`):
- `handleSubmit(text, kind)` — si el árbol está vacío, el globo es la raíz; si no, cuelga del
  activo. `agregar(crearIntercambio({..., pending:true}))`, lo setea, llama `responder(id, arbolNuevo)`.
  `kind` "main" → rama "main", abajo; "branch" → rama "branch-right", a la derecha.
- `responder(nodeId, arbolBase)` — **la llamada a la IA**. Si no hay API key → `conError`. Si no:
  `conRespuesta({pending:true})` + limpia error; arma el contexto con `armarContexto` (tratando a
  `nodeId` como pendiente, así un reintento descarta la respuesta parcial vieja); si el camino
  supera la ventana, genera/cachea el `resumenViejo` con `resumir` (sin `systemPrompt`) + calcula
  `intercambiosRelevantes` (rescate por palabras clave, fase 2.5); `llamarIA`
  con `opts.sistema = settings.systemPrompt`, `opts.usarProxy = settings.usarProxyIA`, y `onTexto`
  throttleado a 80ms → `conRespuesta({respuesta: acc, pending:true})` (streaming); al terminar
  `conRespuesta({pending:false, proveedor})`; en error `conError`. `enVueloRef` (Map<id,
  AbortController>) para cancelar. `arbolRef` espeja `arbol` para leerlo en callbacks async.
- `retryNode(id)` — `responder(id, arbolRef.current)`. Via NodeActionsContext.
- `openNode(id)` — setea `transcriptNodeId`; `<BranchTranscript>` se renderiza con
  `caminoRaizA(arbol, transcriptNodeId)`. También lo dispara `onNodeDoubleClick`. Via NodeActionsContext.
- `asentar(id)` — escribe la posición final al árbol (`conPosicion`) y, si es rama, fija el lado
  (`conRama`) según dónde quedó respecto del padre. Es el `onSettle` de `useNodeInertia`.
- `deleteNode(id)` (via NodeActionsContext) — `descendientes` para el conteo, `window.confirm` si
  borra >1, aborta las llamadas en vuelo de lo que se borra, `quitarSubarbol`, deja activo al padre.
- `onConnect` — conectar handles a mano = `reparentar` el target (con guarda anti-ciclo).

Config de IA: `configIA` (useState `ConfigIA`, lazy init desde `cargarConfigIA()`).
`guardarKeyIA` (guarda la del proveedor activo), `cambiarProveedorIA` (trae la guardada de otro),
`borrarKeyIA` (borra solo la activa) → pasan a `<SettingsPanel>`.
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

- `ConfigIA = { proveedor, apiKey, modelo }`. `PROVEEDORES_DISPONIBLES` = los 4.
  `PROVEEDORES_VIA_PROXY = ["deepseek", "gpt"]` (no habilitan CORS → van por el edge function
  `ia-proxy`, ver decisiones §7a). `MODELO_POR_DEFECTO`, `MODELOS_SUGERIDOS`, `NOMBRE_PROVEEDOR`,
  `PISTA_API_KEY` por proveedor.
- `llamarIA(config, mensajes, opts)` → `switch(config.proveedor)`. Sumar proveedor = un `case`
  nuevo, sin tocar nada del árbol (spec §6). `resumir()` usa el mismo proveedor configurado.
- La API key de Claude/Gemini va **directo del navegador al proveedor**. La de DeepSeek/GPT
  **transita** el proxy stateless (opt-in `opts.usarProxy` / `settings.usarProxyIA`) — nunca se
  almacena. Ver §7a.
- **Adaptador OpenAI-compat** (`llamarOpenAICompat`): `fetch` a `proxyIAUrl()` con headers
  `x-ia-provider` (openai|deepseek), `x-ia-path`, `x-ia-key`. SSE `data: {json}` →
  `choices[0].delta.content`. `max_tokens` (deepseek) / `max_completion_tokens` (gpt).
  Sin `usarProxy` o sin proxy configurado → `ErrorIA` explicativo. `mensajeErrorOpenAICompat`
  para 401/402/403/404/429/5xx.
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
  `gemini-3.7-flash`. `thinkingConfig` por generación: `thinkingLevel: "low"` (3.x) /
  `thinkingBudget: 0` (2.x). Ver decisiones §7b.
  `llamarGemini` es un wrapper: llama a `intentarGemini` y ante un 503 (Google satura los flash
  3.x) reintenta 1 vez con 1s de pausa, solo si no se streameó texto. Ver decisiones §7c.
- `mensajeLegible` mapea status/errores → texto legible (usado por ambos adaptadores).
  `mensajeErrorGemini(res, modelo?)` traduce errores de cualquier endpoint de Gemini (400 key /
  401 keys `AQ.` / 403 / 404 / 429 / 503).
- `avisoFormatoKey(proveedor, key)` — chequeo de formato local (sin red, sin tokens): regex del
  prefijo (`sk-ant-` / `AQ.`|`AIza` / `sk-`). Devuelve aviso o null. Solo caza typos y provider
  equivocado. Lo usa `SettingsPanel` para el aviso ámbar. Ver decisiones §8c.
- `listarModelos(config)` → `listarModelosClaude` (`client.models.list()`) / `listarModelosGemini`
  (`GET /v1beta/models`). **No gasta tokens** en ninguno; 401 si la key es inválida → sirve de
  verificación gratis de la key. Filtra a modelos que soportan `generateContent`.

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
- `<NodeToolbar>` visible cuando `selected`: botón "⤢ Abrir" (`openNode(id)` → panel de
  transcripción) siempre, y "🗑 Eliminar" (`deleteNode(id)`) solo si `!isRoot`. Ambos del
  `NodeActionsContext`.
- Anillo celeste (`ring-sky-400`) cuando `selected`.

## Composer.tsx

Barra `absolute inset-x-0 bottom-0`. Props: `activeNodeLabel`, `arbolVacio`,
`onSubmit(text, "main"|"branch")`.
- `Enter` → submit("main"). `Shift+Enter` → salto de línea.
- `arbolVacio` → hint "Escribí tu primera pregunta", botón "Empezar" (sin "Ramificar"). Si no,
  "⑂ Ramificar" + "↓ Continuar hilo", deshabilitados sin activo o con texto vacío.

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
