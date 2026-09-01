# Fase 5 — El globo pasa a ser un *tramo* de la conversación

> Spec. Estado: **EN CURSO** (02-09). F5-0 ✅ · F5-1 ✅ · F5-2 casi (folded en F5-1).
> Es un cambio de arquitectura de la VISTA. **El modelo de datos NO cambia.**

## Objetivo

Hoy cada Enter crea un globo → una conversación de media hora hace un mapa gigantesco
verticalmente. Después de Fase 5: **Enter agrega el intercambio dentro del mismo globo**; un globo
nuevo se crea **solo al Ramificar**. El globo crece unos pixeles por intercambio (configurable)
para que, alejado, se vea dónde está y qué tan larga es cada conversación.

Resultado: **un globo = un tramo lineal de la conversación** (una cadena de intercambios `main`),
no un intercambio suelto. Las ramas salen del costado, de cualquier punto del tramo.

## Lo que NO cambia (importante)

- **El árbol de `Intercambio`s sigue siendo la fuente de la verdad.** Un intercambio = una
  pregunta + su respuesta, con su `padreId`, `rama`, `proveedor`, `fecha`, `tokens_in/out`,
  `adjuntos`. Igual que hoy.
- **El `.md` por intercambio, `toMarkdown`/`parseMarkdown`, persistencia, sync, compartir,
  export** — todo igual. **Cero migración**: un mapa viejo (N globos de 1 intercambio unidos por
  `main`) se re-agrupa solo al cargar y se ve como 1 tramo.
- **`armarContexto` / `caminoRaizA`** — el camino sigue siendo a nivel intercambio. `caminoRaizA`
  ya devuelve raíz→intercambio correctamente (el `padreId` no cambia). Prácticamente no se toca.
- Todo lo de Fase 4 que es **por intercambio** (tokens gastados, adjuntos, copiar/guardar,
  turnos Vos/IA) sobrevive — solo cambia el contenedor.

## Concepto nuevo: **tramo** (nivel vista, en `arbolAVista`)

Un **tramo** = la cadena maximal de intercambios unidos por `rama: "main"`, empezando en:
- la **raíz** del árbol, o
- el **destino de una rama** (un intercambio cuyo `padreId` lo tiene como hijo `branch-left/right`).

Se sigue la cadena de hijos `main` hasta un intercambio que **no tiene hijo `main`** (la *punta*
del tramo). Un intercambio del tramo puede tener además hijos `branch-*` (ramas que salen del
medio) — **eso no corta el tramo**, la rama es otro tramo que nace de al lado.

- 1 tramo → 1 nodo de React Flow. **`id` del nodo = id del intercambio cabeza** (estable).
- El orden de los intercambios del tramo = la transcripción que muestra el globo.
- **Invariante nueva**: cada intercambio pertenece a exactamente un tramo. La punta de un tramo
  nunca tiene hijo `main` (por definición de "maximal").

### Reglas derivadas

- **Enter (continuar) solo desde la punta** (decisión de Alan). Agrega un hijo `main` a la punta
  del tramo abierto → ese intercambio se suma al mismo tramo. Desde el medio de un tramo, la única
  opción es Ramificar.
- **Ramificar desde cualquier intercambio del tramo** (decisión de Alan). Crea un tramo nuevo cuya
  cabeza tiene `padreId = <ese intercambio>` y `rama = branch-left/right`. El contexto de la rama
  = raíz→ese intercambio + los de la rama (ya funciona: `caminoRaizA` sigue el `padreId`).

## Cambios por archivo

### `intercambio.ts` — `arbolAVista` reescrito

- Calcular los tramos: para cada intercambio "cabeza" (raíz o destino de rama), seguir la cadena
  `main`.
- **nodes**: uno por tramo. `data`:
  - `intercambios: Intercambio[]` (el tramo, en orden)
  - `cabezaId`, `puntaId`
  - `n` (cantidad de intercambios), `adjuntosN` (suma de adjuntos del tramo)
  - `pending` (= la punta está `pending`), `error` (= la punta tiene error)
  - `preguntaCabeza` (para el label alejado)
- **edges**: para cada intercambio `i` con `rama != "main"`, un edge del tramo de `i.padreId` al
  tramo de `i` (que es cabeza). `sourceHandle` según `i.rama` (como hoy, F3-2b). `data.desdeId =
  i.padreId` (para anclar el edge cerca de ese intercambio en el globo — v1 puede conectar
  costado-a-costado como hoy y refinar después).
