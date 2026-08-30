# Fase 3 — Pulido de UX (canvas, mapas, panel)

> Plan de trabajo. Estado: **borrador, nada hecho** (30-08-2026).
> Fase 2 quedó completa y en producción — ver `docs/estado.md` y `docs/fase-2.md`.
>
> Pedido del usuario: mejoras de UX del canvas + soporte de varios mapas + ajustes del panel
> lateral y la tuerquita. Más los sueltos que quedaron de antes.

Antes de tocar `src/`: `graphify query "<pregunta>"` (ver `.claude/napkin.md` §6b). El grafo
está **desactualizado** (es de antes de toda la fase 2) → correr `graphify --update` primero.

---

## Bloques

### 3.1 — Límite de tamaño del globo + minimizar / expandir  (spec §8)

Hoy un globo con respuesta larga crece sin techo.

- Cuerpo del globo con **alto máximo** (~220px) + `overflow` cortado con degradado y "…".
- Estado `expandido` **por globo** — es una preferencia de vista, NO va al `.md`. Guardar en un
  `Set<id>` / `localStorage["3maps:vista"]` (por mapa).
- Botón ⌄ / ⌃ en el `NodeToolbar` (junto a ⤢ / 🗑).
- Default: colapsado si la respuesta supera ~400 chars.
- **Decisión**: cortar-con-degradado vs scroll interno. → cortar + botón expandir.

### 3.2 — El globo hijo no se superpone con la respuesta del padre

`handleSubmit` hoy pone el hijo en `y = parent.y + 240` fijo → si el padre es alto (respuesta
larga), se pisan.

- Usar el alto real del padre: `getNode(parent.id)?.measured?.height` + margen.
- Rama: `x` con offset que despeje el ancho del padre (globo = 260px fijo).
- Queda parcialmente cubierto por 3.4 (auto-layout) pero sirve para el caso incremental.

### 3.3 — La flecha rama↔tronco se reposiciona DURANTE el drag, no al soltar

Hoy: al soltar (`asentar`) se fija `rama` (`branch-left`/`branch-right`) y recién ahí salta el
handle de la flecha.

- En `onNodeDrag`: calcular el lado (`x < parent.x` → izquierda) y si cambió, actualizar el
  `sourceHandle` del edge `e-<padre>-<nodo>` **en el estado `edges` en vivo** (sin mutar el árbol
  entero en cada frame).
- Al soltar, `asentar` ya persiste `rama` al árbol (no cambia).
- Cuidado con el envión/inercia (`useNodeInertia`) — el reajuste vale también durante el glide.

### 3.4 — Botón "ordenar" (auto-layout del árbol)

Ordenar los globos a una forma canónica:

- **Tronco principal** (cadena de `rama: "main"` desde la raíz) en **vertical**.
- Cada **rama** (nodo `branch-*`) + sus descendientes `main` → en **vertical hacia abajo**,
  desplazada al costado (izq/der según su `rama`).
- Layout recursivo propio (~80 líneas): `ubicar(nodo, x, y)` → coloca, baja los hijos `main`,
  manda los hijos `branch` al costado. Necesita los altos medidos de los nodos.
- Escribe `x`/`y` de vuelta al árbol (batch de `conPosicion`).
- Botón en `<Controls>` o flotante. "Centrar" (fitView) ya está en `<Controls>`.
- **Decisión**: layout propio vs librería (dagre/elk). → propio (el modelo tronco+rama es específico).

### 3.5 — Varios mapas (crear / cambiar / borrar)

Hoy: **un** árbol. `localStorage["3maps:arbol"]`, `sync/<uid>/arbol.json`.

- `localStorage`: `3maps:mapas` = `{ [mapId]: { titulo, creado } }` + `3maps:mapaActivo`; el
  árbol de cada mapa en `3maps:arbol:<mapId>`.
- Sync: `sync/<uid>/<mapId>.json` por mapa. `planInicial` + `useSync` pasan a ser **por mapa
  activo**. Para "mis mapas" desde otro dispositivo: `list()` la carpeta del uid.
