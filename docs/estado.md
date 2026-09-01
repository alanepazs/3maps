# Estado — 3maps

> Snapshot para retomar. Solo **dónde estamos + qué falta + gotchas**. Historial → git +
> `docs/historia.md`. "Qué hace cada archivo" → `docs/arquitectura.md`. Por qué el código es así →
> `docs/decisiones.md`. Última actualización: 31-08-2026.

## Dónde estamos

**Fase 1 + 2 + 3 shippeadas y en producción.** `https://alanepazs.github.io/3maps/`
(deploy automático en cada push a `main`). Repo `github.com/alanepazs/3maps`, local `D:\IA\3maps`.

- **Canvas** (React Flow): árbol de globos, tronco vertical + ramas al costado, envión al soltar,
  2 modos (manito / selección con espacio), redimensionar globo y panel, auto-layout ("▤ Ordenar"),
  varios mapas, esconder la barra de chat. El `arbol` de `Intercambio`s es la fuente de la verdad;
  la vista de React Flow se deriva.
- **IA** (`model/ia.ts`, wired en `FlowCanvas.responder`): streaming, contexto = solo el camino
  raíz→globo con ventana + resumen. **8 proveedores**: Gemini + Claude directos del navegador; el
  resto (DeepSeek, GPT, Groq, OpenRouter, HuggingFace, Qwen) vía el edge function
  `ia-proxy` (opt-in "usar proxy" en ⚙️). Una key/modelo por proveedor. `⚙️` trae mini-guía de
  API key por proveedor (`GUIA_API_KEY`) y aclara cuáles son open-source.
  **Probados e2e: Gemini + Groq + OpenRouter.** El free fluido lo cargan esos 3; Claude/DeepSeek/GPT
  son pagos (el user trae saldo). Qwen + HuggingFace = sin probar.
- **Modelos probados (31-08)** — referencia rápida, ordenados de funcional a no funcional:
  - **Groq** (proxy):
    1. **Andan**: `allam-2-7b`, `groq/compound`, `qwen3.6-27b`, `qwen3.8-27b`,
       `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `openai/gpt-oss-safeguard-20b`.
    2. **No andan** (no son modelos de chat, esperado): `llama-prompt-guard-2-*`
       (clasificador, `max_tokens` ≤512), `whisper-*` (STT), `orpheus-*` (TTS, piden
       aceptar términos).
  - **Gemini** (directo):
    1. **Andan bien**: `3.7-flash`, `3.6-flash`, `3.1-flash-lite` (+ `-preview`),
       `3-flash-preview`, `2.5-flash`.
    2. **Andan lentos**: `3.5-flash`, `3.5-flash-lite`.
    3. **No andan en key/cuenta nueva** (free tier): `2.5-flash-lite`, `2.5-pro`
       (deprecados; una cuenta vieja o con billing sí los llama). Aliases `*-latest`
       resuelven a modelos paid → ocultos de los chips de modelos + aviso ámbar (decisiones §7b).
  - **OpenRouter** (proxy) — ✅ **free real, probado 01-09**. Sin tarjeta, saldo $0. Límites:
    20 req/min + **50 req/día** ($0 gastado) → 1000/día si alguna vez cargás $10 (no vencen).
    Saldo negativo → 402 hasta en los `:free` (no pasa si nunca ponés plata). Modelos:
    - **Andan**: `minimax/minimax-m3:free`, `nvidia/nemotron-3-super-120b-a12b:free` (= nuevo
      `MODELO_POR_DEFECTO.openrouter`; el viejo `meta-llama/llama-3.3-70b-instruct:free` ya no existe).
    - **Fallan por proveedor upstream saturado** (429 "Provider returned error", NO es tu cuota —
      minimax/nvidia andan al mismo tiempo): `google/gemma-4-31b-it:free`, `z-ai/glm-5.2:free`.
    - `/models` de OpenRouter devuelve ~300 modelos (agregador) → resuelto con **filtro de chips**
      (`> 12` modelos → aparece un `<input>` de substring; F3-13).
  - **Eliminados (01-09): Cerebras, SiliconFlow, Zhipu, Moonshot, Mistral** — el free no da una
    experiencia fluida. **13 → 8 proveedores.** Detalle + evidencia en decisiones §7d. Resumen:
    - **Cerebras**: toda llamada → `402 "Payment required. Visit your billing tab"` (confirmado
      en sus Request Logs). El free tier es solo del playground.
    - **SiliconFlow**: 1ª llamada pasa (trial $1), después `"Sorry, your account balance is
      insufficient"`. Los `:free` piden verificación real-name China-only desde may-2026.
    - **Zhipu / Moonshot**: sacados sin probar — registro solo `.cn` (CAPTCHA + teléfono chinos).
    - **Mistral**: free real pero **1 req/min** → mata el ramificar en paralelo. Sacado sin probar.
  - **The strip de `<think>` funciona OK** — verificado con Qwen3-8B (SiliconFlow) antes de sacarlo.
  - Los "`$` crudos" / "`\frac` crudo" que se vieron eran **bundle viejo cacheado**, no bug:
    F3-12 renderiza bien la salida de Gemini (verificado local). gpt-oss sí manda `\frac` sin
    `$` → heurística pendiente (Opcionales).
