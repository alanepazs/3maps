# Estado — 3maps

> Snapshot para retomar. Solo **dónde estamos + qué falta + gotchas**. Historial → git +
> `docs/historia.md`. "Qué hace cada archivo" → `docs/arquitectura.md`. Por qué el código es así →
> `docs/decisiones.md`. Última actualización: 01-09-2026.

## Dónde estamos

**Fase 1 + 2 + 3 shippeadas y en producción.** `https://alanepazs.github.io/3maps/`
(deploy automático en cada push a `main`). Repo `github.com/alanepazs/3maps`, local `D:\IA\3maps`.

- **Canvas** (React Flow): árbol de globos, tronco vertical + ramas al costado, envión al soltar,
  2 modos (manito / selección con espacio), redimensionar globo y panel, auto-layout ("▤ Ordenar"),
  varios mapas, esconder la barra de chat. El `arbol` de `Intercambio`s es la fuente de la verdad;
  la vista de React Flow se deriva.
- **IA** (`model/ia.ts`, wired en `FlowCanvas.responder`): streaming, contexto = solo el camino
  raíz→globo con ventana + resumen. **13 proveedores**: Gemini + Claude directos del navegador; el
  resto (DeepSeek, GPT, Groq, Cerebras, OpenRouter, Mistral, HuggingFace, Zhipu/GLM, Qwen,
  Moonshot/Kimi, SiliconFlow) vía el edge function `ia-proxy` (opt-in "usar proxy" en ⚙️). Una
  key/modelo por proveedor. `⚙️` trae mini-guía de API key por proveedor (`GUIA_API_KEY`) y aclara
  cuáles son open-source. **Probados e2e: Gemini + Groq.**
- **Modelos Groq probados vía proxy (31-08)**: andan `allam-2-7b`, `groq/compound`,
  `qwen3.6-27b`, `qwen3.8-27b`, `openai/gpt-oss-20b` / `-120b` / `-safeguard-20b`. NO son de
  chat (fallan esperado): `whisper-large-v3` / `-turbo` (STT), `llama-prompt-guard-2-22m` /
  `-86m` (`max_tokens` ≤512), `canopylabs/orpheus-*` (piden aceptar términos). `compound-mini`
  cortó por rate-limit del tier free, no por el modelo. Los "errores de compaginación" de
  gpt-oss / qwen3 eran el bug de render → arreglado en F3-12; falta revalidar en vivo.
- **Modelos Gemini probados directos (31-08)**: andan `gemini-2.5-flash`, `gemini-3-flash-preview`,
  `gemini-3.1-flash-lite` (+`-preview`), `gemini-3.5-flash` (lento), `gemini-3.5-flash-lite`,
  `gemini-3.6-flash`, `gemini-3.7-flash`. Deprecados (no dan a usuarios nuevos): `gemini-2.5-flash-lite`
  (→ 3.5-flash-lite), `gemini-2.5-pro` (→ 3.1-pro-preview). Rate-limit (no fallo real): `gemini-3.1-pro-preview`
  (+`-customtools`), `gemini-pro-latest`. `gemini-flash-lite-latest` → "invalid argument".
  **Aliases `gemini-*-latest`** (`flash` / `pro` / `flash-lite`): no andan en free tier →
  ahora se esconden del datalist y, si los tipeás, avisan en ámbar que se usa `gemini-3.7-flash`
  (antes swappeaba en silencio). Ver decisiones §7b. Los `$` sin renderizar que vio el
  usuario NO son bug de código: F3-12 renderiza esa salida de Gemini bien (verificado local, 4
  spans katex, `$$`/`$x=1$` desaparecen) y el bundle está en prod (katex CSS presente) → **el
  dispositivo del usuario sirve el bundle viejo cacheado por la PWA**. Limpiar datos del sitio.
- **Respuestas** (`Markdown.tsx`): matemática con KaTeX (`$…$`, `$$…$$`, `\[ \]`, `\( \)`), HTML
  del modelo saneado (`<br>` en tablas), y `ia.ts` saca el `<think>…</think>` de los modelos
  reasoning. Decisiones F3-12.
- **Backend opcional** (Supabase, `ref` ejecjjpdjoxgrbqrhwwd): login Google/magic-link, compartir
  por link (`?compartir=<slug>`), "mis árboles" + despublicar, **sync entre dispositivos**. Sin
  las env `NEXT_PUBLIC_SUPABASE_*` la app es 100% local.
- **Sync entre dispositivos** (con sesión, LWW): árboles per-mapa (`sync/<uid>/<mapId>.json`),
  lista de mapas (`_mapas.json` = `{mapas, borrados, epoch}`), keys/modelos (`config.json`).
  **NO es push**: poll cada 15s + al volver a foco. Latencia ≤15s. "🧹 Empezar de cero" / borrar
  el último mapa suben un `epoch` → reset duro en el otro dispositivo. **Probado OK 01-09 con PWA
  + PC**: crear / borrar / renombrar / reset / tamaño del globo convergen. Detalle: decisiones F3-4.
