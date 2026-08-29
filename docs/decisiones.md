# Decisiones — 3maps

> Por qué el código es como es. Cada entrada: **qué se decidió**, **por qué**, y **qué romperías
> si lo revertís sin pensar**. Si vas a ir en contra de una de estas, que sea a propósito.
> Última actualización: 29-08-2026.

Complementa a:
- `docs/spec-proyecto.md` — el diseño y las decisiones de producto (modelo de datos, UX, roadmap).
- `docs/arquitectura.md` — qué hace cada archivo.
- Este archivo — decisiones de implementación que no son obvias mirando el código.

---

## Datos y `.md`

### 1. El `error` va en el frontmatter del `.md`, no en una sección `## Error`
- **Por qué**: la respuesta es markdown generado por la IA y puede tener sus propios `## títulos`.
  El parser toma como "respuesta" **todo lo que hay después de `## Respuesta` hasta el final del
  archivo**. Cualquier sección de cuerpo después de la respuesta se la comería el parseo.
- **Formato**: `error: <JSON.stringify(string)>` en una sola línea del frontmatter (o vacío).
- **Revertir rompe**: respuestas con headings, listas anidadas o `---` se parsean mal al recargar.

### 2. `x`/`y` vuelven al árbol solo en `asentar` (al soltar / frenar el envión), no en cada frame
- **Por qué**: el árbol es la fuente de la verdad, pero escribir posición en cada frame de drag o
  de glide sería un storm de `setState` + `guardarArbol` (localStorage sincrónico).
- **Consecuencia**: la `firma` que dispara la reconstrucción de la vista **excluye `x`/`y` a
  propósito** (`FlowCanvas`). Mover un globo no reconcilia la vista; cambiar su contenido sí.
- **Revertir rompe**: parpadeo al arrastrar, y `visibility:hidden` en los nodos por re-medición.

### 3. La vista de React Flow se reconcilia **preservando identidad de objetos**
- **Por qué**: React Flow re-mide un nodo cuando su objeto `data`/nodo cambia. Al mover un globo
  o al streamear texto en otro, no queremos re-medir los que no cambiaron.
- **Cómo**: en el effect de `firma`, los nodos sin cambio de contenido **mantienen su objeto
  anterior** (`datosIguales` compara `data` shallow). Solo se crean objetos nuevos para lo que
  cambió.
- **Revertir rompe**: flicker y saltos de layout en cada token del streaming.

### 4. `localStorage`: un string `.md` por intercambio bajo `"3maps:arbol"`
- **Por qué**: el `.md` es la fuente de la verdad (invariante CLAUDE.md) y así el export a disco
  (spec §7) es un `for` sobre las mismas strings, sin otra serialización.
- **Revertir** (ej. guardar el `Arbol` como JSON): duplica formato y diverge del export.

### 5. SSR: `arbol` arranca en la **semilla determinística**; `localStorage` se carga en un effect de montaje
- **Por qué**: leer `localStorage` durante el render rompe la hidratación (server ve semilla,
  cliente ve lo guardado). El `setState` dentro del effect es a propósito y corre una vez.
- **`listo`** (useState) gatea: hasta que no cargó, no se persiste ni se reconcilia la vista.
- **La semilla** usa ids `nodo-ejemplo-*` y fechas fijas para que el primer render coincida.
- **Revertir rompe**: warning de hidratación + posible parpadeo semilla→guardado.

---

## IA

### 6. `llamarIA(config, mensajes, opts)` es el **punto único**; adentro `switch(proveedor)`
- **Por qué** (spec §6): sumar un proveedor = un `case` nuevo + entradas en los
  `Record<Proveedor, …>` de `ia.ts`. Cero cambios en el árbol, en `contexto.ts` o en `FlowCanvas`.
- **Revertir** (llamar al proveedor desde el componente): acopla la UI a cada SDK.

### 7. Claude vía `@anthropic-ai/sdk` **dinámico**; Gemini vía `fetch` + SSE **a mano, sin SDK**
- **Claude**: `await import("@anthropic-ai/sdk")` — solo se baja el chunk cuando el usuario
  dispara una llamada real (no pesa en la carga inicial). El SDK setea el header
  `anthropic-dangerous-direct-browser-access` que habilita CORS desde el navegador. Necesita
  `dangerouslyAllowBrowser: true`.
