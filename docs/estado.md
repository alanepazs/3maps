# Estado del proyecto

> Snapshot para retomar rápido. Actualizar al final de cada sesión.
> Última actualización: 29-08-2026 (system prompt + transcripción de rama + auto-retry Gemini;
> DeepSeek/GPT diferidos a fase 2 por CORS).

## Mapa de docs

- `CLAUDE.md` — invariantes y convenciones que no se rompen.
- **este archivo** (`docs/estado.md`) — snapshot: dónde estamos, qué anda, pendientes, gotchas.
- `docs/arquitectura.md` — mapa de `src/` (qué hace cada archivo).
- `docs/decisiones.md` — por qué el código es así (decisiones de implementación + qué rompés si
  las revertís).
- `docs/spec-proyecto.md` — diseño de producto (modelo de datos, UX, roadmap, pseudocódigo).
- `.claude/napkin.md` — gotchas del entorno (preview pane, git/gh, CDN de Pages).

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

### IA (✅ Gemini andando end-to-end con key real free tier; Claude aún con stub SSE + key trucha)
- **Llamada real** (`src/model/ia.ts`, wired en `FlowCanvas.responder`): al enviar, el globo queda
  `pending` y la respuesta **se escribe en vivo (streaming)** con cursor ▍.
- **Contexto** = solo el camino raíz→globo (`armarContexto`), aplanado a user/assistant, con
  ventana (últimos N completos + resumen del tramo viejo vía `resumir`, cacheado por sesión).
- **Proveedores**: Claude (Anthropic, `@anthropic-ai/sdk` dinámico) y **Gemini (Google, `fetch`
  directo + SSE, tiene free tier)**. Se eligen en ⚙️; al cambiar se resetea el modelo y se limpia
  la key. **La API key vive solo en el navegador** y va directo al proveedor (CORS de ambos ok).
  Default de Gemini = `gemini-3.7-flash` (Flash estable más nuevo, free tier), con **thinking al
  mínimo** por generación (`thinkingLevel: "low"` en 3.x, `thinkingBudget: 0` en 2.x — si no,
  devolvía respuesta vacía). Los modelos **varían por key** → botón **"ver modelos disponibles"**
  en ⚙️ (`listarModelos`, GET `/v1beta/models` con la key propia → chips). `configIA.ts` migra al
  cargar solo lo retirado-para-todos + alias paid (los `2.5-*` ya NO se migran). Ver decisiones §7b.
- **Respuesta en markdown** (`src/components/Markdown.tsx`): títulos, listas, código (inline y
  bloque con scroll propio), links (pestaña nueva), citas, tablas GFM. Sin HTML crudo → seguro.
- **Errores**: recuadro rojo + "↻ Reintentar" (descarta la parcial vieja). El error se persiste
  en el frontmatter del `.md` y sobrevive al reload.
- **Config en ⚙️**: proveedor (aplica al toque), API key + modelo (borradores → botón "Guardar" o
  Enter; "✓ Guardado" / "Cambios sin guardar" / "✓ Aplicado" 2s / "Borrar key"),
  "ver modelos disponibles" (chips con los modelos de tu key), ventana de contexto (2–20),
  **instrucción de sistema** (textarea opcional; se antepone a cada pregunta, no al resumen).

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
- [x] **Prueba real de la IA — Gemini**: key free tier real (`AQ.…`) + `gemini-3.6-flash` →
      respuesta + streaming + markdown en el globo, perfecto. (29-08-2026)
- [ ] **Prueba real de la IA — Claude**: falta hacer lo mismo con una key `sk-ant-…` real.
- [x] **2º proveedor: Gemini** (`llamarGemini` en `src/model/ia.ts`, `fetch` + SSE). Andando con
      key real. Free tier = solo modelos 3.x (ver decisiones §7b).
- [x] **UX del botón "Guardar" key**: al guardar muestra "✓ Aplicado" 2s + hint "Config aplicada.
      Ya podés mandar una pregunta." antes de volver a "✓ Guardado".
- [x] **Metadata de modelos al día + paid keys** (29-08-2026): default Gemini `gemini-3.7-flash`,
      sugeridos 3.x; `deepseek`/`gpt` con IDs actuales (`deepseek-v4-flash`, `gpt-5.4-mini`);
      placeholder de key Gemini `AQ.…`; `MODELOS_MUERTOS` ya no migra los `2.5-*` (los desbloquea
      para keys con billing); `mensajeErrorGemini` mapea `401 ACCESS_TOKEN_TYPE_UNSUPPORTED`.
- [x] **System prompt configurable** (29-08-2026): `Settings.systemPrompt` (textarea en ⚙️,
      persiste como el resto de `Settings`); `FlowCanvas.responder` lo pasa como `opts.sistema` a
      `llamarIA` (Claude `system` / Gemini `systemInstruction`). NO se aplica a `resumir()`.
- [x] **Abrir un globo → transcripción de la rama** (29-08-2026): panel lateral read-only
      (`BranchTranscript.tsx`) con el camino raíz→globo (`caminoRaizA`) tipo chat. Trigger: doble
      click (`onNodeDoubleClick` + `zoomOnDoubleClick={false}`) o botón ⤢ del `NodeToolbar` (que
      ahora aparece también en el raíz, solo con ⤢). Cierra con Esc / ✕ / fondo.
- [x] Auto-retry en `llamarGemini` para 503 intermitentes (29-08-2026): 1 reintento con 1s de
      pausa, solo si no se streameó nada. `llamarGemini` = wrapper, `intentarGemini` = el trabajo.
      Ver decisiones §7c. Probado con 5 asserts (scratch, borrado).

### Más adelante
- [ ] Export/import: `.zip` de la carpeta de `.md` + carpetas reales con File System Access API,
      UI de guardar/abrir (§7). Hoy solo hay persistencia local automática.
- [ ] Embeddings locales con `transformers.js` para relevancia de contexto (§5).
- [ ] Estado `expandido`/colapsado por globo para rendimiento con muchos nodos (§8).
- [ ] `lang="es"` en `layout.tsx` (está en `"en"`).
- [ ] **Adaptador OpenAI-compat (DeepSeek + GPT) — FASE 2**: `api.openai.com` y `api.deepseek.com`
      no habilitan CORS → no se puede llamar desde el navegador. Necesita el proxy de fase 2
      (edge function que ponga la key server-side). Ver decisiones §7a.

### Hecho el 29-08-2026
- [x] Fix del envión al panear (`usePanInertia`) — `ff595e3`.
- [x] Modelo de datos: árbol de intercambios + `.md` + persistencia — `46f36c5`.
- [x] Armado del contexto (`src/model/contexto.ts`, 22 asserts) — `c9415a1`.
- [x] Llamada real a la IA con streaming — `26bc339`.
- [x] Deploy a GitHub Pages — `2c68326` (+ fixes); LIVE tras habilitar Pages a mano.
- [x] Markdown renderizado en las respuestas — `07f28ef`.
- [x] Gemini como 2º proveedor (`fetch` + SSE, sin SDK) + saga API renovada — `6cc38e6`.
- [x] Metadata de modelos al día + desbloquear paid keys de Gemini — `44bd8fb`.
- [x] System prompt configurable (`Settings.systemPrompt`) — `43ed0bf`.
- [x] Auto-retry de `llamarGemini` ante 503 (1 reintento, 1s) — `780e5fb`.
- [x] Abrir un globo -> panel de transcripcion de la rama (`BranchTranscript`) — `da7a339`.

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
