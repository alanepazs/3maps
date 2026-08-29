# Estado del proyecto

> Snapshot para retomar rápido. Actualizar al final de cada sesión.
> Última actualización: 29-08-2026 (llamada real a la IA con streaming + deploy a GitHub Pages).

## Dónde estamos

**Fase 1 — MVP funcional.** Canvas + modelo de datos + **llamada real a la IA** (Claude, con la
API key del usuario, streaming) + deploy estático a GitHub Pages. Todo client-side. El árbol de
intercambios es la fuente de la verdad y se persiste en `localStorage` como `.md`.

Repo: https://github.com/alanepazs/3maps · rama `main`.
Carpeta local: `D:\IA\3maps`.
**URL de Pages (cuando el workflow corra): `https://alanepazs.github.io/3maps/`.**

## Qué anda (verificado en el navegador)

- Canvas React Flow full-screen, tema oscuro, minimapa (arriba der.) + controles (abajo izq.).
- **Un globo = un intercambio**: pregunta (encabezado) + respuesta (cuerpo, hoy siempre
  "Respuesta pendiente"). Se busca la menor cantidad de globos.
- **Tronco vertical, ramas al costado.** Las ramas nacen a la derecha; arrastrando el globo
  ramificado a la izquierda del padre, la flecha se reconecta sola a ese lado.
- **Barra inferior**: Enter envía, Shift+Enter salto de línea. "↓ Continuar hilo" y "⑂ Ramificar"
  crean UN globo colgando del activo **y le piden la respuesta a la IA**.
- **Llamada real a la IA** (`src/model/ia.ts`): al enviar, el globo queda `pending` y la respuesta
  **se escribe en vivo (streaming)** con un cursor ▍. Contexto = solo el camino raíz→globo
  (`armarContexto`), con ventana + resumen del tramo viejo. Proveedor: Claude (Anthropic), vía
  `@anthropic-ai/sdk` dinámico. **La API key vive solo en el navegador** y se manda directo a
  `api.anthropic.com` (CORS ok). Verificado end-to-end con un stub de SSE (streaming + contexto
  correctos) y con una key trucha (llega el 401 real → "API key inválida"). Falta que el usuario
  pruebe con su key real.
- **Errores de la IA**: recuadro rojo en el globo + botón "↻ Reintentar" (descarta la respuesta
  parcial vieja). El error se persiste en el frontmatter del `.md` y sobrevive al reload.
- **Config de IA en ⚙️**: proveedor (select), API key (password), modelo (con sugeridos), y
  "Ventana de contexto" (2–20 intercambios). Persiste en `localStorage["3maps:ia"]`.
- **Eliminar**: botón 🗑 en el globo seleccionado (no en el raíz). Borra el subárbol completo,
  con confirmación si hay descendientes. Corta las llamadas a la IA en vuelo de lo que se borra.
- **Nodo activo**: click en un globo → se resalta y la barra apunta a él.
- **Envión al soltar un globo** (o un grupo): flick → sigue de largo y frena. Verificado por el
  usuario en Chrome, "quedó bien".
- **Envión al panear con la manito**: flick del fondo → el lienzo sigue de largo y frena
  (`usePanInertia`). Arreglado 29-08; verificado con A/B instrumentado (ver pendientes).
- **Modos del lienzo**: sin teclas → manito (pan) · barra espaciadora → puntero (recuadro de
  selección múltiple; después se arrastra la selección para moverla en grupo).
- **Tuerquita ⚙️** (arriba izq.): panel de ajustes (lienzo + IA). Se persiste en
  `localStorage` (`"3maps:settings"` y `"3maps:ia"`).
- **Deploy a GitHub Pages**: `output: "export"` + `basePath: /3maps` (solo en el build de Pages) +
  workflow `.github/workflows/deploy.yml`. Verificado: `npm run build` genera `out/`, servido bajo
  `/3maps/` la app carga entera (seed, panel, y el chunk dinámico del SDK) sin 404. **Falta
  habilitar Pages en el repo (Settings → Pages → Source: GitHub Actions) — one-time.**
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
      prefijo estable para el prompt caching. `tramoAResumir` para el resumidor. 22 asserts.
- [x] **Llamada real a la IA** (`src/model/ia.ts` + `configIA.ts`, wired en `FlowCanvas.responder`):
      `llamarIA(config, mensajes, opts)` con streaming, un proveedor (Claude vía `@anthropic-ai/sdk`
      dinámico), API key solo en el navegador. `resumir()` genera el `resumenViejo` (cacheado por
      sesión). UI en ⚙️. Errores legibles + reintento. Verificado con stub SSE + key trucha.
      **Falta: probar con la key real del usuario. Falta: 2º proveedor (DeepSeek), y system prompt
      configurable.**
- [ ] Export/import: `.zip` de la carpeta de `.md` + carpetas reales con File System Access API,
      UI de guardar/abrir (§7). Hoy solo hay persistencia local automática.
- [ ] Markdown renderizado en la respuesta (hoy es texto plano con `whitespace-pre-wrap`). El
      `.md` ya guarda/parsea respuestas con `## títulos` correctamente (error va en frontmatter).
- [ ] Embeddings locales con `transformers.js` para relevancia de contexto.
- [ ] Estado `expandido`/colapsado por globo para rendimiento con muchos nodos (§8).

### Deploy
- [x] **GitHub Pages**: `output: "export"` + `basePath` condicional en `next.config.ts` +
      `.github/workflows/deploy.yml`. En CI **`npm ci` y `next build` pasan** (confirmado por API
      de Actions); el `out/` servido bajo `/3maps/` carga la app entera sin 404.
      **BLOQUEADO en `actions/configure-pages`**: el repo tiene `has_pages: false` y el
      `enablement: true` no alcanzó (el GITHUB_TOKEN no tiene permiso para crear el sitio).
      **Lo tiene que hacer el usuario (necesita su login):** repo → Settings → Pages → Source =
      "GitHub Actions" (y si hace falta, Settings → Actions → General → Workflow permissions →
      "Read and write"). Después: re-run del workflow fallado, o cualquier push a `main`.

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
npm run dev            # http://localhost:3000  (sin basePath)
npx tsc --noEmit -p tsconfig.json    # typecheck
npm run lint
npm run build          # genera out/ (estático). Con NEXT_PUBLIC_PAGES=1 → basePath /3maps
```

- **Verificar en el navegador**: usar el navegador integrado (`mcp__Claude_Browser__*`), NO la
  extensión de Chrome. El integrado además ya está logueado en el GitHub del usuario (`alanepazs`).
- **Probar lógica pura (sin runner)**: `npx --yes tsx _scratch.mts` y borrar el scratch.
- **Publicar código**: `git push` desde `D:\IA\3maps` (credencial en Windows Credential Manager).
  `gh` CLI NO está autenticado — no usarlo. Para operar en GitHub: navegador integrado.
- **Deploy a Pages**: automático en cada push a `main` (workflow). One-time: habilitar
  Settings → Pages → Source = "GitHub Actions" en el repo (navegador integrado).