- **Respuestas** (`Markdown.tsx`): matemática con KaTeX (`$…$`, `$$…$$`, `\[ \]`, `\( \)`), HTML
  del modelo saneado (`<br>` en tablas), y `ia.ts` saca el `<think>…</think>` de los modelos
  reasoning. Decisiones F3-12.
- **Backend opcional** (Supabase, `ref` ejecjjpdjoxgrbqrhwwd): login Google/magic-link, compartir
  por link (`?compartir=<slug>`), "mis árboles" + despublicar, **sync entre dispositivos**. Sin
  las env `NEXT_PUBLIC_SUPABASE_*` la app es 100% local.
- **Sync entre dispositivos** (con sesión, LWW): árboles per-mapa (`sync/<uid>/<mapId>.json`),
  lista de mapas (`_mapas.json` = `{mapas, borrados, epoch}`), keys/modelos (`config.json`).
  **NO es push**: poll cada 15s + al volver a foco. Latencia ≤15s. "🧹 Empezar de cero" / borrar
  el último mapa suben un `epoch` → reset duro en el otro dispositivo. **Probado OK con celu
  + PC**: crear / borrar / renombrar / reset / tamaño del globo convergen. Detalle: decisiones F3-4.
- **Persistencia local**: `localStorage["3maps:arbol:<mapId>"]` = un string `.md` por intercambio.
  Vista en `"3maps:vista"`, ajustes en `"3maps:settings"`, IA en `"3maps:ia"`.

## Qué falta

### Prueba real pendiente (la hace el usuario, con key/login)
- Faltan probar con key real: **HuggingFace, Qwen** (gratis — ver si el signup/uso es fluido o
  van al mismo destino que los eliminados), **DeepSeek, GPT** (pagos).
- Revalidar en vivo gpt-oss / qwen3 con el bundle F3-12: strip de `<think>` + `<br>` literal
  (el render `$…$` de Gemini ya está OK en local; primero forzar bundle nuevo con `?v=<algo>`).
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
- **Globo nuevo nace colapsado mientras streamea.** Hoy un globo `pending` crece a lo largo del
  stream (empuja el layout) y recién se puede colapsar cuando la respuesta terminó y pasa los 400
  chars (`vista.ts` / `MessageNode`, F3-1: `colapsable` mira `respuesta.length`, no el texto
  parcial). Pedido: que arranque colapsado a `ALTO_COLAPSADO` (220px, cuerpo scrolleable) apenas
  se crea, y que el usuario lo expanda si quiere. Ojo: no romper el auto-scroll del texto que
  entra, ni el tamaño manual (F3-8) que gana sobre el colapso.
- **Manija de redimensionar del globo (◢) — más usable con zoom out.** Hoy (`MessageNode.tsx`,
  F3-8/F3-10) es un elemento chico absoluto abajo-derecha: (a) el cursor no cambia (queda la
  manito de React Flow) y no hay tooltip; (b) con zoom out el globo se achica en pantalla → la
  manija queda sub-píxel e imposible de agarrar sin acercar mucho. Pedido: `cursor: nwse-resize`
  + `title="Arrastrá para redimensionar"`, y **contra-escalar la manija por `1/zoom`** (o mínimo
  en px de pantalla, vía `useViewport()`) para que mantenga tamaño de click constante. Alternativa:
  reevaluar `<NodeResizeControl>` de React Flow con `onResize` → árbol (F3-8 lo descartó por
  reinyectar width/height en cada rebuild — ver decisiones F3-8).
- **Auto-switch de proveedor** al pegar una key de otro (hoy `avisoFormatoKey` solo avisa).
- **Export/import** `.zip` de la carpeta de `.md` + File System Access API (spec §7).
- **2.5b — embeddings** (`transformers.js`) si `intercambiosRelevantes` (match por palabras) se
  queda corto. Misma firma → drop-in.
- Modelos locales tipo Ollama (spec §10) — descartado por ahora (mixed-content/CORS + el celu no
  llega a `localhost`); los modelos abiertos ya se sirven online vía Groq/OpenRouter/etc.

## Issues conocidos / gotchas

- **Preview pane** (`mcp__Claude_Browser__*`): congela rAF/ResizeObserver, throttlea `setTimeout`,
  **no corre transiciones CSS**, a veces reporta viewport 0; los gestos sintéticos de teclado/drag
  no disparan. **No es bug de la app.** En el pane se verifica **lógica/datos**; render, inercia y
  animaciones los prueba el usuario en Chrome real. (napkin §2-3.)
- **Respuesta con `<PAD>` × miles (u otro token especial) crasheaba TODO el canvas** (`RangeError`
  en `rehype-raw`). Arreglado 01-09 en `Markdown.tsx` (`sanitizarCrudo` + error boundary). Ver
  decisiones F3-14. Si vuelve a pasar con otro token, sumar el patrón a `TOKENS_BASURA`.
- **CDN de GitHub Pages cachea `index.html` ~10 min.** Deploy nuevo ya: `?v=<algo>`. (3maps NO
  es una PWA — no hay `manifest.json` ni service worker; "agregar a pantalla de inicio" es solo
  un atajo con el caché normal del navegador. El `?v=` alcanza.)
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
