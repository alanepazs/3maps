# Arquitectura del código

> Mapa de `src/` para no leer todo. Para una dependencia puntual: `graphify query "..."`
> (napkin §6b). El árbol de abajo es el índice; las secciones `##` que siguen son deep-dives —
> leelas solo si tocás ese archivo. Actualizar cuando cambie la estructura.
> Última actualización: 01-09-2026.

**Tamaños** (líneas): `FlowCanvas.tsx` ~1150 · `ia.ts` ~890 · `SettingsPanel.tsx` ~745 ·
`intercambio.ts` ~350 · `MessageNode.tsx` ~300 · `sync.ts` ~330 · `BranchTranscript.tsx` ~270 ·
`compartir.ts` 237 · `contexto.ts` 227 · `configIA.ts` 183 · `useSync.ts` 166 · `layout.ts` 148 ·
`mapas.ts` ~150 · `Composer.tsx` 138 · el resto < 110.

## Stack real (lo que está instalado)

- **Next.js 16.3.3** (App Router, Turbopack) + **React 19.2** + **TypeScript 5**
- **Tailwind CSS 4** (`@tailwindcss/postcss`, sin `tailwind.config` — config por CSS)
- **React Flow** `@xyflow/react` ^12.11.5 (con `@xyflow/system` 0.0.81 pinneado)
- **`@anthropic-ai/sdk`** — se importa **dinámicamente** dentro de `model/ia.ts` (solo se baja
  cuando el usuario dispara una llamada; no pesa en la carga inicial).
- **`react-markdown`** + `remark-gfm` + `remark-math` + `rehype-katex` (matemática) + `rehype-raw`
  + `rehype-sanitize` (HTML crudo del modelo, saneado) — render de las respuestas de la IA
  (`components/Markdown.tsx`). `katex/dist/katex.min.css` se importa ahí.
- **`@supabase/supabase-js`** — backend **opcional** (fase 2). Sin las env `NEXT_PUBLIC_SUPABASE_*`,
  `getSupabase()` → null y la app sigue 100% local. Sin `transformers.js` todavía.
- **Edge function** `supabase/functions/ia-proxy` (Deno) — proxy stateless para los 5 proveedores
  OpenAI-compat (no habilitan CORS). Se deploya aparte con la CLI de Supabase, no por el workflow.
- Deploy de la web: **GitHub Pages** (`output: "export"`).

## Árbol de archivos

