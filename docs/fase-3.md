# Fase 3 — Pulido de UX (canvas, mapas, panel)

> Plan de trabajo. Estado: **bloque 1 (quick wins) hecho** (30-08-2026); resto pendiente.
> Fase 2 quedó completa y en producción — ver `docs/estado.md` y `docs/fase-2.md`.
>
> Pedido del usuario: mejoras de UX del canvas + soporte de varios mapas + ajustes del panel
> lateral y la tuerquita. Más los sueltos que quedaron de antes.

Antes de tocar `src/`: `graphify query "<pregunta>"` (ver `.claude/napkin.md` §6b). El grafo
está **desactualizado** (es de antes de toda la fase 2) → correr `graphify --update` primero.

---

## Bloques

### 3.1 — Límite de tamaño del globo + minimizar / expandir  ✅ (30-08-2026)

Cuerpo del globo con **alto máximo 220px** (`ALTO_COLAPSADO`) cuando está colapsado, cortado con
degradado + pill "⌄ ver más" clickeable. Toggle "⌄ Expandir / ⌃ Colapsar" en el `NodeToolbar`
(junto a ⤢ / 🗑). Default: colapsado si la respuesta supera 400 chars (`LIMITE_COLAPSO`);
mientras streamea se muestra completo, el tope aplica con la respuesta final.

Preferencia **por globo**, NO va al `.md` ni al árbol: vive en `localStorage["3maps:vista"]`
(`{ expandidos: { [id]: boolean } }`), módulo nuevo `src/components/vista.ts`. Estado local en
`MessageNode` (`override ?? !colapsable`). TODO fase 3.5: clave por mapa.

### 3.2 — El globo nuevo no se pisa con NINGÚN otro  ✅ (30-08-2026)

`ubicarNuevoGlobo(arbol, parentId, kind, medir)` en `layout.ts` busca un lugar libre cerca del
padre usando los **rects reales** (medidos por React Flow) de todos los globos:
- `main` → debajo del padre; si esa columna está ocupada (2ª "continuación" del mismo padre = 2
  troncos) prueba columnas alternadas a los costados.
- `branch` → a un costado, eligiendo el lado con **menos ramas** (empate → derecha) para que el
  árbol quede parejo (antes: siempre a la derecha); si el lado preferido está lleno, prueba el
  otro y filas más abajo. Devuelve también la `rama` (`branch-left` / `branch-right`).
- Reemplaza los offsets fijos (`+240` / `+220` / `+400` / `hermanos*40`) que se pisaban.
- El alto del globo nuevo aún no se conoce (no se midió) → estimado; "Ordenar" reacomoda prolijo.

### 3.2b — La cámara sigue al globo recién creado  ✅ (30-08-2026)

Pedido del usuario: si estabas leyendo el principio de un globo largo y respondés, la cámara
debe bajar sola al hijo. `centrarEnGlobo(x, y)` en `FlowCanvas` → `setCenter(x+130, y+120,
{ zoom: actual, duration: 400 })`, llamado en `handleSubmit` al crear cualquier globo (raíz o
hijo). Mantiene el zoom.

### 3.3 — La flecha rama↔tronco se reposiciona DURANTE el drag, no al soltar  ✅ (30-08-2026)

`FlowCanvas` envuelve el `onNodeDrag` de `useNodeInertia` (ahora `nodeInertiaDrag`): además de
trackear velocidad, calcula el lado (`node.position.x < padre.position.x` → izquierda) y si
cambió actualiza el `sourceHandle` del edge `e-<padre>-<nodo>` en el estado `edges` en vivo (un
`findIndex` + copia, sin tocar el árbol). Solo para nodos rama (`padreId != null && rama != main`).
`asentar` sigue fijando `rama` al árbol al soltar. Durante el envión el ajuste final lo hace
`asentar` (no se sigue reposicionando en el glide — el envión de una rama suele ser corto).

### 3.4 — Botón "ordenar" (auto-layout del árbol)  ✅ (30-08-2026)

Layout propio recursivo en `src/model/layout.ts` — `calcularLayout(arbol, alturaDe)` devuelve
`Map<id, {x,y}>`:

- **Tronco** (cadena `rama: "main"` desde la raíz) en **vertical** (`x` fijo, `y += altoReal + 64`).
- Cada **rama** (`branch-left` / `branch-right`) → columna al costado
  (`x ± (260 + 140)`), alineada arriba con el globo padre, con su propio tronco `main` bajando y
  sus sub-ramas más al costado. Varias ramas del mismo lado se apilan. Varias raíces se apilan.
