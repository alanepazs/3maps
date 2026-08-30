# Estado del proyecto

> Snapshot para retomar rápido. Actualizar al final de cada sesión.
> Última actualización: 29-08-2026 (fase 2.0 + 2.3 codeadas: Supabase opcional + compartir por
> link. Falta que el usuario corra `supabase/schema.sql` + cargue los GitHub secrets para probar).

## Mapa de docs

- `CLAUDE.md` — invariantes y convenciones que no se rompen.
- **este archivo** (`docs/estado.md`) — snapshot: dónde estamos, qué anda, pendientes, gotchas.
- `docs/arquitectura.md` — mapa de `src/` (qué hace cada archivo).
- `docs/decisiones.md` — por qué el código es así (decisiones de implementación + qué rompés si
  las revertís).
- `docs/spec-proyecto.md` — diseño de producto (modelo de datos, UX, roadmap, pseudocódigo).
- `docs/fase-2.md` — plan de fase 2 (Supabase, compartir, sync, proxy IA, embeddings). Borrador.
- `.claude/napkin.md` — gotchas del entorno (preview pane, git/gh, CDN de Pages).

## Dónde estamos

**Fase 1 — MVP cerrado y en producción.** Canvas de nodos + modelo de datos + **llamada real a
la IA** (Gemini free tier o Claude con billing, API key del usuario, streaming, respuestas en
markdown) + panel de transcripción de la rama + deploy estático automático a GitHub Pages. Todo
client-side, sin backend. El árbol de intercambios es la fuente de la verdad y se persiste en
`localStorage` como `.md`.

**Proveedor recomendado: Gemini** (free tier real). Claude anda pero necesita saldo. DeepSeek/GPT
esperan a fase 2 (no habilitan CORS → necesitan proxy).

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

### IA (✅ Gemini free tier probado end-to-end; Claude requiere billing)
- **Llamada real** (`src/model/ia.ts`, wired en `FlowCanvas.responder`): al enviar, el globo queda
  `pending` y la respuesta **se escribe en vivo (streaming)** con cursor ▍.
- **Contexto** = solo el camino raíz→globo (`armarContexto`), aplanado a user/assistant, con
  ventana (últimos N completos + resumen del tramo viejo vía `resumir`, cacheado por sesión).
- **Proveedores**: 
  - **Gemini (Google, `fetch` directo + SSE)**: free tier, probado end-to-end, default `gemini-3.7-flash`.
  - **Claude (Anthropic, `@anthropic-ai/sdk` dinámico)**: requiere billing (Pro o créditos en console.anthropic.com).
  
  Se eligen en ⚙️; al cambiar se resetea modelo y limpia key. **Key vive solo en navegador**, va directo al proveedor (CORS OK ambos).
  Default de Gemini = `gemini-3.7-flash` (Flash estable más nuevo, free tier), con **thinking al
  mínimo** por generación (`thinkingLevel: "low"` en 3.x, `thinkingBudget: 0` en 2.x — si no,
  devolvía respuesta vacía). Los modelos **varían por key** → botón **"verificar key y ver sus
  modelos"** en ⚙️ (`listarModelos`, Claude + Gemini; **no gasta tokens**, 401 si es inválida).
  `configIA.ts` migra al cargar solo lo retirado-para-todos + alias paid (los `2.5-*` ya NO se
  migran). Ver decisiones §7b, §8c.
- **Chequeo de formato de key** (`avisoFormatoKey`, local, gratis): aviso ámbar bajo el input si
  la key no pinta del proveedor elegido (`sk-ant-` / `AQ.`|`AIza` / `sk-`). No bloquea Guardar.
- **Respuesta en markdown** (`src/components/Markdown.tsx`): títulos, listas, código (inline y
  bloque con scroll propio), links (pestaña nueva), citas, tablas GFM. Sin HTML crudo → seguro.
- **Errores**: recuadro rojo + "↻ Reintentar" (descarta la parcial vieja). El error se persiste
  en el frontmatter del `.md` y sobrevive al reload.
