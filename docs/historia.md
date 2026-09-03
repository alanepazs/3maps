# Historia — qué shippeó cada fase

> Log compacto de lo entregado. El **por qué** de cada decisión está en `docs/decisiones.md`
> (referencias `§N` / `F2-N` / `F3-N`); el **qué hace cada archivo** en `docs/arquitectura.md`;
> el detalle commit-por-commit en `git log`.

---

## Fase 1 — MVP local-first (cerrada 29-08-2026)

Canvas de nodos (React Flow) + modelo de datos (`Intercambio`/`Arbol` + `.md` + `localStorage`) +
armado de contexto (`contexto.ts`, ventana + resumen) + llamada real a la IA con streaming
(`ia.ts`: Claude vía `@anthropic-ai/sdk` dinámico, Gemini vía `fetch`+SSE) + markdown en las
respuestas (`Markdown.tsx`) + panel de transcripción de la rama (`BranchTranscript`) + envión al
soltar (`inertia.ts` + los dos hooks) + deploy estático a GitHub Pages.

Saga Gemini: la API se renovó entera (keys `AQ.…`, solo modelos 3.x para keys nuevas,
`thinkingLevel` en vez de `thinkingBudget`, 503s intermitentes) — ver decisiones §7b/§7c.
DeepSeek/GPT se difirieron a fase 2 (no habilitan CORS).

---

## Fase 2 — Backend opcional Supabase (completa, en prod 30-08-2026)

Plan y decisiones abiertas originales: `git log` + decisiones F2-1..F2-8.

| Bloque | Qué shippeó | Ref |
|---|---|---|
| **2.0** fundaciones | `supabase.ts` (`getSupabase()` → cliente \| null), `schema.sql`, env por repo secrets | F2-1, F2-2 |
| **2.1** proxy IA | edge function `ia-proxy` (Deno, stateless, anti-SSRF), `llamarOpenAICompat` en `ia.ts`, toggle `usarProxyIA`. Verificado con key real de DeepSeek (llegó "Insufficient Balance" prolijo). | §7a, F2-6 |
| **2.2** login + mis árboles | Google OAuth (principal) + magic link, `useSesion.ts`, sección "Cuenta" en ⚙️. Tabla `shared_trees` + despublicar (RLS dueño-solo). Verificado end-to-end en prod. | F2-7 |
| **2.3** compartir por link | `compartir.ts`: sube `arboles/<slug>.json`, abre con `?compartir=<slug>` en modo lectura (`readOnly` por `NodeActionsContext` + `SharedBanner`). Topes 50 globos / ~1 MB. | F2-3, F2-4, F2-5 |
| **2.4** sync dispositivos | bucket privado `sync`, `sync.ts` + `useSync.ts`, LWW **por hora del servidor**. 3 bugs de sync encontrados y arreglados al probar (ping-pong por reloj, `TOKEN_REFRESHED` borró un árbol, leak entre cuentas). | F2-8 |
| **2.5** contexto relevante | `intercambiosRelevantes` en `contexto.ts` — match por raíz de palabra + peso por rareza, sin modelo. Rescata ≤3 intercambios viejos textuales cuando el tramo viejo se resumió. | §10b |

**Setup del usuario ya hecho**: `schema.sql` corrido (buckets `arboles` + `sync`, tabla
`shared_trees`), repo secrets, `ia-proxy` deployado (Verify JWT off), Redirect URLs con
`alanepazs.github.io`, OAuth client de Google + provider en Supabase.

**Pendiente**: 2.5b (embeddings `transformers.js`) solo si la versión liviana no alcanza.
Google OAuth **publicado** ("En producción" 30-08) — cualquiera loguea. Requirió los 3 permisos
no sensibles en "Acceso a los datos" + `public/privacy.html` + `public/terms.html` + dominio
autorizado (F2-7).

---

## Fase 3 — Pulido de UX (completa, en prod 30/31-08-2026)

Todos los bloques del pedido + fixes post-uso. Detalle por archivo en `arquitectura.md`.