- **Gemini**: el REST `:streamGenerateContent?alt=sse` **anda directo desde el navegador**
  (verificado: key trucha → 400 real, no bloqueo CORS). El SDK de Google no aporta y pesa, así
  que se parsea el SSE a mano (`data: {json}` → `candidates[0].content.parts[].text`).
- **Revertir** (meter el SDK de Google, o cargar el de Anthropic estático): más peso, sin ganancia.

### 7b. Modelos de Gemini: default `gemini-flash-latest` + botón "ver modelos disponibles"
- **El problema**: qué modelos podés usar **depende de la key**. Con una key nueva de AI Studio:
  `gemini-2.0-flash` → 404 (retirado para todos), `gemini-2.5-flash` → 404 (esa key no lo tiene),
  `gemini-flash-latest` → 503 (lo alcanza, pero a veces saturado). Adivinar el nombre es un loop.
- **Fix real**: `listarModelos(config)` en `ia.ts` (GET `…/v1beta/models` con la key del usuario,
  filtra a `gemini-*` con `generateContent`, sin image/tts/embedding). En `SettingsPanel` el link
  "ver modelos disponibles" lo llama y muestra los modelos como chips clickeables + los mete en
  el datalist. Claude usa `client.models.list()` del SDK.
- **Default** = `gemini-flash-latest` (alias): tiene más chance de resolver recién sacada la key
  que un GA puntual. Si da 503, se reintenta o se elige otro con el botón.
- **`MODELOS_MUERTOS`** en `configIA.ts` reemplaza `gemini-2.0-flash` / `gemini-1.5-flash` /
  `gemini-pro` por el default **al cargar** (config vieja se auto-repara sin tocar ⚙️).
  `gemini-flash-latest` **no** está en esa lista (no está muerto, solo saturado a veces).
- **`mensajeErrorGemini(res, modelo?)`**: helper único que traduce errores de cualquier endpoint
  de Gemini (lo usan `llamarGemini` y `listarModelosGemini`). 404 con modelo → sugiere el botón.

### 8. La API key es un **borrador** en `SettingsPanel`; se persiste con el botón "Guardar" (o Enter)
- **Por qué**: no persistir keys a medio tipear, y dejar explícito cuándo la key "entra en
  vigencia". El usuario lo pidió así (antes era save-on-keystroke y daba stale-closure en tests).
- **La llamada real usa siempre la key GUARDADA** (`configIA`), nunca el borrador del input.
- **El proveedor sí aplica al toque**: al cambiarlo se resetea el modelo y se **limpia la key**
  (la key de un proveedor no sirve para otro). Los borradores se re-sincronizan con el patrón
  "ajustar estado en render" (no en effect → no dispara el lint `set-state-in-effect`).

### 9. `configIA` vive en su propio `localStorage` key (`"3maps:ia"`), separado de `"3maps:settings"`
- **Por qué**: es sensible. Y **no se persiste si `apiKey` está vacía** — así se puede editar el
  modelo en memoria antes de que haya key.
- **Invariante CLAUDE.md**: la key va **directo del navegador al proveedor**, nunca a un server
  de 3maps. No agregar telemetría, proxy ni "guardar en la nube" para la key.

### 10. Contexto = **solo el camino raíz→nodo**, aplanado, ventana + resumen
- **Por qué** (invariante CLAUDE.md / spec §5): mandar el árbol entero explota el costo.
- `armarContexto` (`contexto.ts`): `caminoRaizA` → aplanar (pregunta→user, respuesta→assistant) →
  últimos N completos (`opts.ventana`, default 6) + el tramo viejo como `resumenViejo` →
  `normalizar` (arranca en user, sin roles repetidos).
- El **resumen** lo genera `resumir()` con el mismo proveedor/modelo, y se **cachea por sesión**
  (`resumenCacheRef`, key = ids del tramo concatenados con `|`).
- El **prefijo del contexto se mantiene consistente** entre llamadas de la misma rama → aprovecha
  el prompt caching del proveedor. No reordenar ni regenerar el prefijo por gusto.