- Guarda anti-ciclo (`vistos`). Alto de cada globo = `getNode(id)?.measured?.height ?? 130`.

`FlowCanvas.ordenar()` escribe las posiciones al árbol **y** a los nodos (la firma de la vista no
incluye x/y → `setArbol` solo no movería nada) y después `fitView`. Botón `<ControlButton>` "▤"
en `<Controls>` (oculto en modo compartido). Verificado en el preview pane + 6 asserts en scratch.

- ~~**Decisión**: layout propio vs librería.~~ → propio (el modelo tronco+rama es específico).

### 3.5 — Varios mapas (crear / cambiar / borrar / renombrar)  ✅ (30-08-2026)

Cada mapa es un árbol independiente. Módulo nuevo `src/model/mapas.ts`:
`3maps:mapas = { [mapId]: {titulo, creado} }`, `3maps:mapaActivo`, árbol en `3maps:arbol:<mapId>`.
**Migración** del formato viejo: al leer por primera vez se crea el mapa `principal` y se mueve el
`3maps:arbol` a `3maps:arbol:principal`. `persistencia.ts` (`guardarArbol`/`cargarArbol`) y el
efecto de persistir toman `mapId`.

UI: `MapaSwitcher.tsx` — chip arriba a la izquierda al lado de ⚙️ (decisión: visible, no en ⚙️).
Lista de mapas + "＋ Nuevo mapa" (auto-nombrado "Mapa N", arranca vacío; el actual ya está
guardado) + "✎ Renombrar" (`window.prompt`) + "🗑 Borrar este mapa" (confirm; deshabilitado si es
el único). Cambiar de mapa: `cambiarMapa` carga el árbol de ese mapa + `fitView`.

**Sync per-mapa** (decisión: cada mapa sincroniza solo): `sync.ts` + `useSync` toman `mapId`.
Archivo `sync/<uid>/<mapId>.json` (con `titulo` adentro). El mapa `principal` cae al viejo
`arbol.json` si todavía no hay `principal.json`. `useSync` re-corre el sync inicial al cambiar de
`(uid, mapId)`. Índice `sync/<uid>/_mapas.json` para que la LISTA aparezca en todos los
dispositivos (unión al loguear, sin propagar borrados). Borrar un mapa borra su archivo en la nube.

- Falta probar el sync per-mapa con login real (mismo patrón que 2.4, ya verificado).

### 3.6 — Borrar el globo raíz  ✅ (30-08-2026)

Decisión del usuario: **la raíz solo se puede borrar cuando ya no le cuelga nada** (es el último
globo). `arbolAVista` marca `data.sinHijos`; `MessageNode` muestra 🗑 cuando `!isRoot || sinHijos`.
`deleteNode` confirma "el mapa queda vacío" antes de borrar la raíz. No hace falta multi-raíz.

### 3.7 — La tuerquita se cierra al clickear afuera  ✅ (30-08-2026)

Listener `pointerdown` en `document` **en fase de captura** (React Flow frena los eventos del
lienzo antes de que lleguen a `document` en burbuja) + Escape. Cierra si el target queda fuera
del contenedor (`contenedorRef`), que incluye el botón ⚙️ → su toggle lo maneja su propio
`onClick`. `SettingsPanel.tsx`.

### 3.8 — Panel lateral: sacar "Transcripción de la rama"  ✅ (30-08-2026)

Header ahora dice "Conversación hasta este globo" + contador. `BranchTranscript.tsx`.

### 3.9 — Panel lateral: cuadro de texto para escribir sin cerrarlo  ✅ (30-08-2026)

Mini-composer al pie de `BranchTranscript` (textarea + "↓ Enviar", Enter envía / Shift+Enter
salto). Crea un hijo `main` del globo abierto y **el panel se mueve a ese hijo**
(`setTranscriptNodeId(id)`), así se ve la respuesta streameada sin cerrar el panel (chat-style).
Auto-scroll al último intercambio. `BranchTranscript` recibe `onSubmit?`; `FlowCanvas`
(`responderDesdePanel`) lo cablea a `handleSubmit(text, "main", transcriptNodeId)` — que ahora
acepta un `parentId` opcional y devuelve el id del globo nuevo. No se muestra en modo compartido.

### 3.10 — Globo redimensionable desde el borde  ✅ (31-08-2026)

