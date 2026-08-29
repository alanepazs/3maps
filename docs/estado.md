# Estado del proyecto

> Snapshot para retomar rápido. Actualizar al final de cada sesión.
> Última actualización: 29-08-2026 (MVP funcional: IA con streaming + markdown + deploy live).

## Dónde estamos

**Fase 1 — MVP funcional y en producción.** Canvas de nodos + modelo de datos + **llamada real a
la IA** (Claude, con la API key del usuario, streaming, respuestas en markdown) + deploy estático
automático a GitHub Pages. Todo client-side, sin backend. El árbol de intercambios es la fuente
de la verdad y se persiste en `localStorage` como `.md`.

Repo: https://github.com/alanepazs/3maps · rama `main`.
Carpeta local: `D:\IA\3maps`.
**App en producción: https://alanepazs.github.io/3maps/** — deploy automático en cada push a `main`.

## Qué anda

### Canvas / interacción (verificado en Chrome real)
- Canvas React Flow full-screen, tema oscuro, minimapa (arriba der.) + controles (abajo izq.).
- **Un globo = un intercambio**: pregunta (encabezado) + respuesta (cuerpo). Se busca la menor
  cantidad de globos.
- **Tronco vertical, ramas al costado.** Las ramas nacen a la derecha; arrastrando el globo
  ramificado a la izquierda del padre, la flecha se reconecta sola a ese lado (`asentar`).
- **Barra inferior**: Enter envía, Shift+Enter salto de línea. "↓ Continuar hilo" y "⑂ Ramificar"
  crean UN globo colgando del activo y le piden la respuesta a la IA.
- **Eliminar**: botón 🗑 en el globo seleccionado (no en el raíz). Borra el subárbol completo con
  confirmación si hay descendientes; corta las llamadas a la IA en vuelo de lo que se borra.
- **Nodo activo**: click en un globo → se resalta y la barra apunta a él.
- **Envión al soltar un globo** (o un grupo): flick → sigue de largo y frena. "Quedó bien".
- **Envión al panear con la manito**: flick del fondo → el lienzo sigue de largo y frena
  (`usePanInertia`, arreglado esta sesión — ver commit `ff595e3`).
- **Modos del lienzo**: sin teclas → manito (pan) · barra espaciadora → puntero (recuadro de
  selección múltiple; después se arrastra la selección para moverla en grupo).
- **Tuerquita ⚙️**: panel de ajustes (lienzo + IA). Persiste en `localStorage`
  (`"3maps:settings"` y `"3maps:ia"`).

### IA (verificado con stub SSE + key trucha — falta prueba con key real)
- **Llamada real** (`src/model/ia.ts`, wired en `FlowCanvas.responder`): al enviar, el globo queda
  `pending` y la respuesta **se escribe en vivo (streaming)** con cursor ▍.
- **Contexto** = solo el camino raíz→globo (`armarContexto`), aplanado a user/assistant, con
  ventana (últimos N completos + resumen del tramo viejo vía `resumir`, cacheado por sesión).
- **Proveedor**: Claude (Anthropic), vía `@anthropic-ai/sdk` importado dinámicamente. **La API
  key vive solo en el navegador** y va directo a `api.anthropic.com` (CORS ok).
- **Respuesta en markdown** (`src/components/Markdown.tsx`): títulos, listas, código (inline y
  bloque con scroll propio), links (pestaña nueva), citas, tablas GFM. Sin HTML crudo → seguro.
- **Errores**: recuadro rojo + "↻ Reintentar" (descarta la parcial vieja). El error se persiste
  en el frontmatter del `.md` y sobrevive al reload.
- **Config en ⚙️**: proveedor, API key (password), modelo (con sugeridos), ventana de contexto (2–20).

### Datos / persistencia (verificado a nivel de datos)
- El `arbol` de `Intercambio`s es la fuente de la verdad; los nodos/edges de React Flow se
  derivan (`arbolAVista`). Crear/ramificar/borrar/mover escriben al árbol.
- `localStorage["3maps:arbol"]` = un string `.md` por intercambio. Sobrevive al reload
  (se reconstruye parseando los `.md`). Sin mismatch de hidratación (primer render = semilla
  determinística, se carga lo guardado en un effect de montaje).

### Deploy (LIVE)
- `output: "export"` + `basePath: /3maps` (solo si `NEXT_PUBLIC_PAGES=1`) + workflow
  `.github/workflows/deploy.yml`. Cada push a `main` deploya. Verificado en producción: la app
  carga entera sin 404 (incluye el chunk dinámico del SDK y react-markdown).