| Bloque | Qué | Ref |
|---|---|---|
| **3.1** | Tope de alto del globo (220px si respuesta > 400 chars) + degradado + "⌄ ver más" + toggle Expandir/Colapsar. Pref por globo en `"3maps:vista"`. | F3-1 |
| **3.2** | `ubicarNuevoGlobo` (`layout.ts`): globo nuevo no pisa a NINGÚN otro (rects reales), ramas alternan izq/der. | F3-7 |
| **3.2b** | La cámara sigue al globo recién creado (`setCenter`, mantiene zoom). | — |
| **3.3** | La flecha rama↔tronco salta de lado DURANTE el drag (edge `sourceHandle` en vivo). | F3-2 |
| **3.4** | Botón "▤ Ordenar" — auto-layout propio recursivo (`calcularLayout` en `layout.ts`). | F3-3 |
| **3.5** | Varios mapas (`mapas.ts` + `MapaSwitcher`), sync per-mapa + índice `_mapas.json`. | F3-4 |
| **3.6** | Borrar el globo raíz solo cuando es el último (`data.sinHijos`). Borrar el último MAPA también se permite (crea uno nuevo vacío + poda el índice de la nube). | F3-5, F3-4 |
| **3.7** | ⚙️ cierra al clickear afuera / Escape (listener `pointerdown` en captura). | — |
| **3.8** | Panel: "Transcripción de la rama" → "Conversación hasta este globo". | — |
| **3.9** | Mini-composer al pie de `BranchTranscript` (crea un hijo del globo abierto, el panel se mueve a él). | — |
| **3.10** | Globo redimensionable (manija ◢, tamaño en `"3maps:vista"` `tamanos`, "↔ Auto" para volver). | F3-8 |
| **3.11** | Panel lateral redimensionable (manija en el borde interno, clamp `[320, 75vw]`, ancho por dispositivo en `settings.transcriptWidth`). Móvil: pantalla completa + botón "🗺 Ver mapa". | F3-9 |
| **3.12** | Ctrl/Cmd+Enter ramifica, Enter continúa — en `Composer` y en el mini-composer del panel. | F3-10 |
| **3.13** | Fixes de móvil: `h-dvh` (encuadraba mal), `fitView` con `maxZoom` bajo en móvil (se veía 1 globo), controles y minimapa de React Flow tapados por el composer, panel de ⚙️ tapado. Esconder la barra de chat (botón "✎ Escribir" grande). | F3-11 |

Fixes post-uso (fase 3): llamada IA que quedaba estática → watchdog + `pendiente:1` + "↻ Rehacer"
(F3-6); superposición de globos nuevos (F3-7); manija del panel/globo que cerraba/deseleccionaba
al soltar (se traga el `click` post-`pointerup`).

---

## Fase 4 — Rediseño del panel + contadores + adjuntos (implementada, en prod 01/02-09-2026)

Plan `tasks/plan.md` (T1-T16). Implementación completa; pendiente la prueba de Alan en Chrome
real con keys.

