# Estado del proyecto

> Snapshot para retomar rápido. Actualizar al final de cada sesión.
> Última actualización: 29-08-2026 (modelo de datos: árbol de intercambios + `.md` + persistencia).

## Dónde estamos

**Fase 1 — canvas + modelo de datos.** Todo client-side, sin IA todavía. El árbol de
intercambios es la fuente de la verdad y se persiste solo en `localStorage` como `.md`.

Repo: https://github.com/alanepazs/3maps · rama `main` · working tree limpio.
Carpeta local: `D:\IA\3maps`.

## Qué anda (verificado en el navegador)

- Canvas React Flow full-screen, tema oscuro, minimapa (arriba der.) + controles (abajo izq.).
- **Un globo = un intercambio**: pregunta (encabezado) + respuesta (cuerpo, hoy siempre
  "Respuesta pendiente"). Se busca la menor cantidad de globos.
- **Tronco vertical, ramas al costado.** Las ramas nacen a la derecha; arrastrando el globo
  ramificado a la izquierda del padre, la flecha se reconecta sola a ese lado.
- **Barra inferior**: Enter envía, Shift+Enter salto de línea. "↓ Continuar hilo" y "⑂ Ramificar"
  crean UN globo colgando del activo (sin llamada a IA).
- **Eliminar**: botón 🗑 en el globo seleccionado (no en el raíz). Borra el subárbol completo,
  con confirmación si hay descendientes.
- **Nodo activo**: click en un globo → se resalta y la barra apunta a él.
- **Envión al soltar un globo** (o un grupo): flick → sigue de largo y frena. Verificado por el
  usuario en Chrome, "quedó bien".
- **Envión al panear con la manito**: flick del fondo → el lienzo sigue de largo y frena
  (`usePanInertia`). Arreglado 29-08; verificado con A/B instrumentado (ver pendientes).
- **Modos del lienzo**: sin teclas → manito (pan) · barra espaciadora → puntero (recuadro de
  selección múltiple; después se arrastra la selección para moverla en grupo).
- **Tuerquita ⚙️** (arriba izq.): panel de ajustes. Único control hoy: slider "Envión al soltar"
  (0 = off … 2×). Se persiste en `localStorage` (`"3maps:settings"`).
- **Modelo de datos** (`src/model/`): el `arbol` de `Intercambio`s es la fuente de la verdad;
  los nodos/edges de React Flow se derivan de él (`arbolAVista`). Verificado a nivel de datos en
  el navegador integrado: crear (continuar/ramificar) con `padreId`/`rama`/posición correctos,
  borrar subárbol, mover un globo escribe la posición al árbol (`asentar`).
- **Persistencia** (`localStorage["3maps:arbol"]`, un `.md` por intercambio): sobrevive al reload,
  el árbol se reconstruye parseando los `.md`. Sin mismatch de hidratación (primer render = semilla,
  se carga lo guardado en un effect de montaje).

## Pendientes (próximos pasos)

### Interacción / UX
- [x] **Envión a la manito (pan)**: arreglado en `usePanInertia.ts`. Causa: el glide llamaba
      `setViewport()` cada frame → React Flow lo traduce a un `d3-zoom.transform()` programático
      que dispara `start`/`move`/`end` **sincrónicamente** → el `start` reentrante llegaba a
      `onMoveStart`, que hacía `cancelPanInertia()` incondicional y cortaba el envión en el primer
      frame. Fix: flag `applyingRef` que marca la reentrada; `onMoveStart`/`onMove` la ignoran.
      Verificado con A/B instrumentado en el navegador integrado (reloj estable + rAF por
      `MessageChannel` para saltear el throttling del pane): sin fix 1 frame / 12 px; con fix
      38 frames / 145 px con la dirección del flick. `tsc`+`lint` en verde. Falta el chequeo de
      "feel" en Chrome real (opcional).
- [ ] Definir qué pasa al abrir/doble-click en un globo (ver spec §14: ¿solo ese intercambio o
      transcripción de la rama?).

### Lógica
- [x] **Modelo de datos + guardado en `.md`** (fase 1 de "guardado"): `src/model/intercambio.ts`
      (tipos + funciones puras + `toMarkdown`/`parseMarkdown` + `arbolAVista`) y
      `src/model/persistencia.ts` (localStorage, un `.md` por intercambio). El `arbol` es la
      fuente de la verdad en `FlowCanvas`; los nodos/edges se derivan. Falta: export/import a
      `.zip` y carpetas reales (File System Access API) — ver abajo.
