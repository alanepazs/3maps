# Decisiones — 3maps

> Por qué el código es como es. Cada entrada: **qué se decidió**, **por qué**, y **qué romperías
> si lo revertís sin pensar**. Si vas a ir en contra de una de estas, que sea a propósito.
> Última actualización: 29-08-2026 (fase 2.0/2.3 — ver sección "Fase 2").

Complementa a:
- `docs/spec-proyecto.md` — el diseño y las decisiones de producto (modelo de datos, UX, roadmap).
- `docs/arquitectura.md` — qué hace cada archivo.
- Este archivo — decisiones de implementación que no son obvias mirando el código.

---

## Datos y `.md`

### 1. El `error` va en el frontmatter del `.md`, no en una sección `## Error`
- **Por qué**: la respuesta es markdown generado por la IA y puede tener sus propios `## títulos`.
  El parser toma como "respuesta" **todo lo que hay después de `## Respuesta` hasta el final del
  archivo**. Cualquier sección de cuerpo después de la respuesta se la comería el parseo.
- **Formato**: `error: <JSON.stringify(string)>` en una sola línea del frontmatter (o vacío).
- **Revertir rompe**: respuestas con headings, listas anidadas o `---` se parsean mal al recargar.

### 2. `x`/`y` vuelven al árbol solo en `asentar` (al soltar / frenar el envión), no en cada frame
- **Por qué**: el árbol es la fuente de la verdad, pero escribir posición en cada frame de drag o
  de glide sería un storm de `setState` + `guardarArbol` (localStorage sincrónico).
- **Consecuencia**: la `firma` que dispara la reconstrucción de la vista **excluye `x`/`y` a
  propósito** (`FlowCanvas`). Mover un globo no reconcilia la vista; cambiar su contenido sí.
- **Revertir rompe**: parpadeo al arrastrar, y `visibility:hidden` en los nodos por re-medición.

### 3. La vista de React Flow se reconcilia **preservando identidad de objetos**
- **Por qué**: React Flow re-mide un nodo cuando su objeto `data`/nodo cambia. Al mover un globo
  o al streamear texto en otro, no queremos re-medir los que no cambiaron.
- **Cómo**: en el effect de `firma`, los nodos sin cambio de contenido **mantienen su objeto
  anterior** (`datosIguales` compara `data` shallow). Solo se crean objetos nuevos para lo que
  cambió.
- **Revertir rompe**: flicker y saltos de layout en cada token del streaming.

### 4. `localStorage`: un string `.md` por intercambio bajo `"3maps:arbol"`
- **Por qué**: el `.md` es la fuente de la verdad (invariante CLAUDE.md) y así el export a disco
  (spec §7) es un `for` sobre las mismas strings, sin otra serialización.
- **Revertir** (ej. guardar el `Arbol` como JSON): duplica formato y diverge del export.

### 5. SSR: `arbol` arranca en la **semilla determinística**; `localStorage` se carga en un effect de montaje
- **Por qué**: leer `localStorage` durante el render rompe la hidratación (server ve semilla,
  cliente ve lo guardado). El `setState` dentro del effect es a propósito y corre una vez.
- **`listo`** (useState) gatea: hasta que no cargó, no se persiste ni se reconcilia la vista.
- **La semilla es `arbolInicial()` = `{ intercambios: [] }`** (árbol vacío). Antes eran 3 globos
  de ejemplo (un plan de estudio inventado) — molestaban al aparecer en cada navegador limpio /
  sesión nueva. El primer submit del `Composer` crea la raíz (`handleSubmit` detecta el árbol
  vacío). `[]` es trivialmente determinístico → SSR-safe.
- **Revertir rompe**: warning de hidratación + posible parpadeo semilla→guardado.

---

## IA

### 6. `llamarIA(config, mensajes, opts)` es el **punto único**; adentro `switch(proveedor)`
- **Por qué** (spec §6): sumar un proveedor = un `case` nuevo + entradas en los
  `Record<Proveedor, …>` de `ia.ts`. Cero cambios en el árbol, en `contexto.ts` o en `FlowCanvas`.
- **Revertir** (llamar al proveedor desde el componente): acopla la UI a cada SDK.

### 7. Claude vía `@anthropic-ai/sdk` **dinámico**; Gemini vía `fetch` + SSE **a mano, sin SDK**
- **Claude**: `await import("@anthropic-ai/sdk")` — solo se baja el chunk cuando el usuario
  dispara una llamada real (no pesa en la carga inicial). El SDK setea el header
  `anthropic-dangerous-direct-browser-access` que habilita CORS desde el navegador. Necesita
  `dangerouslyAllowBrowser: true`.