## Pendientes (próximos pasos)

### Cerca / arranque rápido
- [ ] **Chequeo visual + prueba real de la IA**: cargar la API key propia en ⚙️ y mandar una
      pregunta de verdad; mirar cómo se ve el markdown en un globo con una respuesta real.
- [ ] **2º proveedor** (DeepSeek u otro): agregar un `case` en `llamarIA` (`src/model/ia.ts`).
      Ojo CORS: no todos los proveedores permiten llamadas directas desde el navegador.
- [ ] **System prompt configurable** (hoy no hay). Sumar a `Settings` + pasarlo a `llamarIA`.
- [ ] Definir qué pasa al abrir/doble-click en un globo (spec §14: ¿solo ese intercambio o
      transcripción de la rama?).

### Más adelante
- [ ] Export/import: `.zip` de la carpeta de `.md` + carpetas reales con File System Access API,
      UI de guardar/abrir (§7). Hoy solo hay persistencia local automática.
- [ ] Embeddings locales con `transformers.js` para relevancia de contexto (§5).
- [ ] Estado `expandido`/colapsado por globo para rendimiento con muchos nodos (§8).
- [ ] `lang="es"` en `layout.tsx` (está en `"en"`).

### Hecho esta sesión (29-08-2026)
- [x] Fix del envión al panear (`usePanInertia`) — `ff595e3`.
- [x] Modelo de datos: árbol de intercambios + `.md` + persistencia — `46f36c5`.
- [x] Armado del contexto (`src/model/contexto.ts`, 22 asserts) — `c9415a1`.
- [x] Llamada real a la IA con streaming — `26bc339`.
- [x] Deploy a GitHub Pages — `2c68326` (+ fixes); LIVE tras habilitar Pages a mano.
- [x] Markdown renderizado en las respuestas — `07f28ef`.

## Issues conocidos / gotchas

- **Preview pane de Claude (`mcp__Claude_Browser__*`)**: `requestAnimationFrame` y `ResizeObserver`
  quedan **congelados cuando el pane está quieto**, y `setTimeout` throttlea a ~1s. Efecto: los
  nodos de React Flow quedan `visibility:hidden` (no se los mide) → sin nodos medidos no se dibujan
  edges ni se ven las animaciones; gestos sintéticos de drag/flick miden velocidad ~70× lenta.
  **No es un bug de la app.** En el pane verificar solo **lógica/datos** (localStorage,
  `.textContent`, estado interno, stub de red). El **render y la inercia** se verifican en Chrome
  real. Confirmado idéntico en commits pre-refactor.
- **Consola del preview pane = log viejo acumulado** (HMR roto arrastra errores con nros de línea
  que ya no matchean). Errores frescos: `preview_logs` del `next dev` reiniciado, o el overlay de
  Next (`nextjs-portal` shadow DOM → `div[role=dialog]`).
- **CDN de GitHub Pages cachea `index.html`** ~10 min. Para verificar un deploy nuevo enseguida:
  navegar con `?v=<algo>` (cache-buster).
- **Next 16 `agentRules`**: desactivado en `next.config.ts` (que `next dev` no escriba en CLAUDE.md).
- **Darkreader**: si está activo en `localhost` rompe la hidratación y los colores. Desactivarlo
  para localhost.

## Cómo correr / verificar / publicar

```bash
cd D:\IA\3maps
npm run dev            # http://localhost:3000  (sin basePath)
npx tsc --noEmit -p tsconfig.json    # typecheck
npm run lint
npm run build          # genera out/ (estático). Con NEXT_PUBLIC_PAGES=1 → basePath /3maps
```

- **Verificar en el navegador**: navegador integrado (`mcp__Claude_Browser__*`), NO la extensión
  de Chrome. El login a GitHub del integrado es **intermitente** — para CI usar la API pública
  (`api.github.com/repos/alanepazs/3maps/...`).
- **Probar lógica pura (sin runner)**: `npx --yes tsx _scratch.mts`, y borrar el scratch.
- **Publicar código**: `git push` desde `D:\IA\3maps` (credencial en Windows Credential Manager).
  `gh` CLI NO está autenticado — no usarlo.
- **Deploy a Pages**: automático en cada push a `main`. Pages ya está habilitado en el repo.