Manija ◢ abajo a la derecha en `MessageNode` (`onPointerDown` + listeners
`pointermove`/`pointerup` en `window`, deltas divididos por `getZoom()` de
`useReactFlow`). Mínimo 200×80, máximo 900×1200 (`TAMANO_MIN`/`TAMANO_MAX` en
`vista.ts`). El texto reflowa con el ancho; el cuerpo va en un contenedor
`flex-1 overflow-auto` → si la caja queda más chica que el contenido, scrollea.
Tamaño **por globo** en `localStorage["3maps:vista"]` (`tamanos: { [id]: {w,h} }`,
al lado de `expandidos`; no va al `.md`). El `w-[260px]` fijo pasó a
`style={{ width: tamano?.w ?? 260, height: tamano?.h }}`.

**Decisión aplicada**: si el globo tiene tamaño manual, se **desactiva el colapso
automático** de 3.1 (`mostrarColapsado = colapsable && !expandido && !tamano`) y
el toggle Expandir/Colapsar se oculta. Para volver al tamaño automático: doble
clic en la manija o botón "↔ Auto" del toolbar (borra la entrada de `tamanos`).

Fix (31-08-2026): la barra de scroll del cuerpo pisaba la manija. Se agregó
`.scroll-fino` en `globals.css` (scrollbar de 8px) al contenedor scrolleable, el
encabezado ganó `bg-neutral-900` opaco + `z-10` (no lo tapa el texto al scrollear)
y la manija `bg-neutral-900` + `z-20` (queda arriba de la barra).

Fix (31-08-2026): la rueda del mouse dentro del cuerpo scrolleable zoomeaba el
mapa. Se agregó la clase `nowheel` al contenedor → React Flow deja de capturar el
`wheel` ahí y el div scrollea normal.

No se usó `<NodeResizer>` de React Flow: querría escribir `width`/`height` en el
nodo de RF, y la vista se reconstruye desde `arbolAVista` (que a propósito no
lleva dimensiones) → habría que inyectarlas en cada rebuild. La manija propia con
el tamaño en `vista.ts` es autocontenida y sobrevive al reload sola. Verificado
en el preview pane (resize en vivo, persistencia, reload, reset, scroll interno,
colapso desactivado).

### 3.11 — Panel lateral redimensionable + volver al mapa  ✅ (31-08-2026)

Manija de arrastre (`w-1.5`, `cursor-ew-resize`) en el borde interno de
`BranchTranscript` — a la izquierda si el panel está a la derecha y viceversa.
El arrastre mueve `panelRef.current.style.width` directo (fluido, sin re-render);
al soltar persiste vía `onResize`. Ancho clampeado a `[320, 75% del viewport]`
(`ANCHO_PANEL_MIN`, `ANCHO_PANEL_MAX_FRAC` en `settings.ts`); el padre
(`FlowCanvas`) reclampa al viewport en cada render.

**Decisión aplicada**: ancho persistido **por dispositivo** en
`settings.transcriptWidth = { mobile, desktop }`; bucket por `window.innerWidth`
(< 768 = `mobile`). `FlowCanvas` trackea el ancho de ventana con un listener
`resize`.

Móvil (`< 768`): el panel va a pantalla completa (`w-full`, sin manija) y el
header muestra un botón "🗺 Ver mapa" que cierra el panel (el ✕ sigue estando; el
⇄ de cambiar de lado se oculta, no aplica a pantalla completa).

Verificado en el preview pane (1280 y 375): manija del lado correcto, arrastre en
vivo, clamp a 75vw, persistencia al bucket `desktop`, restore al recargar, modo
móvil a pantalla completa con "🗺 Ver mapa" que cierra.

Fix (31-08-2026): clickear la manija (o soltar el arrastre sobre el fondo)
cerraba el panel — el `click` sintético post-`pointerup` caía en el fondo
(`onClick={onClose}`). Se ensanchó la manija a 12px montada sobre el borde
(`-ml-1.5`), se le puso `onClick` con `stopPropagation`, y `onResizeStart`
registra un listener `click` de captura `once` que se traga el primer click
después de soltar. Mismo patrón en la manija del globo (3.10).

### 3.12 — Ctrl+Enter ramifica, Enter continúa  ✅ (31-08-2026)

