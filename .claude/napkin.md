# Napkin — 3maps

Runbook corto. Cosas que muerden si no las sabés. Leer antes de tocar.

## Entorno / herramientas

1. **Verificar en browser** → navegador integrado (`mcp__Claude_Browser__*`), NO la extensión
   de Chrome (`mcp__claude-in-chrome__*` pide plan pago). El login a GitHub en el integrado
   **es intermitente** — a veces está logueado como `alanepazs`, a veces no. Para leer estado
   de CI sin login: API pública. Anotaciones de error de un run:
   `api.github.com/repos/alanepazs/3maps/check-runs/<check_id>/annotations` (el `check_id` sale
   de `.../commits/<sha>/check-runs`). Cambiar Settings del repo requiere que lo haga el usuario.
2. **El preview pane congela `requestAnimationFrame`/`ResizeObserver` y throttlea `setTimeout`
   a ~1s cuando está quieto** (aunque `document.hidden` sea `false`). Los nodos de React Flow
   quedan `visibility:hidden` (no se miden) → sin medición no se dibujan los edges → el canvas
   se ve "vacío". Gestos sintéticos de drag/flick miden velocidad ~70× lenta, nunca cruzan
   `FLICK_THRESHOLD`. **En el pane verificá solo lógica/datos** (localStorage, `.textContent`,
   estado interno, `arbolAVista`). **El render y la inercia se verifican en Chrome real.**
   Confirmado que NO es regresión: mismo comportamiento en el commit pre-cambio.
3. **Consola del preview pane = log viejo acumulado** (HMR roto arrastra errores viejos con
   nros de línea que ya no matchean). Para errores frescos: `preview_logs` del `next dev`
   reiniciado, o el overlay de error de Next (`nextjs-portal` shadow DOM → `div[role=dialog]`).
   Un `arbolInicial is not defined` / dep-array que cambia de tamaño suele ser HMR entre edits,
   no un bug de fresh-load — reiniciá el server para confirmar.
4. **Publicar**: `git push` desde `D:\IA\3maps` funciona directo (credencial en Windows
   Credential Manager). **`gh` NO está autenticado y `gh auth login` cuelga** — no lo uses.
   Deploy a Pages = push a `main` (workflow). **El CDN de Pages cachea `index.html` ~10 min**:
   para verificar un deploy nuevo enseguida, navegá con `?v=<algo>` (cache-buster).

## Proyecto

5. Carpeta local `D:\IA\3maps`. Repo `github.com/alanepazs/3maps`. Rama `main`.
6. **Antes de codear leé** (orden en `CLAUDE.md`): `docs/estado.md`, `docs/arquitectura.md`,
   este archivo, `docs/decisiones.md`. `docs/historia.md` (qué shippeó cada fase) y
   `docs/spec-proyecto.md` solo si hace falta. No leas todo `src/`.
6a. **agent-skills (IMPERATIVO, ver CLAUDE.md)**: las 25 skills viven en `.claude/skills/` pero
   están **gitignoreadas** — un clon nuevo NO las trae. Restaurar:
   `git clone --depth 1 https://github.com/addyosmani/agent-skills /tmp/as && cp -r /tmp/as/{skills,references,agents} .claude/`
   (+ convertir `commands/*.toml` a `.md`). Se descubren al reiniciar la sesión de Claude Code.
6b. **Grafo de conocimiento (`graphify-out/`, gitignoreado, local)**: antes de abrir varios
   archivos de `src/` para entender una dependencia, probá `graphify query "<pregunta>"` desde
   `D:\IA\3maps` — devuelve el subgrafo con `archivo:línea` de qué llama a qué. El intérprete está
   en `graphify-out\.graphify_python`. Regenerar tras cambios de estructura: `graphify --update`.
   `graph.html` y `obsidian/` son para mirar a ojo. El corpus es chico (~6k líneas de `src/`) →
   para un dato puntual conviene leer el archivo directo; el grafo gana cuando la pregunta cruza
   varios módulos.
7. `next.config.ts`: `agentRules: false` (que Next no escriba en CLAUDE.md), `devIndicators`
   abajo-derecha, `output: "export"`, y `basePath: /3maps` **solo si `NEXT_PUBLIC_PAGES=1`**
   (el workflow de Pages lo setea; `next dev` local queda en la raíz). Deploy = push a `main`.
8. **Un globo = un intercambio** (pregunta + respuesta), no un mensaje suelto. No volver al
   modelo de nodo-por-mensaje.
9. Reglas de contexto/costos de tokens en `CLAUDE.md` — implementadas en
   `src/model/contexto.ts` (`armarContexto`). No rearmar el contexto a mano ni mandar el árbol
   entero. La llamada a la IA es `src/model/ia.ts` (`llamarIA`), wired en `FlowCanvas.responder`.
   **La API key va directo del navegador al proveedor**, nunca a un server propio. Proveedores:
   Claude (`@anthropic-ai/sdk` dinámico) y Gemini (`fetch` + SSE, sin SDK — su CORS anda desde
   el navegador). Sumar otro = un `case` en `llamarIA` + entradas en los `Record<Proveedor,...>`.
10. **El `arbol` de `src/model/intercambio.ts` es la fuente de la verdad.** Los nodos/edges de
    React Flow se DERIVAN (`arbolAVista`) — nunca guardar estado propio en `data` de un nodo ni
    tratar a React Flow como el store. Toda mutación pasa por `setArbol` con funciones puras del
    modelo. Posiciones vuelven al árbol en `asentar` (al soltar), no en cada frame.
11. **SSR / hidratación**: `FlowCanvas` arranca con la **semilla** (`arbolInicial()` = `{ intercambios: [] }`,
    árbol vacío, determinística) y carga `localStorage` en un `useEffect` de montaje. NO leer
    `localStorage` ni `window.*` durante el render (rompe la hidratación). El primer submit del
    `Composer` crea la raíz. `mapas`/`settings`/`configIA` arrancan en valores neutros y se
    pueblan en effects de montaje por la misma razón.
12. **Formato `.md`** (`toMarkdown`/`parseMarkdown`): el `error` va en el **frontmatter** como
    JSON en una línea, NO como sección del cuerpo — así la respuesta (markdown de la IA) puede
    tener sus propios `## títulos` sin romper el parseo. La respuesta es todo lo que hay después
    de `## Respuesta` hasta el final.
13. **No hay test runner.** Para probar lógica pura: `npx --yes tsx _scratch.mts` (tsx resuelve
    imports `.ts` sin extensión; `node --strip-types` no). Borrar el scratch antes de commitear.
    Node local es v24.
14. **Probar la IA sin key**: stubear `window.fetch` para `api.anthropic.com/v1/messages` y
    devolver un `ReadableStream` con eventos SSE (`message_start` / `content_block_delta`
    text_delta / `message_stop`). Así se verifica streaming + contexto + render sin gastar tokens.

## Checklist antes de cerrar sesión

15. `npx tsc --noEmit` + `npm run lint` en verde · `git push` · actualizar `docs/estado.md`.