- La `firma` que dispara el rebuild de la vista (`FlowCanvas`, excluye x/y) ahora tiene que
  incluir la **estructura de tramos** (padreId + rama de cada intercambio + qué intercambios hay)
  — un hijo `main` nuevo cambia el contenido de un tramo.

### `MessageNode.tsx` — el globo es una mini-transcripción

- Renderiza `data.intercambios` como transcripción scrolleable: turnos Vos/IA por intercambio
  (reusa el markup de `BranchTranscript` — extraer a un componente compartido `Transcripcion`),
  con adjuntos, tokens gastados, `\frac`, etc.
- **Alto** = `base + clamp(0, n * paso, tope)` donde `paso` y `tope` salen de un Setting nuevo
  (ver abajo). El cuerpo scrollea adentro (`nowheel`, auto-scroll a la punta si `pending`).
- Colapsado/expandido (F3-1), resize manual (F3-8), `modoStream` (F3-15) — adaptar: streaming =
  la punta está `pending`.
- Badge: **"N mensajes"** + "📎 N" (adjuntos del tramo) en el header.
- Toolbar: ⤢ Abrir · ↻ Rehacer (la **punta**) · 🗑 Eliminar (el tramo entero + descendientes,
  con `window.confirm` contando TODOS los intercambios). Sin "Expandir/Colapsar" si hay Setting
  de crecimiento (a decidir).

### `BranchTranscript.tsx` → **la superficie de lectura/escritura** (decisión de Alan)

- Abrir un globo → el panel muestra **raíz→acá**: todos los tramos ancestros aplanados + este
  tramo, como una transcripción continua. (Sigue siendo `caminoRaizA(arbol, puntaId)` aplanado —
  ya anda.)
- **Mini-composer del panel**:
  - **Enter** → agrega `main` a la punta del tramo abierto.
  - **Ctrl+Enter / "⑂ Ramificar"** → ramifica desde la **punta** (caso común).
  - **Por intercambio**: cada respuesta de la IA en la transcripción tiene un "⑂" que ramifica
    desde ESE intercambio (el caso "ramificar una pregunta vieja sin desviar el hilo").
- El resto de Fase 4 (flechas de nav entre tramos, contador de contexto, STOP, copiar/guardar)
  se adapta a "tramo" en vez de "globo=intercambio".
- Renombrar el archivo/concepto a `PanelConversacion` o similar (opcional).

### `Composer.tsx` (barra de abajo) — se mantiene (decisión de Alan)

- Sigue existiendo para el caso rápido: continúa el **tramo activo** (Enter agrega a su punta) /
  Ctrl+Enter ramifica desde su punta. El primer mensaje (árbol vacío) también sale de acá.
- "Activo" = el tramo seleccionado en el canvas (o el último tocado).
- **F5-0 ✅ HECHO (02-09)**: la flecha `⌄` pedía doble clic. Causa confirmada: el `click` de
  captura `{ once: true }` que arman las manijas de resize (globo ◢ / borde del panel) para
  tragarse el click sintético post-drag — se comía **cualquier** click posterior, no solo el
  sintético. `components/gestos.ts` `tragarClickSintetico()`: desarma en el primer `pointerdown`
  (un click real lo tiene, el sintético no) + timeout 500ms. + el `⌄` ahora es "⌄ ocultar"
  (área más grande). 3 asserts de la lógica en el pane.

### `settings.ts` + pestaña "Lienzo" — Setting de crecimiento

**Decisión (Alan): un slider "px por mensaje" + un tope.**
- `Settings.crecimientoGlobo = { pxPorMensaje: number; tope: number }`.
- `pxPorMensaje`: slider 0–20 (0 = el globo no crece). Default `6`.
- `tope`: cuánto puede crecer como máximo por encima del alto base. Slider 0–600, default `240`,
  o pasos (`120` / `240` / `480`). Decidir el control exacto al implementar.
- Alto del globo = `altoBase + min(n * pxPorMensaje, tope)`. El cuerpo scrollea adentro.
- Persiste como el resto de `Settings` (escritura directa, sin borrador).

### `layout.ts` — adaptar

- `ubicarNuevoGlobo` solo corre al ramificar (menos globos, menos solapes).
- `calcularLayout` ("▤ Ordenar") trabaja con tramos.
- `resolverSolapes` igual (alto variable de los tramos).

## Qué hay que cuidar (riesgos)