### 11. `ErrorIA` con mensajes ya en español, listos para mostrar
- **Por qué**: la UI (`MessageNode`) solo pinta `error` en el recuadro rojo, sin traducir nada.
- `mensajeLegible()` mapea `status`/errores de red a texto. Si sumás un proveedor, mapeá sus
  errores ahí también.

---

## Canvas / interacción

### 12. `applyingRef` en `usePanInertia`
- **El bug que resuelve**: el glide llama `setViewport()`, React Flow lo traduce a un
  `d3-zoom.transform()` sobre una selección desnuda, que **dispara sincrónicamente un evento
  `start`** con `sourceEvent === undefined`. Ese `start` entraba a `onMoveStart` → cancelaba el
  envión en el **primer frame**. El flag marca "esto lo disparé yo, ignoralo".
- **Verificado** (A/B con stubs de `performance.now` + rAF): 1 frame/12px con el bug vs
  38 frames/145px arreglado. Commit `ff595e3`.
- **Revertir**: el envión al panear vuelve a no existir (se auto-cancela).

### 13. Borrar es **solo** por el botón 🗑; `deleteKeyCode={null}`
- **Por qué**: evitar borrar un subárbol con Backspace mientras se escribe o navega.
- Todo borrado pasa por `deleteNode`: cuenta descendientes, `window.confirm` si borra >1,
  **aborta las llamadas a la IA en vuelo** de lo que se borra, y deja activo al padre.

### 14. Modo del lienzo por `spaceHeld` (listener propio), no por los keycodes de React Flow
- Sin teclas → manito (`panOnDrag`). Barra espaciadora → puntero (`selectionOnDrag`, recuadro).
- `selectionKeyCode={null}` y `panActivationKeyCode={null}` — se maneja todo con el flag propio
  para que el envión y los dos modos convivan.

### 15. `@xyflow/system` pinneado a `0.0.81`
- Pin exacto en `package.json`. No subirlo junto con `@xyflow/react` sin verificar a mano que
  edges y handles (`source id="main"|"branch-left"|"branch-right"`) siguen dibujándose.

---

## Build / deploy

### 16. `output: "export"` + `basePath: "/3maps"` **condicional a `NEXT_PUBLIC_PAGES === "1"`**
- **Por qué**: `next dev` local queda en la raíz (`localhost:3000`), y solo el build del workflow
  de Pages lleva el prefijo `/3maps`. Un `basePath` fijo rompería el dev local.
- El deploy es automático en cada push a `main` (`.github/workflows/deploy.yml`).

### 17. Se sacó `enablement: true` de `actions/configure-pages`
- **Por qué**: el `GITHUB_TOKEN` del workflow **no puede crear el Pages site** ("Resource not
  accessible by integration"). Pages se habilitó **a mano una vez** (Settings → Pages → Source:
  GitHub Actions). Commits `5ac0922` (lo agregó) → `e54cdc1` (lo sacó) → `11adc6f` (re-trigger ok).
- **No volver a agregarlo**: ya está habilitado, y falla el run si lo ponés.

### 18. `agentRules: false` en `next.config.ts`
- Para que `next dev` de Next 16 **no escriba reglas en `CLAUDE.md`**. Commit `d805723`.

---

## Proceso / herramientas

### 19. Sin test runner. Lógica pura → `npx --yes tsx _scratch.mts`, y borrar el scratch
- **Por qué**: fase 1, no se justifica Jest/Vitest. `tsx` resuelve imports `.ts` sin extensión
  (`node --strip-types` no). Node local es v24.
- El armado del contexto (`contexto.ts`) se validó así con 22 asserts antes de commitear.

### 20. Verificación en browser: pane integrado para **lógica/datos**, Chrome real para **render/inercia**
- El preview pane congela `requestAnimationFrame`/`ResizeObserver` y throttlea `setTimeout` → los
  nodos de React Flow quedan sin medir y los gestos sintéticos miden ~70× lento. **No es un bug
  de la app** (confirmado idéntico en commits pre-refactor). Detalle en `.claude/napkin.md`.