```
src/
  app/
    layout.tsx      Root layout. metadata.title = "3maps". <html> con suppressHydrationWarning
                    (por Darkreader). body: `flex h-full flex-col overflow-hidden`.
    page.tsx        Renderiza <FlowCanvas /> dentro de <main class="h-dvh w-full overflow-hidden">.
                    `dvh` (no `vh`) para que en móvil encuadre al área visible real, sin scroll.
    globals.css     Tailwind + tokens de color que siguen prefers-color-scheme (dark por defecto
                    en el SO del usuario). `@media (max-width:640px)`: sube los `.react-flow__
                    controls` (los tapaba el composer) y oculta el `.react-flow__minimap`.
                    `.scroll-fino` = scrollbar de 8px para el cuerpo del globo redimensionado.
  model/
    intercambio.ts       ★ Modelo de datos (fuente de la verdad). Tipos Intercambio/Arbol/Rama/
                         Proveedor. Funciones puras: consultas (buscar, hijos, descendientes,
                         caminoRaizA, padre, raices), mutaciones (agregar, quitarSubarbol,
                         conPosicion, conRama, conRespuesta, reparentar), arbolAVista (deriva
                         nodes/edges de React Flow), toMarkdown / parseMarkdown, arbolInicial
                         (= { intercambios: [] }, árbol vacío — el 1er submit crea la raíz).
    persistencia.ts      guardarArbol(arbol, mapId) / cargarArbol(mapId) en localStorage
                         ("3maps:arbol:<mapId>"), un string .md por intercambio. Cae a
                         arbolInicial() si no hay nada.
    mapas.ts             Registro de mapas (fase 3.5). "3maps:mapas" = {[id]:{titulo,creado,
                         renombrado?}}, "3maps:mapaActivo", árbol en "3maps:arbol:<id>". leerMapas()
                         migra el formato viejo SOLO si "3maps:mapas" nunca se escribió (si es `{}`
                         NO re-crea "principal"). asegurarUnMapa() garantiza ≥1 mapa.
                         crear/renombrar/borrarMapa (renombrar sella `renombrado`), nombreMapaLibre,
                         nuevoMapaId, cuandoMeta (= renombrado ?? creado, para LWW de títulos),
                         fusionarMapasNube (agrega los que faltan + adopta títulos más nuevos + dedup),
                         podarMapasBorrados(borrados, excepto) (aplica tombstones).
    layout.ts            calcularLayout(arbol, alturaDe) → Map<id,{x,y}>. Auto-layout recursivo
                         para el botón "Ordenar" (fase 3.4): tronco `main` vertical, ramas
                         `branch-*` en columnas al costado con su propio tronco. Puro.
                         ubicarNuevoGlobo(arbol, parentId, kind, medir) → {x, y, rama}: al crear
                         un hijo, busca un lugar libre cerca del padre (no pisa a NINGÚN globo,
                         usa rects reales) y alterna el lado de las ramas (fase 3.2).
                         resolverSuperposiciones(arbol, medir) → Map<id,{x,y}> | null: empuja
                         hacia ABAJO solo los globos que quedaron pisando a otro (respuesta más
                         alta que el estimado, o posiciones de otra pantalla). Respeta lo que no
                         se pisa. Lo llama `FlowCanvas` (debounce 500ms) al terminar una respuesta
                         y al traer un árbol de la nube.
    contexto.ts          armarContexto(arbol, nodoId, opts, resumenViejo, relevantes) → Mensaje[]:
                         SOLO el camino raíz→nodo, aplanado a user/assistant, con ventana (últimos
                         N completos + resumen del tramo viejo). `relevantes` = intercambios viejos
                         rescatados textuales JUSTO antes de la pregunta (no parte el prefijo).
                         tramoAResumir = fuera de la ventana. intercambiosRelevantes(viejos,
                         pregunta) = match por raíz de palabra + peso por rareza (fase 2.5 liviana).
    ia.ts                llamarIA(config, mensajes, opts) → { texto, uso }. `uso` = tokens
                         {entrada,salida} del proveedor o null (T11, decisiones F3-19). Punto único; switch(proveedor).
                         Adaptadores: Claude (@anthropic-ai/sdk dinámico), Gemini (fetch + SSE), y
                         los OpenAI-compatibles vía llamarOpenAICompat (contra el edge function
                         ia-proxy; SSE estilo OpenAI). Streaming vía opts.onTexto. opts.usarProxy
                         los gatea (si false → ErrorIA explicativo); resumir() lo recibe también.
                         listarModelos (Claude client.models.list(), Gemini GET /v1beta/models,
                         los demás via proxy GET /models). PROVEEDORES_DISPONIBLES = 7 (Gemini,
                         Claude + 5 vía proxy: deepseek, gpt, groq, openrouter,
                         huggingface). upstreamDe(prov) → clave
                         del mapa PROVEEDORES del proxy. `GUIA_API_KEY[prov]` = {url, gratis,
                         abierto?, pasos} (mini-guía en ⚙️). `sinRazonamiento()` saca <think> del
                         stream (F3-12). ErrorIA con mensajes legibles.
    configIA.ts          localStorage "3maps:ia" = { activo, keys: {[prov]:{apiKey,modelo}}, dueño }
                         — UNA key por proveedor. cargarConfigIA() (default gemini), guardarConfigIA,
                         cambiarProveedorActivo, borrarKeyProveedor, configGuardadaDe.
                         modeloVigente() migra los GEMINI_MODELOS_MUERTOS (def. en ia.ts) al default.
                         scopeConfigIA(uid) — si loguea OTRA cuenta, borra las keys locales.
                         exportarConfigNube / fusionarConfigNube(nube) — sync entre dispositivos con
                         sesión (a `sync/<uid>/config.json`, unión de keys, gana la nube; §9).
                         Migra el formato viejo.
    supabase.ts          getSupabase() → SupabaseClient | null (null si no hay env). haySupabase()
                         para mostrar/ocultar UI. proxyIAUrl() = <supabaseUrl>/functions/v1/ia-proxy.
                         auth con persistSession/detectSessionInUrl true (fase 2.2, magic link).
    sync.ts              Sync entre dispositivos (fase 2.4, PER-MAPA desde 3.5; solo con sesión).
                         Bucket privado. `sync/<uid>/<mapId>.json` = árbol (.md-por-intercambio +
                         `titulo`). planInicial(arbolLocal, uid, mapId) → subir/traer/vaciar/nada,
                         LWW por hora del SERVIDOR (`metaNube` lee updated_at via storage.list).
                         localStorage "3maps:sync:<mapId>" = {at, hash, uid}, y
                         "3maps:sync:epoch:<uid>" = último epoch de reset aplicado. El mapa
                         "principal" cae al viejo `arbol.json`. `_mapas.json` = `{mapas, borrados,
                         epoch?}` (índice + tombstones + epoch de "Empezar de cero"; unión al subir,
                         borrados SÍ se propagan, título con LWW por `cuandoMeta`). `empezarDeCeroNube`
                         tombstonea todo + epoch nuevo → `sincronizarListaMapas` en el otro
                         dispositivo hace reset duro. `config.json` = keys/modelos
                         (bajar/subirConfigNube, §9). Todo baja por signed URL + `{cache:"no-store"}`
                         (`descargarTexto`), sube con `cacheControl: "0"` (decisiones F2-8, F2-4, F3-4).
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
                        Respuesta > 400 chars → cuerpo colapsado a 220px con degradado + pill
                        "⌄ ver más" y toggle Expandir/Colapsar en el toolbar (fase 3.1, ver vista.ts).
                        Manija ◢ abajo-derecha para redimensionar (fase 3.10): pointermove/up en
                        window, deltas / getZoom(); durante el arrastre estado local `drag`, al
                        soltar → `resizeNode` (NodeActionsContext) → `conTamano` → `.md`
                        (`data.ancho/alto`, sincroniza). Tamaño manual desactiva el colapso auto y
                        muestra "↔ Auto". Cuerpo `flex-1 overflow-auto` → scrollea si queda chico.
    vista.ts            SOLO el colapsado/expandido por globo (`expandidos:{[id]:bool}` en
                        localStorage["3maps:vista"], per-navegador, NO sincroniza). LIMITE_COLAPSO
                        =400, ALTO_COLAPSADO=220. leer/guardarExpandido. (El tamaño manual pasó al
                        `.md` — F3-8.)
    Markdown.tsx        <Markdown>{texto}</Markdown> — react-markdown con estilos compactos para el
                        globo. remark-gfm + remark-math + rehype-katex (matemática: `$…$`, `$$…$$`,
                        y `\[ \]`/`\( \)` normalizados a `$` antes de parsear). rehype-raw +
                        rehype-sanitize: el HTML del modelo (sobre todo `<br>` en tablas) se
                        interpreta pero saneado (un árbol compartido es de otro → no `<script>`).
                        `sanitizarCrudo()` antes de parsear: saca basura de tokens del modelo
                        (`<PAD>`…), colapsa floods, techo 60k — sin esto un flood crashea/cuelga
                        el parser (F3-14). Envuelto en `<LimiteError>` (fallback = texto crudo).
                        Código/tablas con scroll horizontal propio; links target=_blank.
                        Decisiones F3-12, F3-14.
    LimiteError.tsx     Error boundary de clase genérico (`fallback` + `resetKey`). Aísla un crash
                        de render: en `Markdown.tsx` y en el cuerpo de cada `MessageNode`. Un globo
                        roto muestra el fallback, el resto de la app sigue viva. F3-14.
    BranchTranscript.tsx  Panel lateral: el camino raíz→globo (`caminoRaizA`) aplanado a Q/A tipo
                        chat. Vista derivada. Se abre con doble-click en un globo o el botón ⤢;
                        cierra con Esc / ✕ / click en el fondo. Botón ⇄ en el header cambia el
                        lado (izq/der) → `settings.transcriptSide`. Si recibe `onSubmit` (no en
                        modo compartido): mini-composer al pie que crea un hijo del globo abierto
                        y mueve el panel a ese hijo (fase 3.9; Enter continúa / Ctrl+Enter ramifica,
                        fase 3.12). Auto-scroll al último.
                        Ancho (fase 3.11): si `resizable`, manija en el borde interno (arrastra
                        style.width por DOM, persiste al soltar vía `onResize`). Si no (móvil),
                        pantalla completa + botón "🗺 Ver mapa" en el header.
                        Header: "N interc. · ≈ N tokens de contexto" (T10, prop `contextoTokens`
                        calculada en FlowCanvas; F3-20). Cada turno IA: "N → N tok" de
                        `Intercambio.tokensEntrada/Salida` si los tiene (T12, F3-21). `fmtTokens`
                        exportado acá (lo usan los dos contadores).
                        Props: {intercambios, side, onFlipSide, onClose, onSubmit?, onStop?,
                        onRetry?, nav?, onNavigate?, contextoTokens?, width?, resizable?, onResize?}.
    SharedBanner.tsx    Cartel arriba cuando se ve un árbol compartido (`?compartir=`). Props:
                        {titulo, onGuardar, onSalir}. "Guardar en mi 3maps" = pasa a local editable.
    LoginNudge.tsx      Pill arriba-centro para el usuario DESLOGUEADO (solo si `haySupabase()`):
                        "sin cuenta anda igual, con cuenta sincroniza". "Iniciar sesión" (Google) +
                        ✕ (descarta, `localStorage["3maps:nudge-login"]`). Fase 2 opcional-login.
    useSesion.ts        Hook de auth (fase 2.2): {usuario, cargando, signInWithGoogle,
                        enviarMagicLink, cerrarSesion}. onAuthStateChange + getUser. Google OAuth
                        (principal) o magic link. Sin Supabase → usuario null, cargando false.
    useSync.ts          Hook de sync (fase 2.4, per-mapa desde 3.5). Args: {arbol, setArbol, listo,
                        activo, mapId, titulo, onTituloNube?}. Sync inicial al loguear O al cambiar
                        de (uid, mapId) — traer si la nube es más nueva, si no subir. Después: push
                        con debounce 1.5s + flush en pagehide; y `revisarNube` (poll cada 15s + al
                        volver a foco) TRAE cambios del otro dispositivo del mapa abierto — sólo si
                        local está limpio (`arbolRef === sincronizado`), pre-chequea `metaNube`.
                        Devuelve EstadoSync. No corre en modo compartido.
    MapaSwitcher.tsx    Selector de mapas (fase 3.5): chip arriba a la izquierda al lado de ⚙️.
                        Lista + ＋ Nuevo + ✎ Renombrar (prompt) + 🗑 Borrar (se permite el último →
                        crea uno vacío) + 🧹 Empezar de cero (borra todo local+nube, epoch). Cierra
                        al clickear afuera. Props: {mapas, activoId, onCambiar, onNuevo, onBorrar,
                        onRenombrar, onEmpezarDeCero}.
    Composer.tsx        Barra inferior fija para escribir. Props: {activeNodeLabel, arbolVacio,
                        onSubmit(text, "main"|"branch"), oculto, onToggleOculto}. Enter continúa /
                        Ctrl+Enter ramifica / Shift+Enter salto (F3-10). Botón `⌄` la esconde
                        (`settings.composerOculto`) → queda un botón grande "✎ Escribir" (F3-11).
                        `arbolVacio` → hint + botón "Empezar" (sin "Ramificar").
    SettingsPanel.tsx   Tuerquita ⚙️: ajustes del lienzo (envión, ventana de contexto) +
                        config de IA. API key y modelo son BORRADORES (estado local) que se
                        persisten con el botón "Guardar" (o Enter); el proveedor aplica al toque y
                        TRAE la key guardada de ese proveedor (una por proveedor, ver configIA.ts).
                        "✓ Guardado" / "Cambios sin guardar" /
                        "✓ Aplicado" (2s tras guardar) / "Borrar key". Aviso ámbar bajo el input
                        si el formato de la key no pinta del proveedor (avisoFormatoKey, local).
                        Botón "verificar key y ver sus modelos" → listarModelos() (gratis, no gasta
                        tokens; 401 si la key es inválida). El modelo se elige por CHIPS clickeables
                        bajo el input = SOLO los que la key puede usar (tras verificar; antes: sin
                        chips). Nunca modelos adivinados (F3-13; `MODELOS_SUGERIDOS` se eliminó).
                        Sin `<datalist>`. Lista > 12 (OpenRouter ~300, HF ~90) → los chips van en
                        un `<details>` plegado con filtro por substring adentro (se muestran TODOS
                        los modelos de la key; el contenedor scrollea). Los 7
                        proveedores; commit() lo dispara al guardar. `<details>` con la mini-guía
                        de API key (`GUIA_API_KEY`, F3-12 aclara open-source).
                        Textarea "instrucción de sistema" → onChange({systemPrompt}) directo.
    settings.ts         Settings = {inertia, ventanaContexto, systemPrompt, transcriptSide,
                        transcriptWidth, usarProxyIA}. DEFAULT_SETTINGS, storage key. systemPrompt
                        "" = ninguna; se antepone a la respuesta, no al resumen. transcriptSide
                        "left"|"right" (default "right"). transcriptWidth = {mobile, desktop} px
                        del panel lateral por bucket de viewport (fase 3.11; ANCHO_PANEL_MIN 320,
                        ANCHO_PANEL_MAX_FRAC 0.75, ANCHO_PANEL_DEFECTO 460). usarProxyIA = opt-in
                        para los proveedores vía proxy (default false).
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
  functions/ia-proxy/index.ts   Edge function Deno. Proxy stateless para los 5 proveedores
                               OpenAI-compatibles (openai, deepseek, groq, openrouter,
                               huggingface — mapa
                               PROVEEDORES): reenvía a la base fija de cada uno con x-ia-key, agrega
                               CORS, pipe del stream. Sin logs, sin storage. Redeploy obligatorio al
                               sumar un proveedor: `supabase functions deploy ia-proxy` o el editor.
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
- `handleSubmit(text, kind, parentId?)` — si el árbol está vacío, el globo es la raíz; si no,
  cuelga de `parentId` (para el composer del panel, fase 3.9) o del activo.
  `agregar(crearIntercambio({..., pending:true}))`, lo setea, llama `responder(id, arbolNuevo)`,
  **devuelve el id del globo nuevo** (o null). La posición y el lado de la rama salen de
  `ubicarNuevoGlobo` (layout.ts): lugar libre cerca del padre sin pisar ningún globo, ramas
  alternando izq/der (fase 3.2). Al crear cualquier globo, `centrarEnGlobo(x,y)` (`setCenter`,
  mantiene zoom) baja la cámara al nuevo (3.2b).
- `responderDesdePanel(text)` — el composer de `BranchTranscript` (fase 3.9):
  `handleSubmit(text, "main", transcriptNodeId)` + mueve el panel al hijo nuevo.
- `onNodeDrag` (envuelve el de `useNodeInertia`) — además de trackear velocidad para el envión,
  si el nodo arrastrado es una rama, mueve el `sourceHandle` de su flecha al lado (izq/der) en
  vivo mientras se arrastra, tocando solo el estado `edges` (fase 3.3). `asentar` fija la `rama`
  al soltar.
- `responder(nodeId, arbolBase)` — **la llamada a la IA**. Watchdog: aborta si no llega nada en
  45s o el total pasa 180s → error reintentable (deja la respuesta parcial). Si no hay API key →
  `conError`. Si no:
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
  borra >1, aborta las llamadas en vuelo de lo que se borra, `quitarSubarbol`, deja activo al
  padre. Borrar la raíz solo se permite sin hijos (fase 3.6) → confirma "el mapa queda vacío".
- `onConnect` — conectar handles a mano = `reparentar` el target (con guarda anti-ciclo).
- `ordenar()` — botón "▤" en `<Controls>` (fase 3.4). `calcularLayout(arbol, alturaDe)` →
  escribe las posiciones al árbol Y a `nodes` (la firma de la vista no incluye x/y) → `fitView`.
- Mapas (fase 3.5): `cambiarMapa` / `nuevoMapa` / `borrarMapaActual` / `renombrarMapaActual` →
  `<MapaSwitcher>`. `mapaId` + `mapas` (estado, poblado al hidratar). El efecto de persistir y
  `useSync` toman `mapId`. Al loguear, `bajarIndiceMapasNube` + `fusionarMapasNube` (unión).
- Viewport / móvil (F3-11): `anchoVentana` (useState + listener `resize`) → `esMobile = < 768`.
  `fitOpts` (memo) = `{ padding: 0.18, minZoom: 0.15, maxZoom: esMobile ? 0.7 : 1.2 }` va a
  `<ReactFlow fitViewOptions>` y a los 4 `fitView()`. `panelBucket` / `panelResizable` /
  `panelAncho` / `guardarAnchoPanel` → `<BranchTranscript>` (F3-9). El `<div>` raíz lleva
  `data-chat={settings.composerOculto ? "oculto" : "visible"}` (lo lee `globals.css`).
  `<Composer oculto onToggleOculto>` → `settings.composerOculto`.

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

- `ConfigIA = { proveedor, apiKey, modelo }`. `PROVEEDORES_DISPONIBLES` = **7**
  (`gemini, claude` + 5 vía proxy: `groq, openrouter, huggingface, deepseek, gpt`).
  `PROVEEDORES_VIA_PROXY` = **5** (todos menos gemini/claude — no habilitan CORS → van por
  `ia-proxy`, decisiones §7a). `cerebras`/`siliconflow`/`zhipu`/`moonshot`/`mistral`/`qwen` se eliminaron (§7d).
  `MODELO_POR_DEFECTO`, `NOMBRE_PROVEEDOR`, `PISTA_API_KEY`, `GUIA_API_KEY` por proveedor
  (`MODELOS_SUGERIDOS` se eliminó — F3-13).
- `llamarIA(config, mensajes, opts)` → `Promise<{ texto, uso }>`, `switch(config.proveedor)`.
  `uso` (`UsoTokens = { entrada, salida }` | null) = tokens que reportó el proveedor: Claude
  `final.usage`, Gemini `usageMetadata`, OpenAI-compat `stream_options:{include_usage:true}` →
  chunk final (T11, decisiones F3-19). Sumar proveedor = un `case` nuevo + entradas en los
  `Record<Proveedor,…>` + (si es OpenAI-compat) redeploy del `ia-proxy`. Cero cambios en el árbol
  (spec §6). `resumir()` usa el mismo proveedor (le pasa `usarProxy`) y devuelve `string` (tira
  el `uso`).
- La key de Claude/Gemini va **directo del navegador al proveedor**. Las de los otros 11
  **transitan** el proxy stateless (opt-in `opts.usarProxy` / `settings.usarProxyIA`), nunca se
  almacenan. Ver §7a.
- **Adaptador OpenAI-compat** (`llamarOpenAICompat` / `listarModelosOpenAICompat`): `fetch` a
  `proxyIAUrl()` con headers `x-ia-provider` (nombre, no URL — anti-SSRF), `x-ia-path`, `x-ia-key`.
  SSE `data: {json}` → `choices[0].delta.content`. `max_completion_tokens` solo para `gpt`, el
  resto `max_tokens`. `upstreamDe(prov)` mapea el `Proveedor` a la clave del mapa `PROVEEDORES` del
  proxy. Sin `usarProxy` / sin proxy → `ErrorIA` explicativo. `mensajeErrorOpenAICompat` para
  401/402/403/404/429/5xx.
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
  (`GET /v1beta/models`, filtra `GEMINI_MODELOS_MUERTOS` + image/tts/embedding…) /
  `listarModelosOpenAICompat` (`GET /models` vía proxy). **No gasta tokens**; 401 si la key es
  inválida → verificación gratis (§8c).

## Deploy (next.config.ts + .github/workflows/deploy.yml)

- `output: "export"` → `next build` genera `out/` (estático puro; todo el canvas y la llamada a la
  IA corren client-side).
- `basePath: "/3maps"` **solo** cuando `NEXT_PUBLIC_PAGES === "1"` (lo setea el workflow). En
  `next dev` local la app queda en la raíz.
- El workflow: `npm ci` → `npm run build` (con el env) → `touch out/.nojekyll` →
  `upload-pages-artifact` → `deploy-pages`. Corre en cada push a `main`.
- URL: `https://alanepazs.github.io/3maps/`. Requiere una vez: repo → Settings → Pages → Source =
  "GitHub Actions".