- [x] **Armar el contexto** (`src/model/contexto.ts`): `armarContexto(arbol, nodoId, opts,
      resumenViejo)` → `Mensaje[]`. Solo el camino raíz→nodo, aplanado a user/assistant, con
      ventana (últimos N completos + resumen del tramo viejo), secuencia válida para la API,
      prefijo estable para el prompt caching. `tramoAResumir` para el resumidor futuro.
      Verificado con 22 asserts. **Sin wirear todavía** — lo llama #3. Falta: generar el
      `resumenViejo` de verdad (necesita una IA barata → parte de #3).
- [ ] **Llamada real a la IA**: `llamar_ia(mensajes)` con la clave del usuario (guardada solo en
      el navegador). Arrancar con un proveedor (DeepSeek o Claude Haiku por costo). El globo
      `pending` se completa con la respuesta. **Todo listo para engancharlo:** `crearIntercambio`
      deja `respuesta: null, pending: true`, `conRespuesta` la completa, `armarContexto` arma los
      mensajes. Falta: cliente HTTP por proveedor + UI para la API key + el resumidor.
- [ ] Export/import: `.zip` de la carpeta de `.md` + carpetas reales con File System Access API,
      UI de guardar/abrir (§7). Hoy solo hay persistencia local automática.
- [ ] Embeddings locales con `transformers.js` para relevancia de contexto.
- [ ] Estado `expandido`/colapsado por globo para rendimiento con muchos nodos (§8).

### Deploy
- [ ] GitHub Pages: falta `output: "export"` + `basePath` en `next.config.ts`. React Flow anda
      con export estático (todo client-side). No configurado todavía.

## Issues conocidos / gotchas

- **Preview pane de Claude (`mcp__Claude_Browser__*`)**: `requestAnimationFrame` y
  `ResizeObserver` quedan **congelados cuando el pane está quieto**. Efecto: los nodos de
  React Flow quedan `visibility:hidden` (no se los mide) y sin nodos medidos no se dibujan los
  edges; las animaciones de envión no se ven. **No es un bug de la app** — verificado idéntico
  en el commit pre-refactor; en Chrome real anda. En sesiones con el freeze fuerte ni el
  pan/zoom real lo destraba → verificar el **render** en Chrome; en el pane verificar solo la
  **lógica/datos** (localStorage, `.textContent`, estado interno).
- **Consola del preview pane**: devuelve un log acumulado/viejo (arrastra errores de sesiones de
  HMR rotas, ej. `useMemo is not defined`). Para chequear errores frescos: hook manual sobre
  `console.error` o mirar los logs del `next dev`.
- **Timers del preview pane throttleados a ~1s** (además del freeze de `rAF`). `setTimeout(14)`
  tarda ~1000ms aunque `document.hidden` sea `false`. Efecto: cualquier gesto sintético de
  drag/flick mide velocidad ~70× más lenta y nunca cruza `FLICK_THRESHOLD` → **la inercia no se
  puede verificar en el pane**, ni siquiera con shim de `rAF`. Verificar envión/pan siempre en
  Chrome real.
- **Next 16 `agentRules`**: desactivado en `next.config.ts` para que `next dev` no escriba el
  bloque `nextjs-agent-rules` en `CLAUDE.md`.
- **Darkreader**: si está activo en `localhost` rompe la hidratación y los colores. El usuario lo
  desactiva para localhost.

## Cómo correr / verificar / publicar

```bash
cd D:\IA\3maps
npm run dev            # http://localhost:3000
npx tsc --noEmit -p tsconfig.json    # typecheck
npm run lint
```

- **Verificar en el navegador**: usar el navegador integrado (`mcp__Claude_Browser__*`), NO la
  extensión de Chrome. El integrado además ya está logueado en el GitHub del usuario (`alanepazs`).
- **Publicar cambios**: `git push` desde `D:\IA\3maps` (la credencial ya está en Windows
  Credential Manager, no pide nada). `gh` CLI NO está autenticado y `gh auth login` cuelga —
  no usarlo. Para crear repos u operar en GitHub: navegador integrado.
