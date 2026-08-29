# Napkin — 3maps

Runbook corto. Cosas que muerden si no las sabés. Leer antes de tocar.

## Entorno / herramientas

1. **Verificar en browser** → navegador integrado (`mcp__Claude_Browser__*`), NO la extensión
   de Chrome (`mcp__claude-in-chrome__*` pide plan pago). El integrado ya está logueado en el
   GitHub del usuario (`alanepazs`) — sirve para crear repos, cambiar settings, etc.
2. **El preview pane congela `requestAnimationFrame`/`ResizeObserver` y throttlea `setTimeout`
   a ~1s cuando está quieto** (aunque `document.hidden` sea `false`). Nodos nuevos de React Flow
   → `visibility:hidden` hasta un pan/zoom. Animaciones de envión → no se ven. Gestos sintéticos
   de drag/flick → miden velocidad ~70× lenta, nunca cruzan `FLICK_THRESHOLD`. **La inercia/pan
   no se puede verificar en el pane** (ni con shim de `rAF`). En Chrome real anda bien.
3. **Consola del preview pane = log viejo acumulado.** Ignora errores tipo `useMemo is not
   defined` (son de HMR roto de antes). Para errores reales: hook sobre `console.error` o
   `preview_logs` del `next dev`.
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
9. Reglas de contexto/costos de tokens en `CLAUDE.md` — no romperlas cuando se meta la IA.

## Checklist antes de cerrar sesión

10. `npx tsc --noEmit` + `npm run lint` en verde · `git push` · actualizar `docs/estado.md`.