## MessageNode.tsx

`data`: `{ pregunta, respuesta, pending?, error?, isRoot?, sinHijos?, ancho, alto }`.
- Ancho por defecto 260px; **redimensionable** con la manija ◢ abajo-derecha (F3-8): tamaño en
  `data.ancho/alto` (va al `.md`, sincroniza), cuerpo `flex-1 overflow-auto nowheel scroll-fino`.
- Cuerpo: `pending` ("escribiendo…" + texto + ▍) · `error` (recuadro rojo + "↻ Reintentar") ·
  respuesta (`<Markdown>`) · "Respuesta pendiente". Respuesta > 400 chars y sin tamaño manual →
  colapsado a 220px + degradado + "⌄ ver más" (F3-1, `vista.ts`).
- Handles: `target` arriba (el raíz NO lo tiene) · `source id="main"` abajo ·
  `source id="branch-right"` derecha · `source id="branch-left"` izquierda (= los valores de `rama`).
- `<NodeToolbar>` cuando `selected`: "⤢ Abrir" siempre · "↻ Rehacer" (`retryNode`) si `!readOnly` ·
  "⌄ Expandir/⌃ Colapsar" si colapsable y sin tamaño manual · "↔ Auto" si hay tamaño manual ·
  "🗑 Eliminar" (`deleteNode`) si `!isRoot || sinHijos`. Todos del `NodeActionsContext`.