- **Persistencia local**: `localStorage["3maps:arbol:<mapId>"]` = un string `.md` por intercambio.
  Vista en `"3maps:vista"`, ajustes en `"3maps:settings"`, IA en `"3maps:ia"`.

## Qué falta

### Prueba real pendiente (la hace el usuario, con key/login)
- Los otros 9 proveedores vía proxy con key real (Cerebras / GLM-flash / SiliconFlow = gratis).
- Revalidar en vivo gpt-oss / qwen3 con el bundle F3-12: strip de `<think>` + `<br>` literal.
  Ojo: gpt-oss escribe `\frac{...}` sin `$` → eso NO lo arregla F3-12 (ver heurística en Opcionales).
  El render de `$…$`/`$$…$$` (Gemini) ya está verificado en local; falta que el usuario limpie la
  caché de la PWA para dejar de ver el bundle viejo.
- Panel lateral redimensionable (3.11) + fixes de móvil (3.13) en Chrome real / celu.
- Que el watchdog de 45s no corte un stream lento-pero-vivo.
- ⚠️ LWW de títulos usa el reloj del navegador: relojes MUY desfasados podrían elegir mal.

### Opcionales (no bloquean)
- **Panel lateral expandido — rediseño** (lista de mejoras del usuario):
  - Diferenciación más moderna entre turno del usuario y turno de la IA (hoy es pobre).
  - Botón **STOP** para cortar la respuesta de la IA mientras streamea.
  - Contador de tokens: disponibles vs. gastados en cada interacción.
  - Contador de contexto por globo y del árbol completo.
  - Flechas laterales en el chat del panel para navegar entre el hilo principal y las
    ramificaciones (hermanos / ramas de un globo).
  - Heurística en `normalizarMath` para envolver LaTeX crudo sin delimitadores (`\frac{`,
    `\sqrt{`, `\text{`, `\sum` sueltos, sin `$` en la línea) → `$…$`. Falla típica de los
    modelos open-source chicos (gpt-oss-120b escribe `\frac{...}` entre paréntesis normales).
    El fix F3-12 solo cubre `\[ \]` y `\( \)`, no el LaTeX sin marcar.
- **Auto-switch de proveedor** al pegar una key de otro (hoy `avisoFormatoKey` solo avisa).
- **Export/import** `.zip` de la carpeta de `.md` + File System Access API (spec §7).
- **2.5b — embeddings** (`transformers.js`) si `intercambiosRelevantes` (match por palabras) se
  queda corto. Misma firma → drop-in.
- Modelos locales tipo Ollama (spec §10) — descartado por ahora (mixed-content/CORS + el celu no
  llega a `localhost`); los modelos abiertos ya se sirven online vía Groq/Cerebras/etc.

## Issues conocidos / gotchas

- **Preview pane** (`mcp__Claude_Browser__*`): congela rAF/ResizeObserver, throttlea `setTimeout`,
  **no corre transiciones CSS**, a veces reporta viewport 0; los gestos sintéticos de teclado/drag
  no disparan. **No es bug de la app.** En el pane se verifica **lógica/datos**; render, inercia y
  animaciones los prueba el usuario en Chrome real. (napkin §2-3.)
- **CDN de GitHub Pages cachea `index.html` ~10 min.** Deploy nuevo ya: `?v=<algo>`. La **PWA**
  cachea más fuerte → limpiar datos del sitio para forzar update.
- **Darkreader** en `localhost` rompe la hidratación y los colores.
- **Un dispositivo con bundle viejo rompe el sync** (sube el índice sin `epoch` → lo borra). Ver arriba.
- **Llamada IA "estática"**: watchdog + `pendiente: 1` persistido + botón "↻ Rehacer" (F3-6).

## Cómo correr / verificar / publicar

```bash
cd D:\IA\3maps
npm run dev                         # http://localhost:3000 (sin basePath)
npx tsc --noEmit -p tsconfig.json   # typecheck
npm run lint
npm run build                       # out/ estático; con NEXT_PUBLIC_PAGES=1 → basePath /3maps
```

- **`.env.local`** (gitignoreado): `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  Sin eso `npm run dev` corre igual, sin la parte de Supabase. En prod van como repo secrets.
- **Lógica pura sin runner**: `npx --yes tsx _scratch.mts`, y borrar el scratch (napkin §13).
- **Publicar**: `git push` desde `D:\IA\3maps` (credencial en Windows Credential Manager).
  `gh` NO está autenticado. Deploy a Pages = push a `main`.
- **Al cerrar sesión**: `tsc` + `lint` en verde · `git push` · actualizar este archivo.