| Tarea | Qué | Ref |
|---|---|---|
| **T13** | `envolverLatexCrudo` en `Markdown.tsx`: `\frac{…}` suelto sin `$` → `$…$`, línea por línea, salteando código/rutas/`\n`. | F3-14b |
| **T1-T3** | `stopNode` corta el stream de un globo conservando lo parcial · badge de lápiz animado FUERA del globo + botón STOP · el globo nace colapsado a 220px mientras streamea + auto-scroll. | F3-15 |
| **T4-T5** | ⚙️ `SettingsPanel` en 2 pestañas "Lienzo"/"IA" + caja ámbar del proxy en un `<details>`. | F3-16 |
| **T6** | Manija de resize del globo: `cursor-nwse-resize` + contra-escala `clamp(1, 1/zoom, 4)`. | F3-17 |
| **T7-T9, T14** | `BranchTranscript`: turnos Vos/IA · STOP en el mini-composer · auto-scroll sigue el stream · flechas `‹`/`›` que navegan SOLO por líneas de costado (ramas hijas + padre si el abierto es rama), apiladas por `y`. Panel abre en el "Vos". | F3-18/b/c/d/e |
| **T11** | `llamarIA` → `{ texto, uso }`; el `usage` del proveedor (Claude `final.usage` / Gemini `usageMetadata` / OpenAI-compat `stream_options.include_usage`) → `.md` (`tokens_in`/`tokens_out`). | F3-19 |
| **T10** | `estimarTokens(mensajes) = Σ chars/4` (`contexto.ts`); header del panel "≈ N tokens de contexto" del globo abierto (usa resumen cacheado, nunca lo dispara). | F3-20 |
| **T12** | Cada turno IA del panel muestra "N → N tok" de `tokensEntrada/Salida` del `.md` (nada si no los tiene). | F3-21 |
| **T16** | Adjuntar archivos al mini-composer del panel (texto + imágenes + PDF). `Adjunto` en el `.md` (frontmatter JSON 1 línea); imágenes recomprimidas con `<canvas>` (1568px); bloques nativos por proveedor (`ia.ts` `multimediaDe`); `src/model/adjuntos.ts`. Dropzone + paste + 📎 + chips + lightbox + badge "📎 N" + aviso "PDF solo Gemini/Claude". | F3-22/b/c |
| **T15** | Sacar una respuesta como texto: `src/model/exportar.ts` (`nombreArchivoRespuesta` heurística de nombre/ext). Panel: "⧉ Copiar" + "⬇ Guardar" + "⧉" por bloque de código (`Markdown` prop `conCopiar`). | F3-23 |

Bugfixes de la fase: `ubicarNuevoGlobo` no pisa a nadie (F3-7b/c) · `asentar` usa la posición
autoritativa del `onNodeDragStop` (F3-18b) · la rama entra al hijo por el costado opuesto
(nuevos handles `t-left`/`t-right`/`t-top`, F3-2b).

---

## Fase 5 — un globo del canvas = un TRAMO de la conversación (shippeada, 02-09-2026)

Spec `tasks/fase5-spec.md`. **Cambio de arquitectura de la VISTA — el modelo de datos no cambió,
cero migración**: `Intercambio` / `.md` / persistencia / sync / compartir / `armarContexto` iguales.
Antes cada Enter creaba un globo; ahora **un globo = un tramo** = una cadena maximal de
intercambios unidos por `rama: "main"`. Enter agrega a la punta del mismo globo; un globo nuevo
sale solo al **ramificar** (`rama != "main"`).

| Bloque | Qué | Ref |
|---|---|---|
| **F5-0** | Fix del `⌄` del `Composer` (pedía doble click): `tragarClickSintetico` en `components/gestos.ts` — el swallower del click post-resize se comía cualquier click. | F5-0 |
| **F5-1** | `calcularTramos` / `tramoDesde` / `cabezaDeTramo` (`intercambio.ts`); `arbolAVista` reescrito (1 nodo = 1 tramo, `id` = cabeza, `data.intercambios` + `data.rev`); `datosIguales` ignora `intercambios` usa `rev`; `MessageNode` renderiza el tramo como transcripción scrolleable; `FlowCanvas` resuelve todo a cabeza/punta (`transcriptNodeId` = la PUNTA). `handleSubmit` `main` agrega a la punta SIN crear globo (F5-2 folded acá). | F5-1 |
| **F5-3** | Ramificar desde **cualquier** intercambio del tramo: "⑂ ramificar desde acá" por turno IA en el panel → `ramificarDesde` + chip; `onSubmit` gana `desdeId?`; `ubicarNuevoGlobo` tramo-aware (resuelve a cabeza, choca contra tramos). | F5-3 |
| **F5-4** | El globo crece con la conversación: `Settings.crecimientoPxPorMensaje` (0-24, def 9) + `crecimientoTope` (def 320) → sliders en "Lienzo". Alto = `ALTO_BASE_GLOBO(108) + min(n*px, tope)` (por `NodeActionsContext`). Se sacó "expandir/colapsar" del globo (F3-1) + se borró `vista.ts`. | F5-4 |
| **F5-4b** | Auto-scroll del stream (patrón `pegado`) en panel + globos; grip de resize de 16→28px. | F5-4b |
| **F5-4c** | El `⌄` y el cursor del resize **de verdad** (F5-0/F5-4b no cerraron; reproducidos en Chrome real con CDP): `tragarClickSintetico` traga por **target** (`.react-flow__pane` / `[data-cierra-al-click]`), no por tiempo; la manija de resize sale del `overflow-hidden` del `MessageNode` y cuelga 4px por fuera de la esquina. | F5-4c |
| **F5-5** | `calcularLayout` ("▤ Ordenar") y `resolverSuperposiciones` (`layout.ts`) recorren **tramos**: 1 posición por tramo (la de la cabeza), ramas de cualquier intercambio del tramo en columnas al costado alineadas al top. `ubicarNuevoGlobo` ya era tramo-aware. | F5-5 |
| **F5-6** | `BranchTranscript` → `PanelConversacion` (rename). "⧉ Copiar" / "⬇ Guardar" en **cada** respuesta del panel (no solo la última; `copiada` bool → `copiadaId`). Docs (`historia.md`, `arquitectura.md`, `decisiones.md`, invariante de `CLAUDE.md`). | F5-6, F3-23 |

