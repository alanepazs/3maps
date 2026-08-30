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

### 3.2 — El globo hijo no se superpone con la respuesta del padre  ✅ (30-08-2026)

`handleSubmit`: el hijo `main` ahora cuelga en `y = parent.y + altoPadre + 60`, con
`altoPadre = getNode(parent.id)?.measured?.height ?? 160` (alto real medido por React Flow) en
vez de un `+ 240` fijo. Las ramas (`x = parent.x + 400`) no cambian.

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

---

## Sueltos que quedaron de fase 2

- **Cerebras como 5º proveedor**: OpenAI-compatible → entra por el proxy `ia-proxy` (un `case`
  más + `cerebras: "https://api.cerebras.ai/v1"` en el edge function + redeploy). Tiene free tier
  real (verificar límites al día).
- ~~**Renombrar "Generar link" → "Compartir este árbol"** en `SettingsPanel`.~~ ✅ (30-08-2026)
- **2.5b — embeddings de verdad** (`transformers.js`, worker, IndexedDB) si el matching por
  palabras clave se queda corto. Misma firma que `intercambiosRelevantes` → drop-in.
- **Publicar la pantalla de consentimiento de Google** (config del usuario, no código): Google
  Cloud → Pantalla de consentimiento → "Publicar app". Hasta entonces solo los test-users entran.

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

- Cerebras como 5º proveedor (por el proxy `ia-proxy`).
- Publicar la pantalla de consentimiento de Google (config del usuario).
- 2.5b (embeddings) si el matching por palabras clave se queda corto.
- Probar el sync per-mapa con login real (2 dispositivos).