- **Config en ⚙️**: proveedor (aplica al toque), API key + modelo (borradores → botón "Guardar" o
  Enter; "✓ Guardado" / "Cambios sin guardar" / "✓ Aplicado" 2s / "Borrar key"; aviso de formato),
  "verificar key y ver sus modelos" (chips; gratis), ventana de contexto (2–20),
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

### Checklist MVP fase 1 — ✅ completo

Todo lo "cerca / arranque rápido" quedó hecho (ver "Hecho el 29-08-2026" con los hashes).
Resumen de lo cerrado esta sesión: metadata de modelos + paid keys, system prompt configurable,
transcripción de la rama con toggle de lado, auto-retry de Gemini ante 503, `lang="es"`,
verificación de key gratis (`avisoFormatoKey` + `listarModelos` para Claude), prueba real de
ambos proveedores, DeepSeek/GPT diferidos a fase 2 por CORS.

### Fase 2 — 2.0 + 2.3 codeadas, falta activar
Ver **`docs/fase-2.md`**. Proyecto Supabase creado (`ref` ejecjjpdjoxgrbqrhwwd). Código listo:
`supabase.ts` (cliente opcional), `compartir.ts`, `SharedBanner`, sección Compartir en ⚙️,
modo lectura para `?compartir=<slug>`. **Falta que el usuario:**
1. Corra `supabase/schema.sql` en el SQL Editor de Supabase (crea el bucket + políticas).
2. Cargue `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` como repo secrets de GitHub.
3. Pruebe el flujo real (Generar link → abrir en otra ventana → Guardar copia).

Proxy IA (2.1, opción A stateless), auth (2.2), sync (2.4), embeddings (2.5) = tandas siguientes.

### Más adelante (fuera de fase 2)
- [ ] Export/import: `.zip` de la carpeta de `.md` + carpetas reales con File System Access API,
      UI de guardar/abrir (§7). Hoy solo hay persistencia local automática.
- [ ] Estado `expandido`/colapsado por globo para rendimiento con muchos nodos (§8).
- [ ] **Auto-SWITCH de proveedor por formato de key** (UX): hoy `avisoFormatoKey` solo avisa en
      ámbar. Falta: al pegar una key que pinta de otro proveedor, ofrecer/cambiar el proveedor solo.
- [ ] Modelos locales tipo Ollama para tareas internas (§10) — fase 3.

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
- [x] `lang="es"` en `layout.tsx` — `25fbbf0`.
- [x] DeepSeek/GPT diferidos a fase 2 (CORS, sin proxy no se puede) — `a44f1dc`.
- [x] Prueba real Claude: conecta OK, requiere billing. Gemini = proveedor free — `42254f5`.
- [x] Toggle de lado del panel de transcripción + verificación de key gratis
      (`avisoFormatoKey` + `listarModelos` para Claude) — `4b0dc55`.
- [x] Plan de fase 2 (`docs/fase-2.md`) + decisiones — `1152d81`.
- [x] Fase 2.0: fundaciones Supabase (cliente opcional + schema + workflow) — `76758d3`.
- [x] Fase 2.3: compartir un árbol por link (código; falta activar) — `51dc403`.

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

- **`.env.local`** (gitignoreado) tiene `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  para el backend de fase 2. Sin ese archivo, `npm run dev` corre igual pero sin la parte de
  compartir. En prod las mismas van como repo secrets de GitHub Actions.

- **Verificar en el navegador**: navegador integrado (`mcp__Claude_Browser__*`), NO la extensión
  de Chrome. El login a GitHub del integrado es **intermitente** — para CI usar la API pública
  (`api.github.com/repos/alanepazs/3maps/...`).
- **Probar lógica pura (sin runner)**: `npx --yes tsx _scratch.mts`, y borrar el scratch.
- **Publicar código**: `git push` desde `D:\IA\3maps` (credencial en Windows Credential Manager).
  `gh` CLI NO está autenticado — no usarlo.
- **Deploy a Pages**: automático en cada push a `main`. Pages ya está habilitado en el repo.