## model/intercambio.ts (modelo de datos)

`Intercambio` = `{ id, padreId, rama, x, y, ancho, alto, tokensEntrada, tokensSalida, proveedor,
fecha, pregunta, respuesta, pending, error }` (`ancho`/`alto` = null → auto; tamaño manual del
globo, F3-8. `tokensEntrada`/`tokensSalida` = null si el proveedor no dio `usage`; T11, F3-19).
`Arbol` = `{ intercambios: Intercambio[] }`. Coincide con el frontmatter del `.md` (spec §3).
- `rama`: `"main"` (tronco, por abajo) | `"branch-left"` | `"branch-right"` (costado). Los ids de
  los handles `source` del `MessageNode` se llaman igual → `arbolAVista` hace `sourceHandle: ic.rama`
  + `targetHandle` al costado opuesto del hijo (`t-left`/`t-right`; `main` → `t-top`). F3-2b.
- `nuevoId()` → `"nodo-" + 8 hex` (crypto). `arbolInicial()` = `{ intercambios: [] }` (vacío,
  determinístico → SSR-safe; el 1er submit del `Composer` crea la raíz).
- Todas las funciones son **puras**: las mutaciones devuelven un `Arbol` nuevo.
- `caminoRaizA(arbol, id)` → intercambios de la raíz al nodo. Con guarda anti-ciclo.
- `toMarkdown` / `parseMarkdown` — `---` frontmatter (`key: value`, parser mínimo sin YAML) +
  `## Pregunta` / `## Respuesta`. `padre_id` / `proveedor` vacíos → `null`. `pendiente: 1` (una
  llamada a medias) → al parsear se convierte en un `error` reintentable (`pending` nunca se
  restaura como tal). `tokens_in` / `tokens_out` (T11): tokens del proveedor, vacío → `null`;
  un `.md` viejo sin esas líneas parsea igual.