En los dos cuadros de texto (barra inferior `Composer` + mini-composer de
`BranchTranscript`): **Enter** = continúa el hilo (`"main"`), **Ctrl/Cmd+Enter** =
abre una rama (`"branch"`), Shift+Enter = salto de línea. `handleSubmit` ya
aceptaba `"branch"`; se agregó el `kind` al `onSubmit` del panel
(`responderDesdePanel`) y la lectura de `e.ctrlKey || e.metaKey` en ambos
`onKeyDown`. El panel ganó además un botón "⑂ Ramificar" al lado de "↓ Enviar"
(discoverability). Textos de ayuda actualizados. Verificado en el preview pane:
los botones "⑂ Ramificar" / "↓ Continuar hilo" crean `branch-right` / `main` OK;
el atajo de teclado no se puede disparar sintéticamente en el pane (gotcha
conocido) → lo prueba el usuario.

### 3.13 — Ajustes móvil (celu)  ✅ (31-08-2026)

Reportado probando en el celu:
- El panel de ⚙️ quedaba tapado por el `Composer` (barra de escribir, abajo a lo
  ancho en móvil) → no se llegaba a la sección Compartir. `max-h` del panel pasó a
  `calc(100dvh-18rem)` en < 640px (`sm:max-h-[80vh]` en pantallas grandes) +
  `overscroll-contain`.
- El botón "▤ Ordenar" (y parte de los controles de React Flow) quedaba tapado
  por el `Composer`. `globals.css`: `@media (max-width:640px) .react-flow__controls
  { margin-bottom: 14rem }` → los sube por encima de la barra.
- El minimapa ocupaba media pantalla en el celu. `@media (max-width:640px)
  .react-flow__minimap { display:none }`.

Verificado en el preview pane a 375: panel scrolleable con la última sección
visible sobre el composer, "▤ Ordenar" despejado, minimapa oculto. Desktop
intacto (mismo breakpoint 640px que `sm:`).

---

## Sueltos que quedaron de fase 2

- ~~**Cerebras como 5º proveedor**.~~ ✅ (30-08-2026) — y de paso Groq, OpenRouter, Mistral y
  Hugging Face (todos OpenAI-compatibles con free tier real sin tarjeta). Van por el proxy
  `ia-proxy` como DeepSeek/GPT. **Falta que el usuario redeploye el edge function** y pruebe con
  una key real. Cloudflare Workers AI se descartó (mete el `account_id` en la URL).
- ~~**Renombrar "Generar link" → "Compartir este árbol"** en `SettingsPanel`.~~ ✅ (30-08-2026)
- **2.5b — embeddings de verdad** (`transformers.js`, worker, IndexedDB) si el matching por
  palabras clave se queda corto. Misma firma que `intercambiosRelevantes` → drop-in.
- ~~**Publicar la pantalla de consentimiento de Google**.~~ ✅ (30-08-2026) — "En producción".
  Requería: 3 permisos no sensibles (email/profile/openid) en "Acceso a los datos" + URLs de
  privacidad y términos (`public/privacy.html` + `public/terms.html`, ver commit `df4441a`) +
  dominio autorizado `alanepazs.github.io`. Sin revisión de Google (permisos no sensibles).

---

## Orden sugerido

1. ~~**Quick wins**: 3.7 (click afuera), 3.8 (título panel), renombrar "Generar link".~~ ✅
2. ~~**Canvas**: 3.1 (tamaño/expandir) · 3.2 (anti-superposición) + 3.2b (cámara sigue al hijo) ·
   3.3 (flecha en vivo).~~ ✅
3. ~~**3.4** (auto-layout).~~ ✅
4. ~~**3.9** (composer en el panel).~~ ✅
5. ~~**3.5** (varios mapas) + 3.6 (borrar raíz).~~ ✅
6. Cerebras, y 2.5b si hace falta.

## Decisiones (todas cerradas)

- 3.4: layout propio vs librería → **propio**.
- 3.5: selector visible vs en ⚙️ → **visible** (chip al lado de ⚙️).
- 3.5: sync per-mapa vs solo el activo → **per-mapa** (`<mapId>.json` + índice `_mapas.json`).
- 3.6: multi-raíz vs promover 1 hijo → **ninguna**: borrar la raíz solo cuando es el último globo.
- 3.1: degradado vs scroll interno → **degradado + pill "ver más"**.

## Falta de fase 3

- Redeployar `ia-proxy` (suma Groq/Cerebras/OpenRouter/Mistral/HuggingFace) + probar con key real.
- 2.5b (embeddings) si el matching por palabras clave se queda corto.
- Probar el sync per-mapa con login real (2 dispositivos).
- Probar el atajo Ctrl+Enter (ramifica) en Chrome real (3.12).
- Probar el resize del globo (3.10) y del panel (3.11) en Chrome real / celu.