| Riesgo | Mitigación |
|---|---|
| `firma` de la vista no detecta un `main` nuevo → el globo no se actualiza | La firma incluye la estructura de tramos, no solo `respuesta`/`error` por intercambio. |
| Alto variable del tramo rompe `medir` en `ubicarNuevoGlobo` | `medir` ya lee `n?.measured` con fallback; el fallback sube (un tramo nace con ≥1 intercambio, estimado por `n`). |
| `deleteNode` de un tramo con ramas colgando | Cuenta descendientes (todos los intercambios de todos los sub-tramos), `window.confirm`, aborta llamadas en vuelo. |
| `stopNode`/`retryNode` apuntaban a un globo=intercambio | Ahora apuntan a la **punta** del tramo (o al intercambio elegido para retry). |
| Posiciones x/y: solo importa la de la cabeza | `asentar` escribe la x/y de la cabeza; las de los no-cabeza quedan viejas (inofensivo) o se zeran. |
| Mapas viejos: ¿se ven bien agrupados? | Verificar con un `.md` real de un mapa de fase 1-4 (una cadena `main` larga → 1 tramo). |
| El panel y el globo muestran lo mismo (transcripción) | El globo = solo su tramo; el panel = raíz→acá. Componente `Transcripcion` compartido, distinta data. |

## Sub-tareas (implementación incremental)

- **F5-0 ✅ — fix del `⌄` del Composer** (un solo clic). `tragarClickSintetico` en `gestos.ts`.
- **F5-1 ✅ — `arbolAVista` agrupa tramos + `MessageNode` los renderiza** (decisiones F5-1).
  `calcularTramos`/`tramoDesde`/`cabezaDeTramo` en `intercambio.ts`; `arbolAVista` reescrito;
  `datosIguales` ignora `intercambios` (usa `data.rev`); `MessageNode` renderiza la transcripción
  del tramo; `FlowCanvas` resuelve todo a cabeza/punta. 18 asserts + verificado en el pane
  (mapa viejo se agrupa solo, cero migración).
- **F5-2 ~ — Enter agrega a la punta** (no crea globo). **Casi hecho en F5-1**: `handleSubmit`
  `kind === "main"` ya agrega a la punta del tramo sin crear nodo. Falta verificar el
  mini-composer del panel (Enter / Ctrl+Enter) y pulir el `activeNodeLabel` del bottom Composer.
- **F5-3 — Ramificar desde cualquier intercambio**. Affordance "⑂" por intercambio en la
  transcripción del panel + botón del composer (ramifica desde la punta).
- **F5-4 — Setting de crecimiento + badge "N mensajes"**.
- **F5-5 — adaptar** layout/Ordenar, flechas de nav, `deleteNode`/`stopNode`/`retryNode`,
  streaming/auto-scroll, contador de contexto.
- **F5-6 — docs**: `CLAUDE.md` (invariante "un globo = un intercambio" → "un globo = un tramo; el
  intercambio sigue siendo la unidad de datos"), ADR en `decisiones.md`, `arquitectura.md`,
  `historia.md`.

## Success criteria

- [ ] Enter 10 veces seguidas → **1 globo** con 10 intercambios, no 10 globos.
- [ ] Ramificar desde el 3er intercambio de un tramo de 10 → tramo nuevo al costado; el tramo
      original sigue con sus 10; el contexto de la rama = intercambios 1-3 + los nuevos.
- [ ] Un mapa de fase 1-4 (cadena `main` larga) carga y se ve como 1 tramo, sin migración.
- [ ] El globo crece según el Setting; en `"off"` no crece.
- [ ] `tsc` + `lint` + `build` verde; `_scratch` del agrupado de tramos.
- [ ] Adjuntos, tokens, copiar/guardar, STOP, flechas de nav — siguen funcionando.

## Decisiones (Alan, 02-09)

1. **Ramificar desde cualquier intercambio** del tramo.
2. **Enter solo desde la punta** del tramo (del medio → solo Ramificar).
3. **Panel = lectura/escritura, globo = overview.**
4. **Crecimiento = slider "px por mensaje" + tope** en la pestaña "Lienzo".
5. **Composer de abajo se mantiene** + arreglar el `⌄` (un solo clic, F5-0).
6. **Edge de rama: v1 costado-a-costado**, refinar después.
7. **Se saca "Expandir/Colapsar"** del globo (F3-1) — con el slider + scroll interno no aporta.
8. **Renombrar** `BranchTranscript` → `PanelConversacion`, "globo" → "tramo" en el código.