- **Gemini**: el REST `:streamGenerateContent?alt=sse` **anda directo desde el navegador**
  (verificado: key trucha → 400 real, no bloqueo CORS). El SDK de Google no aporta y pesa, así
  que se parsea el SSE a mano (`data: {json}` → `candidates[0].content.parts[].text`).
- **Revertir** (meter el SDK de Google, o cargar el de Anthropic estático): más peso, sin ganancia.

### 7a. DeepSeek y GPT van por el **proxy de 3maps** (no habilitan CORS)
- **El bloqueo** (verificado 29-08-2026): `api.openai.com` y `api.deepseek.com` **no mandan
  `Access-Control-Allow-Origin`** → el navegador bloquea la respuesta de cualquier `fetch`
  cross-origin. `dangerouslyAllowBrowser` del SDK de OpenAI **no** lo arregla: solo saca el guard
  interno del SDK, no el bloqueo del browser. Su doc es toda server-side.
- **Por qué Claude y Gemini sí andan directo**: los habilitaron a propósito — Anthropic con el
  header `anthropic-dangerous-direct-browser-access`, Google en el endpoint REST.
- **Solución (fase 2.1, opción A)**: el edge function `supabase/functions/ia-proxy` reenvía la
  request al proveedor con la key del usuario y devuelve la respuesta con CORS. **Stateless**: no
  loguea ni guarda. La invariante de CLAUDE.md pasa a *"la key nunca se **almacena** en un server
  de 3maps; puede **transitar** un proxy stateless que el usuario activa a propósito"*. El toggle
  `settings.usarProxyIA` (default off) + la caja explicativa en ⚙️ hacen el opt-in explícito.
- `llamarOpenAICompat` en `ia.ts` pega contra `${SUPABASE_URL}/functions/v1/ia-proxy`, no contra
  el proveedor. SSE estilo OpenAI (`choices[0].delta.content`). `PROVEEDORES_DISPONIBLES` ahora
  son los 4; sin el toggle, `deepseek`/`gpt` tiran un `ErrorIA` explicativo.
- **Anti-SSRF**: el cliente manda un *nombre* de proveedor (`x-ia-provider: deepseek|openai`), no
  una URL; el proxy la mapea a una base fija. Rutas limitadas a `/chat/completions` y `/models`.

### 7b. Modelos de Gemini: default `gemini-3.7-flash`, "thinking" por generación, + botón "ver modelos"
Historia de dolor real con una key **free tier** recién sacada de AI Studio:
- `gemini-2.0-flash` → 404: Google lo **retiró** (para todos). Un modelo pinneado se pudre.
- `gemini-flash-latest` → 503 "high demand": el alias resuelve a un flash **paid-tier**
  (`gemini-3.7-flash`); una key gratis no lo puede usar.
