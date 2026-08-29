# Napkin — 3maps

Runbook corto. Cosas que muerden si no las sabés. Leer antes de tocar.

## Entorno / herramientas

1. **Verificar en browser** → navegador integrado (`mcp__Claude_Browser__*`), NO la extensión
   de Chrome (`mcp__claude-in-chrome__*` pide plan pago). El integrado ya está logueado en el
   GitHub del usuario (`alanepazs`) — sirve para crear repos, cambiar settings, etc.
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

## Proyecto

5. Carpeta local `D:\IA\3maps`. Repo `github.com/alanepazs/3maps`. Rama `main`.
6. **Antes de codear leé**: `CLAUDE.md`, `docs/estado.md`, `docs/arquitectura.md`,
   `docs/spec-proyecto.md`. No hace falta leer todo `src/`.
7. `next.config.ts` tiene `agentRules: false` (que Next no escriba en CLAUDE.md) y
   `devIndicators.position: "bottom-right"` (que el indicador no tape la tuerquita).
8. **Un globo = un intercambio** (pregunta + respuesta), no un mensaje suelto. No volver al
   modelo de nodo-por-mensaje.
9. Reglas de contexto/costos de tokens en `CLAUDE.md` — ya implementadas en
   `src/model/contexto.ts` (`armarContexto`). Al meter la IA, usar eso, no rearmar el contexto
   a mano ni mandar el árbol entero.
10. **El `arbol` de `src/model/intercambio.ts` es la fuente de la verdad.** Los nodos/edges de
    React Flow se DERIVAN (`arbolAVista`) — nunca guardar estado propio en `data` de un nodo ni
    tratar a React Flow como el store. Toda mutación pasa por `setArbol` con funciones puras del
    modelo. Posiciones vuelven al árbol en `asentar` (al soltar), no en cada frame.
11. **SSR / hidratación**: `FlowCanvas` arranca con la **semilla** (determinística) y carga
    `localStorage` en un `useEffect` de montaje. NO leer `localStorage` durante el render
    (rompe la hidratación). El `.md` de ejemplo usa ids `nodo-ejemplo-*` y fechas fijas.
12. **No hay test runner.** Para probar lógica pura: `npx --yes tsx _scratch.mts` (tsx resuelve
    imports `.ts` sin extensión; `node --strip-types` no). Borrar el scratch antes de commitear.
    Node local es v24.

## Checklist antes de cerrar sesión

13. `npx tsc --noEmit` + `npm run lint` en verde · `git push` · actualizar `docs/estado.md`.