- UI: selector de mapa (dropdown arriba, o en ⚙️) + "＋ Nuevo mapa" + borrar mapa. Renombrar → después.
- **El más grande.** Se puede partir:
  - **3.5a — "Nuevo mapa"**: guarda el mapa actual (localStorage + sync) y arranca uno vacío en
    otra "instancia". Es lo mínimo para tener más de un mapa aunque no haya selector todavía.
  - **3.5b — selector** para cambiar entre mapas guardados.
  - **3.5c — borrar** un mapa.
- **Decisión**: ¿selector siempre visible o dentro de ⚙️? ¿el sync de fase 2.4 se migra a
  per-mapa de una, o `arbol.json` sigue siendo el "mapa por defecto"?

### 3.6 — Borrar el globo raíz

Hoy el raíz no se puede borrar (dejaría todo huérfano).

- Permitirlo. Qué pasa con los hijos:
  - 1 hijo → ese hijo pasa a ser raíz (se le pone `padreId: null`, `rama: "main"`).
  - >1 hijo → confirmar "van a quedar N árboles sueltos" y hacer raíz a cada hijo.
- `arbolAVista` / `raices()` ya soportan varios sin `padreId`. El `Composer` y el empty-state
  chequean `length`, no "hay raíz" — habría que revisar que no rompan con multi-raíz.
- **Decisión**: ¿permitir multi-raíz de verdad, o forzar a que el usuario elija 1 hijo para promover?

### 3.7 — La tuerquita se cierra al clickear afuera

Hoy solo cierra volviendo a tocar ⚙️.

- Backdrop invisible `pointer-events` + `onClick` que cierra, o listener de `mousedown` en
  `document` que cierra si el target está fuera del panel.
- Chico (~10 líneas). Cuidado de no cerrar al interactuar con el panel mismo.

### 3.8 — Panel lateral: sacar "Transcripción de la rama"

El título confunde cuando abrís un globo del tronco principal (no es "una rama").

- Header: cambiar por algo neutro — "Conversación hasta este globo" o solo el contador de
  intercambios. Cambio de texto en `BranchTranscript.tsx`.

### 3.9 — Panel lateral: cuadro de texto para escribir sin cerrarlo

Hoy: para seguir la conversación hay que cerrar el panel → escribir en el mapa → reabrir.

- Mini-composer al pie de `BranchTranscript` que crea un hijo del **último** intercambio del
  camino mostrado.
- `BranchTranscript` recibe un `onSubmit`; `FlowCanvas` lo cablea a `handleSubmit` con el target
  fijado al último nodo del camino.
- Medio. Reusa `handleSubmit` / `responder`.

---

## Sueltos que quedaron de fase 2

- **Cerebras como 5º proveedor**: OpenAI-compatible → entra por el proxy `ia-proxy` (un `case`
  más + `cerebras: "https://api.cerebras.ai/v1"` en el edge function + redeploy). Tiene free tier
  real (verificar límites al día).
- **Renombrar "Generar link" → "Compartir este árbol"** en `SettingsPanel`. Trivial.
- **2.5b — embeddings de verdad** (`transformers.js`, worker, IndexedDB) si el matching por
  palabras clave se queda corto. Misma firma que `intercambiosRelevantes` → drop-in.
- **Publicar la pantalla de consentimiento de Google** (config del usuario, no código): Google
  Cloud → Pantalla de consentimiento → "Publicar app". Hasta entonces solo los test-users entran.

---

## Orden sugerido

1. **Quick wins** (¬½ día): 3.7 (click afuera), 3.8 (título panel), renombrar "Generar link".
2. **Canvas** (1-2 días): 3.1 (tamaño/expandir), 3.2 (anti-superposición), 3.3 (flecha en vivo).
3. **3.9** (composer en el panel).
4. **3.4** (auto-layout) — el más satisfactorio visualmente.
5. **3.5** (varios mapas) — el más grande; 3.6 (borrar raíz) puede ir con esto.
6. Cerebras, y 2.5b si hace falta.

## Decisiones abiertas (juntar antes de arrancar cada bloque)

- 3.4: layout propio vs librería.
- 3.5: selector visible vs en ⚙️; migrar el sync a per-mapa o mantener `arbol.json` default.
- 3.6: multi-raíz real vs promover 1 hijo.
- 3.1: cortar-con-degradado vs scroll interno.
