# Estado — 3maps

> Snapshot para retomar. Solo **dónde estamos + qué falta + gotchas**. El historial va en git
> (`git log`) y en `docs/historia.md`; el "qué hace cada archivo" en `docs/arquitectura.md`.
> Última actualización: 31-08-2026.

## Dónde estamos

**Fase 1 + 2 + 3 shippeadas y en producción.** `https://alanepazs.github.io/3maps/`
(deploy automático en cada push a `main`). Repo `github.com/alanepazs/3maps`, local `D:\IA\3maps`.

- **Canvas** (React Flow): árbol de globos, tronco vertical + ramas al costado, envión al soltar,
  2 modos (manito / selección con barra espaciadora), redimensionar globo y panel, auto-layout
  ("▤ Ordenar"), varios mapas, esconder la barra de chat. El `arbol` de `Intercambio`s es la
  fuente de la verdad; la vista de React Flow se deriva.
- **IA** (`model/ia.ts`, wired en `FlowCanvas.responder`): streaming, contexto = solo el camino
  raíz→globo con ventana + resumen. **9 proveedores**: Gemini + Claude directos del navegador;
  DeepSeek, GPT, Groq, Cerebras, OpenRouter, Mistral, HuggingFace vía el edge function `ia-proxy`
  (opt-in "usar proxy" en ⚙️). Una key/modelo por proveedor, atadas a la cuenta.
  **Solo Gemini tiene free tier real probado end-to-end.**
- **Backend opcional** (Supabase, `ref` ejecjjpdjoxgrbqrhwwd): login Google/magic-link, compartir
  árbol por link (`?compartir=<slug>`), "mis árboles" + despublicar, sync entre dispositivos.
  Sin las env `NEXT_PUBLIC_SUPABASE_*` la app es 100% local.
- **Persistencia**: `localStorage["3maps:arbol:<mapId>"]` = un string `.md` por intercambio.
  Prefs de vista en `"3maps:vista"`, ajustes en `"3maps:settings"`, IA en `"3maps:ia"`.

## Qué falta

### Sync entre dispositivos — arreglado 31-08-2026, falta probar
- **La lista de mapas no sincronizaba** (bug reportado): índice `_mapas.json` se pisaba entre
  dispositivos + `.download()` servía versión cacheada. Fix: descubrir mapas por
  `storage.list()`, unión al subir el índice, signed URL + `no-store` al bajar, re-sync al volver
  a foco. Decisiones F3-4.
- **Keys/modelos ahora SÍ sincronizan** (`sync/<uid>/config.json`, bucket privado del usuario,
  RLS por cuenta). Relaja la invariante de CLAUDE.md — decisión del usuario. Decisiones §9.
- **Falta probar con 2 dispositivos logueados con la misma cuenta.** Las prefs de vista
  (`"3maps:vista"`: colapsado/tamaño) siguen sin sincronizar (a propósito — son per-navegador).

### Prueba real (la hace el usuario, con key/login)
- Los 7 proveedores vía proxy con una key real (Groq/Cerebras = mejores free tier).
- El atajo Ctrl+Enter (ramifica) en Chrome real.
- Resize de globo (3.10) y de panel (3.11) + fixes de móvil (3.13) en Chrome y celu.
- Que el watchdog de 45s no corte un stream lento-pero-vivo.

### Opcionales (no bloquean)
- **Auto-switch de proveedor** al pegar una key de otro (hoy `avisoFormatoKey` solo avisa en ámbar).
- **Export/import** `.zip` de la carpeta de `.md` + File System Access API (spec §7). Hoy solo hay
  persistencia local automática.
- **2.5b — embeddings** (`transformers.js`) si el match por palabras clave (`intercambiosRelevantes`)
  se queda corto. Misma firma → drop-in.
- Modelos locales tipo Ollama para tareas internas (spec §10).

## Issues conocidos / gotchas

- **Preview pane** (`mcp__Claude_Browser__*`): congela `requestAnimationFrame`/`ResizeObserver`,
  throttlea `setTimeout`, **no corre transiciones CSS** y a veces reporta viewport 0. Los nodos de
  React Flow quedan sin medir → no se dibujan edges ni animaciones; los gestos sintéticos de
  teclado/drag no disparan. **No es un bug de la app.** En el pane se verifica **lógica/datos**;
  el **render, la inercia y las animaciones** los prueba el usuario en Chrome real. (napkin §2-3.)
- **CDN de GitHub Pages cachea `index.html` ~10 min.** Para ver un deploy nuevo enseguida:
  `?v=<algo>` (cache-buster).
- **Darkreader** activo en `localhost` rompe la hidratación y los colores.
- **Llamada IA que queda "estática"**: cubierto por el watchdog + `pendiente: 1` persistido +
  botón "↻ Rehacer" (decisiones F3-6). Un globo estático de ANTES de ese fix se recupera con "Rehacer".

## Cómo correr / verificar / publicar

```bash
cd D:\IA\3maps
npm run dev                         # http://localhost:3000 (sin basePath)
npx tsc --noEmit -p tsconfig.json   # typecheck
npm run lint
npm run build                       # out/ estático; con NEXT_PUBLIC_PAGES=1 → basePath /3maps
```

- **`.env.local`** (gitignoreado): `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  Sin eso, `npm run dev` corre igual pero sin la parte de Supabase. En prod van como repo secrets.
- **Lógica pura sin runner**: `npx --yes tsx _scratch.mts`, y borrar el scratch (napkin §13).
- **Publicar**: `git push` desde `D:\IA\3maps` (credencial en Windows Credential Manager).
  `gh` NO está autenticado. Deploy a Pages = push a `main` (Pages ya habilitado a mano).
- **Al cerrar sesión**: `tsc` + `lint` en verde · `git push` · actualizar este archivo.
