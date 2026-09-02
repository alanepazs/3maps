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

## Fase 5 — un globo del canvas = un TRAMO de la conversación (en curso, 02-09-2026)

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

Backlog abierto en Fase 5: **B8** (arrastrar un globo va a ~5 fps — el `MessageNode` re-parsea
todo el markdown del tramo por frame; `React.memo` del cuerpo).