- `gemini-2.5-flash-lite` → 404 "no longer available to new users".
- `gemini-flash-latest` cuando **sí** respondía (200) → **respuesta vacía** ("Gemini no devolvió
  texto"): los flash 2.5/3.x **"piensan" por defecto** y se comían todo el `maxOutputTokens` en
  thoughts.

**Decisiones tomadas:**
1. **Default = `gemini-3.7-flash`** (era `3.6`; `3.7` es el Flash estable más nuevo). Una key free
   tier NUEVA da **404** en TODOS los `2.5-*` ("no longer available to new users, use gemini-3.x").
   Google empuja a la generación 3.x. Sugeridos = `3.7 / 3.6 / 3.5-flash / 3.5-flash-lite`.
2. **`thinkingConfig` con la forma correcta por generación** + `maxOutputTokens: 8192`:
   - **3.x** → `{ thinkingLevel: "low" }` (mandar `thinkingBudget` acá = **400 "invalid argument"**).
   - **2.x/1.x** → `{ thinkingBudget: 0 }`.
   Los flash "piensan" y el thinking cuenta contra `maxOutputTokens`; con 4096 la respuesta salía
   vacía. El parser descarta `parts` con `thought: true`; si no hay texto, el error dice cuántos
   eventos SSE llegaron y el `finishReason` (dejamos de adivinar). El parser también procesa el
   último bloque aunque no termine en `\n\n` (se perdían respuestas de un solo evento).
3. **`listarModelos(config)`** (`ia.ts`) + botón **"↻ ver modelos que tu key puede usar"** en
   `SettingsPanel`: GET `…/v1beta/models` con la key del usuario → chips clickeables con lo que
   **esa key** puede usar (única fuente de verdad, varía por key). Claude usa `client.models.list()`.
   **Se dispara solo al Guardar una key de Gemini** (`commit()`) — el usuario ve las opciones sin
   tener que buscar el botón. Si el modelo guardado no está en la lista → aviso ámbar.
4. **`MODELOS_MUERTOS`** en `configIA.ts` migra al default, al cargar, SOLO lo que ya no existe
   para nadie: retirados (`gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-pro`) + alias paid
   (`gemini-flash-latest`, `gemini-pro-latest`). **Los `2.5-*` NO se migran** (26-08 correção): una
   key con billing o cuenta vieja sí los puede llamar (corrección 29-08-2026); para la key free
   nueva que les da 404 ya está el aviso ámbar + "ver modelos" + Reintentar con el error real.
5. **`mensajeErrorGemini(res, modelo?)`**: helper único de errores para todos los endpoints de
   Gemini (`llamarGemini` + `listarModelosGemini`). 404 con modelo → sugiere el botón; 503 → texto
   de Google; **401 / `ACCESS_TOKEN_TYPE_UNSUPPORTED`** → explica que la cuenta emite keys `AQ.…`
   que todavía no andan en la REST API (problema de Google, reportado en su foro).

**Resultado (29-08-2026)**: con `gemini-3.6-flash` la IA anda end-to-end con una key free real
(respuesta + streaming + markdown). Google 503ea los flash 3.x de a ratos → si ya hubo streaming,
el parser devuelve el texto parcial; si no llegó nada, `llamarGemini` reintenta **una** vez con
1s de pausa (ver §7c) antes de mostrar el error.

### 7c. `llamarGemini` = wrapper con 1 reintento; `intentarGemini` hace el trabajo
- **Por qué**: el 503 de Google es transitorio y pasa seguido con los flash 3.x. Reintentar 1 vez
  con 1s de backoff evita que el usuario tenga que apretar "Reintentar" a mano en la mitad de los
  casos.
- **Solo si `acumulado === ""`**: si ya se streameó texto, `intentarGemini` lo devuelve y no
  llega al reintento → `opts.onTexto` nunca se llamó en el intento fallido → **sin doble emisión**.
- **Detección del 503**: fetch inicial `res.status === 503`, o error inyectado a mitad del stream
  con `error.code === 503` / `error.status === "UNAVAILABLE"` (marca `ErrorGemini503`, una clase
  privada; el wrapper la reempaqueta como `ErrorIA` si el 2º intento también falla).
- **Backoff abortable** (`esperar(ms, signal)`): si se cancela la llamada durante la pausa,
  rechaza con `AbortError` — lo trata `FlowCanvas.responder` como cancelación normal.
- **Revertir** (sacar el wrapper): vuelve a hacer falta apretar "Reintentar" ante cada 503.

**Lección**: la API de Gemini se renovó entera (keys `AQ.…`, solo modelos 3.x para keys nuevas,
`thinkingLevel` en vez de `thinkingBudget`, 503s intermitentes). Para el default de un servicio
con free tier: **probar con una key nueva de verdad** — los blogs y hasta `ListModels` mienten
(lista modelos que la key ve pero no puede llamar). El botón "ver modelos disponibles" + el
`mensajeErrorGemini` transparente fueron lo que destrabó el diagnóstico.

**Revisión 29-08-2026** (contra la doc oficial actual de Google, no solo la key de prueba):
- `gemini-3.7-flash` existe y es el Flash estable más nuevo → nuevo default.
- Free tier desde 01-abr-2026 = solo Flash / Flash-Lite; los Pro son pago. Coincide con lo visto.
- `thinkingLevel` (3.x) / `thinkingBudget` (2.5), no los dos → 400. Confirmado, es lo que hace el código.
- Keys `AIza…` viejas: Google las rechaza del todo desde septiembre 2026. Placeholder de la key
  pasó a `"AQ.…"`.
- Reportes en el foro de Google: keys `AQ.…` que dan `401 ACCESS_TOKEN_TYPE_UNSUPPORTED` contra
  `generativelanguage` en algunas cuentas (la de prueba no). Mapeado en `mensajeErrorGemini`.

### 8. La API key es un **borrador** en `SettingsPanel`; se persiste con el botón "Guardar" (o Enter)
- **Por qué**: no persistir keys a medio tipear, y dejar explícito cuándo la key "entra en
  vigencia". El usuario lo pidió así (antes era save-on-keystroke y daba stale-closure en tests).
- **La llamada real usa siempre la key GUARDADA** (`configIA`), nunca el borrador del input.
- **El proveedor sí aplica al toque**: al cambiarlo se resetea el modelo y se **limpia la key**
  (la key de un proveedor no sirve para otro). Los borradores se re-sincronizan con el patrón
  "ajustar estado en render" (no en effect → no dispara el lint `set-state-in-effect`).

### 8b. `systemPrompt` vive en `Settings`, no en `configIA`, y NO se aplica al resumen
- **Por qué en `Settings`**: no es sensible (no es una credencial) y es una preferencia del
  lienzo, no de la key. Persiste como `inertia` / `ventanaContexto` — escritura directa en cada
  tecla, sin borrador ni botón "Guardar".
- **Por qué NO en `resumir()`**: el resumen del tramo viejo es una llamada interna con su propio
  prompt fijo; meterle la instrucción del usuario ("respondé en catalán", "sé breve") ensucia el
  resumen que después se reinyecta como contexto. `FlowCanvas.responder` pasa `sistema` solo a la
  `llamarIA` de la respuesta, nunca a la de `resumir`.
- **Revertir** (mandarlo también al resumen): resúmenes en el idioma/tono equivocado, contexto
  degradado en ramas largas.

### 8c. Verificar la key sin gastar tokens: formato local + `listarModelos`
- **Problema**: no hay forma gratis de saber si una key "anda de verdad" salvo mandarle una
  llamada — y la de Claude, además de gastar, revela el problema de saldo recién en el 400.
- **Dos chequeos, ninguno cuesta tokens**:
  1. `avisoFormatoKey(proveedor, key)` en `ia.ts` — regex local (`sk-ant-` / `AQ.`|`AIza` / `sk-`).
     Solo caza typos y keys pegadas en el proveedor equivocado; una key bien formada pero falsa
     pasa. `SettingsPanel` lo muestra como aviso ámbar bajo el input, sin bloquear "Guardar".
  2. Botón **"verificar key y ver sus modelos"** → `listarModelos` (`GET /v1/models` en Claude,
     `/v1beta/models` en Gemini). Listar modelos **no consume tokens** en ninguno de los dos y
     falla con 401 si la key es inválida → confirma auth real. Antes el botón era solo Gemini;
     ahora aplica a los dos, y `commit()` lo dispara al guardar cualquier key.
- **Límite**: `listarModelos` confirma que la key **autentica**, no que tenga **saldo**. El saldo
  de Claude sigue apareciendo recién al mandar la primera pregunta (400 `credit balance too low`).
- **Revertir** (sacar el chequeo de formato): vuelven los "pegué la key de Gemini en Claude" que
  solo se descubrían tras una llamada fallida.

### 9. `configIA` = **una key/modelo POR PROVEEDOR**, en su propio `localStorage` key (`"3maps:ia"`)
- **Forma**: `{ activo: Proveedor, keys: { [proveedor]: { apiKey, modelo } } }`. Antes era un solo
  `{ proveedor, apiKey, modelo }` y cambiar de proveedor te borraba la key — molesto al probar
  otro y volver. Ahora `cambiarProveedorActivo(p)` trae la key guardada de `p`. `cargarConfigIA()`
  siempre devuelve un `ConfigIA` (apiKey puede ser `""`); default `gemini` (el único con free tier).
- **Migración**: al cargar, el formato viejo `{ proveedor, apiKey, modelo }` se convierte (la key
  vieja queda bajo su proveedor).
- **"Borrar key"** borra solo la del proveedor activo (`borrarKeyProveedor`), no las otras.
- Separado de `"3maps:settings"` porque es más sensible (varias API keys). **Invariante
  CLAUDE.md**: las keys van **directo del navegador al proveedor** (salvo DeepSeek/GPT que
  transitan el proxy, §7a), nunca se guardan en un server de 3maps.

### 10. Contexto = **solo el camino raíz→nodo**, aplanado, ventana + resumen
- **Por qué** (invariante CLAUDE.md / spec §5): mandar el árbol entero explota el costo.
- `armarContexto` (`contexto.ts`): `caminoRaizA` → aplanar (pregunta→user, respuesta→assistant) →
  últimos N completos (`opts.ventana`, default 6) + el tramo viejo como `resumenViejo` →
  `normalizar` (arranca en user, sin roles repetidos).
- El **resumen** lo genera `resumir()` con el mismo proveedor/modelo, y se **cachea por sesión**
  (`resumenCacheRef`, key = ids del tramo concatenados con `|`).
- El **prefijo del contexto se mantiene consistente** entre llamadas de la misma rama → aprovecha
  el prompt caching del proveedor. No reordenar ni regenerar el prefijo por gusto.

### 10b. Rescate de contexto viejo por palabras clave (fase 2.5, versión liviana)
- **Problema**: cuando el tramo viejo se resume, un dato puntual ("tengo 2 horas por día") se
  puede aplanar y perder.
- **Solución elegida (con el usuario)**: `intercambiosRelevantes(viejos, pregunta)` — sin modelo,
  sin descarga. Match por **raíz aproximada** de palabra (`raiz()` saca sufijos comunes del
  español) + **peso por rareza** (raíz en ≤1 intercambio viejo → x2). Devuelve ≤3; `armarContexto`
  los mete **textuales justo antes de la pregunta actual** — no toca el prefijo estable → el
  prompt caching sigue.
- **Solo si hay resumen**: si el tramo viejo va completo, ya están.
- **Alternativa (2.5b, no hecha)**: embeddings con `transformers.js`. Entiende sinónimos pero es
  ~25 MB + worker + IndexedDB. Misma firma → drop-in si la liviana no alcanza.
- **Revertir** (sacar el rescate): se vuelve a perder detalle viejo en ramas largas.

### 11. `ErrorIA` con mensajes ya en español, listos para mostrar
- **Por qué**: la UI (`MessageNode`) solo pinta `error` en el recuadro rojo, sin traducir nada.
- `mensajeLegible()` mapea `status`/errores de red a texto. Si sumás un proveedor, mapeá sus
  errores ahí también.

---

## Canvas / interacción

### 12. `applyingRef` en `usePanInertia`
- **El bug que resuelve**: el glide llama `setViewport()`, React Flow lo traduce a un
  `d3-zoom.transform()` sobre una selección desnuda, que **dispara sincrónicamente un evento
  `start`** con `sourceEvent === undefined`. Ese `start` entraba a `onMoveStart` → cancelaba el
  envión en el **primer frame**. El flag marca "esto lo disparé yo, ignoralo".
- **Verificado** (A/B con stubs de `performance.now` + rAF): 1 frame/12px con el bug vs
  38 frames/145px arreglado. Commit `ff595e3`.
- **Revertir**: el envión al panear vuelve a no existir (se auto-cancela).

### 13. Borrar es **solo** por el botón 🗑; `deleteKeyCode={null}`
- **Por qué**: evitar borrar un subárbol con Backspace mientras se escribe o navega.
- Todo borrado pasa por `deleteNode`: cuenta descendientes, `window.confirm` si borra >1,
  **aborta las llamadas a la IA en vuelo** de lo que se borra, y deja activo al padre.

### 14. Modo del lienzo por `spaceHeld` (listener propio), no por los keycodes de React Flow
- Sin teclas → manito (`panOnDrag`). Barra espaciadora → puntero (`selectionOnDrag`, recuadro).
- `selectionKeyCode={null}` y `panActivationKeyCode={null}` — se maneja todo con el flag propio
  para que el envión y los dos modos convivan.

### 15. `@xyflow/system` pinneado a `0.0.81`
- Pin exacto en `package.json`. No subirlo junto con `@xyflow/react` sin verificar a mano que
  edges y handles (`source id="main"|"branch-left"|"branch-right"`) siguen dibujándose.

### 16. Abrir un globo = panel de transcripción de la rama (`BranchTranscript`)
- **Qué muestra**: el camino raíz→globo (`caminoRaizA`, ya existía) aplanado a pregunta/respuesta,
  tipo chat. **No** solo ese intercambio: la rama entera es lo útil para releer/copiar un plan, y
  "solo este" es el caso degenerado (la última entrada). Decidido con el usuario el 29-08-2026.
- **Vista derivada, cero estado en el árbol**: igual que todo lo demás (invariante). El único
  estado nuevo es `transcriptNodeId` en `FlowCanvas` (qué globo está abierto). Si ese nodo se
  borra, `caminoRaizA` devuelve `[]` y el panel no se renderiza (`length > 0`).
- **Trigger doble**: `onNodeDoubleClick` (+ `zoomOnDoubleClick={false}`, si no React Flow hace
  zoom) y botón ⤢ en el `NodeToolbar`. El toolbar ahora se muestra también en el globo raíz
  (antes estaba detrás de `!isRoot`), pero ahí solo con ⤢ — el raíz sigue sin poder borrarse.
- **Lado del panel configurable** (izq/der): botón ⇄ en el header del panel → `settings.transcriptSide`
  (persiste como el resto de `Settings`). Se prefirió el toggle en el propio panel antes que una
  opción en ⚙️: se decide en el momento de mirarlo. Default `"right"`. El panel es un overlay
  full-height con backdrop: a la derecha tapa el minimapa, a la izquierda tapa la ⚙️ — por eso el
  toggle, no un lado fijo.
- **Revertir** (guardar la transcripción como estado / nodo): rompe la invariante "el árbol es la
  fuente de la verdad, la vista se deriva".

---

## Fase 2 — backend opcional (Supabase)

> El plan completo está en `docs/fase-2.md`. Acá van las decisiones de implementación de lo que
> ya se codeó (2.0 fundaciones + 2.3 compartir por link).

### F2-1. Supabase es **opcional**: `getSupabase()` devuelve `null` si no hay env
- **Por qué**: la invariante de fase 1 ("todo client-side, sin backend") no se rompe — se vuelve
  condicional. Sin `NEXT_PUBLIC_SUPABASE_*`, `haySupabase()` es `false`, el botón "Compartir" no
  aparece, y la app es idéntica a fase 1.
- **`persistSession: false`** en el cliente: 2.3 no usa login, y `detectSessionInUrl` pelearía
  con el `?compartir=<slug>` que leemos de la URL.
- **Revertir** (hacer Supabase obligatorio): rompe el modo local puro y el deploy sin secrets.

### F2-2. Las env `NEXT_PUBLIC_SUPABASE_*` son públicas, pero NO son la key de IA
- La `anon`/`publishable` key de Supabase **está diseñada para ir en el bundle del navegador**
  (RLS protege los datos). Distinto de la API key del proveedor de IA, que sigue sin tocar
  ningún server (invariante intacta). La `service_role` de Supabase **nunca** va al repo ni al
  cliente — solo dentro de Supabase (edge functions de 2.1+).
- Van igual como *repo secrets* de GitHub Actions (buena costumbre, no dejarlas en el fuente).

### F2-3. Un árbol compartido = **un JSON** en Storage, no N archivos `.md`
- **Qué**: `arboles/<slug>.json` con `{ v, titulo, creado, files: { [id]: "<md>" } }` — la misma
  forma que `localStorage["3maps:arbol"]`. El `.md` sigue siendo el formato canónico (spec §7,
  "el servidor solo lo aloja"); el JSON es solo el sobre, igual que en localStorage.
- **Por qué no N archivos**: subir un árbol de 50 globos serían 50 requests. Un PUT vs 50.
- **`slug` = el secreto**: 10 chars de un alfabeto sin ambiguos. Sin tabla de metadata ni "mis
  árboles" todavía (llega con login, 2.2/2.4).
- **Revertir** (esquema relacional para el árbol): duplica formato, diverge del `.md` y del export.

### F2-4. Compartir es **anónimo**; despublicar necesita haber compartido **logueado**
- **Anónimo por defecto**: cualquiera genera un link sin cuenta (`insert` abierto en el bucket).
- **Despublicar** (fase 2.2b): la política de `delete` de `storage.objects` está scopeada a
  `owner = auth.uid()`. Supabase setea `owner` al subir **con sesión**; los subidos anónimos
  tienen `owner NULL` → **no se pueden despublicar** (por eso el hint "iniciá sesión antes de
  compartir"). La tabla `shared_trees` guarda la metadata (slug/titulo/creado) solo de los que
  compartiste logueado — el árbol en sí no la necesita para abrirse (el título va en el JSON).
- **`shared_trees` insert es soft-fail**: si falla (tabla no creada, RLS), el `compartirArbol`
  igual devuelve el link — el árbol ya está subido. Solo no aparece en "mis árboles".
- **`cargarArbolCompartido` baja con `fetch(getPublicUrl, {cache: "no-store"})`, NO con el
  `.download()` del SDK**: Supabase le pone `Cache-Control: max-age=3600` a los objetos públicos;
  el `.download()` usa el caché del browser → un árbol despublicado seguía visible hasta 1h para
  quien ya había abierto el link. Sin caché, el despublicar se siente al instante. Los archivos
  son <1 MB y se bajan on-demand, así que re-descargar no duele. Commit `e9b5c0c`.
- **Límite conocido**: un anónimo puede spamear archivos chicos y llenar el free tier. Mitigado
  con tope de 2 MB (bucket) + tope cliente (50 globos / ~1 MB). El rate-limit real necesita un
  edge function — anotado en `docs/fase-2.md`.

### F2-5. Ver un árbol compartido = **modo lectura efímero**, no se persiste
- **Qué**: con `?compartir=<slug>` en la URL, el árbol se carga en estado pero el effect de
  `guardarArbol` se apaga (`!readOnly`). `readOnly` se propaga por `NodeActionsContext` y esconde
  Eliminar/Reintentar; el `<Composer>` no se renderiza; `handleSubmit`/`deleteNode`/`retryNode`
  son no-op. Pan/zoom/abrir transcripción sí andan (no mutan el árbol de verdad).
- **"Guardar en mi 3maps"**: `guardarArbol` + saca el `?compartir=` de la URL + `readOnly` pasa a
  false → el árbol es ahora local y editable.
- **Link roto**: `cargarArbolCompartido` devuelve `null` → se limpia la URL y se cae al árbol local.
- **Revertir** (una ruta `/compartir/[slug]` aparte): `output: "export"` no hace rutas dinámicas
  sin `generateStaticParams`; el query param es lo que funciona con el deploy estático.

### F2-6. El proxy de IA es un edge function **stateless y sin auth de Supabase**
- **`verify_jwt = false`** (`supabase/config.toml`): pedir la anon key no aporta — es pública, va
  en el bundle. Y la `sb_publishable_…` nueva **no es un JWT**, así que la verificación la
  rechazaría. El control de abuso real es la lista de orígenes + que cada request trae su propia
  API key (el costo de abuso para nosotros = invocaciones del edge function, free tier 500K/mes).
- **No toca ningún secreto**: la key del proveedor viene en el header `x-ia-key` de cada request.
  El function no tiene env propias (salvo `PROXY_ALLOWED_ORIGINS`, opcional).
- **Rate-limit**: no hay todavía. Anotado en `docs/fase-2.md` — necesita estado (KV) en el function.
- **Revertir** (poner la key del proveedor como secreto del function): serían llamadas con NUESTRA
  cuenta, no la del usuario — rompe el modelo "cada uno paga la suya".

### F2-7. Login opcional = **Google OAuth + magic link**; la sesión vuelve en el hash
- **Google OAuth** (`signInWithGoogle` → `signInWithOAuth({provider:'google'})`) es el camino
  principal: un click, sin mail, anda en incógnito. Se agregó cuando el magic link se volvió
  impráctico para probar sync en 2 dispositivos (límite de ~4 mails/hora del free tier +
  el link se abre en la pestaña equivocada).
- **Magic link** (`signInWithOtp`) queda como alternativa sin depender de Google.
- Las dos vuelven con `#access_token=…` en el **hash**, que `detectSessionInUrl` levanta.
- Config del provider: OAuth client en Google Cloud (redirect URI
  `<supabase>/auth/v1/callback`) + habilitar Google en Supabase → Auth → Providers.
- **`detectSessionInUrl: true` + `?compartir=` conviven**: el magic link vuelve como
  `…#access_token=…` (fragmento **hash**), que `detectSessionInUrl` levanta y limpia; el slug de
  compartir es un **query param** (`?compartir=`), otro espacio. Se pusieron `persistSession` y
  `autoRefreshToken` en true (antes false, cuando 2.3 no usaba login).
- **Sin sesión, la app es igual**: `useSesion` devuelve `usuario: null`; nada del canvas ni de
  compartir-anónimo depende de estar logueado. El login solo suma "mis árboles" (2.2b) y sync (2.4).
- **Free tier**: Supabase manda ~2-4 mails/hora sin SMTP propio. Si molesta, configurar SMTP o
  sumar un provider OAuth.
- **Revertir** (volver a `persistSession: false`): rompe que la sesión sobreviva al reload.

### F2-8. Sync del árbol de trabajo = **last-write-wins por hora del SERVIDOR**, sin prompt
- **Decidido con el usuario**: "gana el último que guardó". Un `<uid>/arbol.json` en el bucket
  privado `sync`.
- **El orden lo define la hora del SERVIDOR de Supabase** (`updated_at` del objeto de Storage,
  leído con `storage.list()`), **NUNCA `new Date()` del navegador**. Los relojes de los
  dispositivos no coinciden — con la hora del cliente, el device atrasado nunca "ganaba" y el
  otro re-subía en cada carga (ping-pong). Bug real encontrado al probar, fix en `d4fd33a`.
- **`localStorage["3maps:sync"] = { at, hash }`**: `at` = el `updated_at` (servidor) de la
  versión que sincronizamos; `hash` (djb2 del contenido) para saber si lo local cambió sin subir.
- **`planInicial(arbolLocal, uid)`** al abrir: sin objeto → subir; `at` de la nube ≠ nuestro `at`
  → traer (otro dispositivo escribió); iguales y hash local cambió → subir; iguales y mismo hash
  → **nada** (antes re-subía siempre).
- **El sync inicial corre UNA vez por uid y NO se cancela** (`inicialDe` ref, sin `vivo`/cleanup):
  `onAuthStateChange` emite un evento extra (`TOKEN_REFRESHED`) con un `user` nuevo → el effect se
  re-ejecutaba → el cleanup mataba el `planInicial` en vuelo y no lo reintentaba → el debounce
  subía el árbol vacío pisando la nube. **Bug que borró un árbol de prueba, fix `e76abaf`.**
- **`inicialListo` ref**: el debounce de subida NO arranca hasta que el sync inicial se aplicó.
- **`3maps:sync` incluye `uid`** (a qué cuenta pertenece el árbol local). Si logueás con OTRA
  cuenta en el mismo navegador y esa cuenta no tiene nada en la nube → `planInicial` devuelve
  `"vaciar"` (empezar de cero) en vez de subirle el árbol de la cuenta anterior. Estado sin `uid`
  (formato viejo / nunca sincronizado) = "sin dueño" → se sube normal (primer login legítimo).
  Bug encontrado al probar con 2 cuentas Google, fix `9b51912`.
- **Por qué no merge por-nodo / CRDT**: herramienta personal de un solo usuario. El merge real
  (tombstones, timestamps por nodo) no se justifica para "abrir en el celu lo que armé en la compu".
- **Sube con debounce (1.5s) + flush en `pagehide`/`visibilitychange`**.
- **No corre en modo `?compartir=`** (`activo = !readOnly`).
- **Revertir** (hora del cliente / sync manual): vuelve el ping-pong / te olvidás y perdés trabajo.

---

## Build / deploy

### 16. `output: "export"` + `basePath: "/3maps"` **condicional a `NEXT_PUBLIC_PAGES === "1"`**
- **Por qué**: `next dev` local queda en la raíz (`localhost:3000`), y solo el build del workflow
  de Pages lleva el prefijo `/3maps`. Un `basePath` fijo rompería el dev local.
- El deploy es automático en cada push a `main` (`.github/workflows/deploy.yml`).

### 17. Se sacó `enablement: true` de `actions/configure-pages`
- **Por qué**: el `GITHUB_TOKEN` del workflow **no puede crear el Pages site** ("Resource not
  accessible by integration"). Pages se habilitó **a mano una vez** (Settings → Pages → Source:
  GitHub Actions). Commits `5ac0922` (lo agregó) → `e54cdc1` (lo sacó) → `11adc6f` (re-trigger ok).
- **No volver a agregarlo**: ya está habilitado, y falla el run si lo ponés.

### 18. `agentRules: false` en `next.config.ts`
- Para que `next dev` de Next 16 **no escriba reglas en `CLAUDE.md`**. Commit `d805723`.

---

## Proceso / herramientas

### 19. Sin test runner. Lógica pura → `npx --yes tsx _scratch.mts`, y borrar el scratch
- **Por qué**: fase 1, no se justifica Jest/Vitest. `tsx` resuelve imports `.ts` sin extensión
  (`node --strip-types` no). Node local es v24.
- El armado del contexto (`contexto.ts`) se validó así con 22 asserts antes de commitear.

### 20. Verificación en browser: pane integrado para **lógica/datos**, Chrome real para **render/inercia**
- El preview pane congela `requestAnimationFrame`/`ResizeObserver` y throttlea `setTimeout` → los
  nodos de React Flow quedan sin medir y los gestos sintéticos miden ~70× lento. **No es un bug
  de la app** (confirmado idéntico en commits pre-refactor). Detalle en `.claude/napkin.md`.