---

## Backlog post-fases (B1-B10) — 02/03-09-2026

Pedidos sueltos de Alan, fuera del plan de fases. Detalle + porqué: `decisiones.md` (B1, B3, B4,
B5, B7, §10, F5-7).

| B | Qué | Ref |
|---|---|---|
| **B1** | Color por globo. Paleta fija de 6 slugs (`ambar`/`verde`/`rojo`/`cian`/`violeta`/`rosa`) + sin color, NO hex. `Intercambio.color` en la cabeza del tramo → `.md` (`color:`) → sync/compartir gratis. `COLOR_GLOBO_HEX` en `components/colores.ts`. Punto en el header + swatches en el `NodeToolbar`. | B1 |
| **B2** | Contexto adaptativo = **resumen incremental**. `resumir()` acepta `opts.resumenPrevio` → prompt "actualizá este resumen con lo nuevo". `responder` busca en `resumenCacheRef` el prefijo cacheado más largo del set viejo y resume solo la cola nueva sobre él → la entrada de la llamada oculta deja de crecer sin tope en ramas largas. Se descartó la "ventana que se achica". Instrumentación `[b2]` temporal (console + `localStorage["3maps:debug:b2"]`). | §10 |
| **B3** | Multi-select move: envión **parejo a todo el grupo** (`FlowCanvas` envuelve `onNodeDragStop` y arma el grupo con `getNodes().filter(selected)` — el 3er arg de RF no es confiable); `onSettle` → `asentarVarios` (batch). La selección se MANTIENE tras mover (se limpia al clickear el fondo). **Toolbar compartida** (`ToolbarGrupo`) con >1 seleccionado: "🗑 Eliminar N" (un confirm, dedup de ancestros) + swatches de color; las toolbars por-globo se esconden (`variosSeleccionados` vía `useStore`). | B3 |
| **B4** | Setting "grosor de líneas". `Settings.grosorLineas` (1-5, def 1.5) → CSS var `--xy-edge-stroke-width` en el contenedor del canvas (lo hereda `.react-flow__edge-path`). Slider en "Lienzo". | B4 |
| **B5** | Setting "fuente" (sistema/geist/serif Lora/mono) + "tamaño de texto" (0.8-1.3). `FlowCanvas` un `useEffect` escala el `font-size` del `<html>` (todo lo `rem`) + setea `--fuente-3maps` (lo lee `body`). `Lora` a `layout.tsx` (`next/font`). `Markdown.tsx` px sueltos → `em`. | B5 |
| **B6** | Logo. Alan subió `public/{logo.png, 3.png}` (ya transparentes — palette + tRNS). **Favicon** = `src/app/{icon.png, favicon.ico}` (la marca `3.png` sobre blanco — el lockup es ilegible a 16px; sin `apple-icon.png`). `icon.png` lo linkea Next con basePath → es el que anda en Pages. **Watermark** del canvas = **`logo.png` completo** (árbol + globos + "3maps"), 5% opacidad, hijo de `<ReactFlow>` (el `colorMode="dark"` pinta fondo opaco). `src/model/assets.ts` `rutaAsset()`. | B6 |
| **B7** | Zoom de lupa en hover. `Settings.hoverZoom` (def off). CSS puro `:root[data-hoverzoom="on"] .react-flow__node:hover .globo-root { scale(1.35); z-index }` (transform → no corre a los vecinos), excluye `.dragging`/`.selected`, `@media (hover: hover)`. `data-hoverzoom` en el `<html>` desde el effect de B5. `onResizeStart` pasó a `offsetWidth` (inmune al transform). | B7 |
| **B8** | Arrastrar un globo iba a ~5 fps: `MessageNode` re-parseaba toda la transcripción por frame. `Markdown` = `memo` + `useMemo`; la transcripción sale a `CuerpoTramo` (`memo` por `rev`/`readOnly`). | F5-7 |
| **B9** | El scroll-follow del panel se plantaba a mitad del stream (el `scrollTop = scrollHeight` propio apagaba `pegado`). `useLayoutEffect` + ref `autoScroll` (prende antes del scroll propio, apaga en rAF). Aplicado también al globo. | F5-7 |
| **B10** | Manija de resize del panel + scrollbar pegados con `side="left"`: la manija sale entera del panel (`left-full ml-1`). `side="right"` sin cambio. | F5-7 |