## model/contexto.ts (armado del contexto para la IA)

`Mensaje` = `{ rol: "user" | "assistant", texto }`.

`armarContexto(arbol, nodoId, opts?, resumenViejo?)` → `Mensaje[]`:
- **Solo el camino raíz→`nodoId`** (`caminoRaizA`), nunca el árbol entero (invariante CLAUDE.md).
- Cada intercambio se aplana: pregunta no vacía → `user`, respuesta no vacía → `assistant`.
- **Ventana** (`opts.ventana`, default 6): los últimos N completos; el tramo anterior se reemplaza
  por `resumenViejo` (un `user` con el resumen + un `assistant` "Listo…"). `null` → ese tramo va
  completo.
- `relevantes` (fase 2.5): `intercambiosRelevantes(viejos, pregunta)` rescata ≤3 intercambios
  viejos **textuales justo antes de la pregunta actual** cuando el tramo viejo se resumió — match
  por raíz de palabra + peso por rareza, sin modelo (§10b). No parte el prefijo estable.
- `normalizar`: arranca en `user`, concatena mensajes seguidos del mismo rol → secuencia válida
  para la API. Si `nodoId` es **pendiente**, su pregunta queda de último `user`.
- **Determinístico** para `(camino, opts, resumen)` y el prefijo solo crece al final → prompt
  caching (spec §5, decisiones §10).

`tramoAResumir(arbol, nodoId, opts?)` → los `Intercambio[]` fuera de la ventana. Lo llama
`FlowCanvas.responder` → `resumir()` (cacheado por sesión en `resumenCacheRef`).

`estimarTokens(mensajes)` → `Math.round(Σ texto.length / 4)`. Estimación local (≈ 4 chars/token,
sin tokenizer real) del contexto. `FlowCanvas` lo corre sobre `armarContexto(...)` del globo
abierto → prop `contextoTokens` del panel (T10, decisiones F3-20). No dispara `resumir()`.

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