## Fixes de robustez de la llamada a la IA (03-09-2026)

Reporte de Alan (video): respuestas que se cortan a la mitad, peor con 2 ramificaciones a la vez.
Tres causas, todas en `decisiones.md` F3-6:

| Fix | Qué |
|---|---|
| **Watchdog por fases** | El de inactividad (45s) contaba desde ANTES de `resumir()` → con 2 ramas profundas en paralelo, `resumir()` tarda >45s en un free tier saturado y mataba la respuesta antes de arrancar, con mensaje falso. Ahora: resumir bajo `TOTAL_MS` (240s) + corte propio a 50s (`AbortSignal.any` + `timeout`); 1er token `PRIMER_BYTE_MS` (90s); entre chunks `INACTIVIDAD_MS` (45s). `resumir()` recibe `signal`. |
| **Respuesta truncada** | Gemini cerraba con `finishReason: MAX_TOKENS` y 3maps la daba por completa (Rehacer habilitado, sin aviso). Los 3 adaptadores → `RespuestaIA.truncada`; `responder` marca `error` sin borrar el texto; el render de `MessageNode`/`PanelConversacion` muestra respuesta + nota juntas (antes el `error` tapaba el texto). |
| **`⌄` de un click** | El swallower global de `click` (`tragarClickSintetico`, F5-0/4b/4c) siempre fue una carrera. Reemplazado por **pointer capture** (`arrastrarConCaptura` en `gestos.ts`): el `click` sintético post-drag va a la manija, no al pane/backdrop. Cero listeners globales. |
| **Mismatch de hidratación** | Al recargar con `composerOculto` (o grosor ≠ 1.5) guardado, React 19 no reconciliaba el atributo. `sVista = hidratado ? settings : DEFAULT_SETTINGS` — el 1er render del cliente usa los defaults (= server), el 2º aplica lo guardado. |
| **Auto-switch de proveedor** | `proveedorDeLaKey(key)` (`ia.ts`) detecta el proveedor por prefijo inequívoco (`sk-…` a secas = ambiguo). Al pegar una key de otro proveedor, `SettingsPanel` muestra un botón "Cambiar a X" (antes solo el aviso ámbar); la key pegada se conserva cruzando el cambio (`keyTrasCambio`). Decisiones §8c. |
