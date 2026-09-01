# Decisiones — 3maps

> Por qué el código es como es. Cada entrada: **qué se decidió**, **por qué**, y **qué romperías
> si lo revertís sin pensar**. Si vas a ir en contra de una de estas, que sea a propósito.
> Última actualización: 01-09-2026.

Complementa a:
- `docs/spec-proyecto.md` — el diseño y las decisiones de producto (modelo de datos, UX, roadmap).
- `docs/arquitectura.md` — qué hace cada archivo.
- `docs/historia.md` — qué shippeó cada fase.
- Este archivo — decisiones de implementación que no son obvias mirando el código.

Índice: **§1-5** datos/`.md` · **§6-11** IA · **§12-16** canvas · **F2-1..F2-8** fase 2 ·
**F3-1..F3-11** fase 3 · **§21-23** build · **§24-25** proceso.

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

### 7a. Los proveedores OpenAI-compatibles van por el **proxy de 3maps** (no habilitan CORS)
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
  el proveedor. SSE estilo OpenAI (`choices[0].delta.content`). Sin el toggle, esos proveedores
  tiran un `ErrorIA` explicativo.
- **Anti-SSRF**: el cliente manda un *nombre* de proveedor (`x-ia-provider`), no una URL; el proxy
  lo mapea a una base fija (mapa `PROVEEDORES` del edge function). Rutas limitadas a
  `/chat/completions` y `/models`.
- **Proveedores vía proxy** (5): `deepseek`, `gpt` (`openai`) — pagos; + free tiers →
  `groq`, `openrouter` (`:free`), `huggingface`. Todos OpenAI-compatibles
  → mismo `llamarOpenAICompat` / `listarModelosOpenAICompat`. `upstreamDe` = mapa `Proveedor →
  clave del proxy`. **Descartados**: `cerebras`, `siliconflow`, `zhipu`, `moonshot`, `mistral`,
  `qwen` (§7d — free real gateado o inutilizable; no sirven para "gratis sin tarjeta"); Cloudflare
  (`account_id` en la URL), Doubao/ERNIE/Hunyuan (verificación de empresa / OAuth), Kling/Seedance
  (video). **Redeploy del edge function obligatorio** al sumar/cambiar un proveedor
  (`supabase functions deploy ia-proxy` o el editor del panel).
- **`GUIA_API_KEY`** (`ia.ts`, 31-08-2026): por proveedor, `{ url, gratis, abierto?, pasos[] }` —
  mini-guía paso a paso "cómo consigo la key" para gente que nunca usó una. `SettingsPanel` la
  muestra en un `<details>` bajo el input, con un botón que abre la web del proveedor y avisa si
  cobra (sugiriendo Gemini). `abierto: true` (groq, openrouter, huggingface)
  → agrega la línea "acá usás modelos open-source (Llama, Qwen, DeepSeek, GLM…)". No hay proveedor
  "open-source" aparte: los modelos abiertos ya se sirven vía esos (online); un modo offline
  tipo Ollama quedó descartado por ahora (mixed-content/CORS + el celu no llega a `localhost`).

### 7d. Cerebras, SiliconFlow, Zhipu, Moonshot, Mistral, Qwen: eliminados (free inutilizable)
Probados uno por uno (01-09-2026). Todos autentican y listan modelos, pero el free tier no da una
experiencia fluida a un usuario nuevo:
- **Cerebras** (`cloud.cerebras.ai`, sin tarjeta): la página *Limits* muestra `gemma-4-31b` /
  `gpt-oss-120b` con cuota (5 rpm, 3M tok/día), pero **toda** llamada a `chat/completions` →
  `402 "Payment required to access this resource. Visit your billing tab."` (0 tokens, confirmado
  en los Request Logs de Cerebras → la rechaza Cerebras, no el proxy). El free tier es solo del
  playground; la API pide billing.
- **SiliconFlow** (sitio global `.com`, registro con mail): la 1ª llamada pasa (usa el ~$1 de
  trial, $0.0001), después `Qwen/Qwen3-8B` → `"Sorry, your account balance is insufficient"`.
  Desde el 15-may-2026 los modelos `:free` exigen **verificación de identidad real-name** que solo
  acepta documentos de China continental (los internacionales "contactar a soporte").
- **Zhipu** (`open.bigmodel.cn`) y **Moonshot** (`api.moonshot.cn`): registro solo en sitio `.cn`
  con CAPTCHA + teléfono chinos + real-name. Eliminados **sin probar** — el patrón es el mismo.
- **Mistral** (`console.mistral.ai`): free tier real pero **1 request por minuto**. Ramificar en
  paralelo (el punto de 3maps) con 60s de espera entre llamadas no es una experiencia usable.
  Eliminado sin probar e2e (decisión del usuario: "buscamos una experiencia fluida").
- **Qwen** (Alibaba Cloud Model Studio, consola internacional `.alibabacloud.com`): el endpoint
  `dashscope-intl` sí es OpenAI-compat y hay free tier, pero el signup pide **verificar una
  tarjeta** con un cargo de $1 (además de teléfono + KYC de Alibaba Cloud) — los docs decían "no
  credit card required", la realidad no. DeepSeek ya cubre "modelo chino barato con tarjeta".
- **Qué se hizo**: los 6 sacados de `Proveedor` (`intercambio.ts`), `PROVEEDORES*`,
  `MODELO_POR_DEFECTO`, `NOMBRE_PROVEEDOR`, `PISTA_API_KEY`, `GUIA_API_KEY`, los `switch` de
  `ia.ts`, `UPSTREAM`, y el mapa `PROVEEDORES` del `ia-proxy` (redeploy). Una config vieja con
  `activo` en uno de esos cae al default (`esProveedor` en `configIA.ts` la filtra sola).
  **13 → 7 proveedores** (5 vía proxy). `MODELOS_SUGERIDOS` ya se había eliminado (F3-13).
- **Regla**: un proveedor solo entra si un usuario nuevo cualquiera puede sacar una key **y
  llamar la API gratis y fluido** — sin tarjeta, sin verificación de identidad, sin registro
  China-only, y sin un rate-limit que rompa el ramificar en paralelo. Probarlo con una key nueva
  de verdad antes de darlo por bueno.
- **Revertir**: volvés a ofrecer proveedores que le tiran 402 / "insufficient balance" / 429 a cualquier
  usuario nuevo.

### 7b. Modelos de Gemini: default `gemini-3.7-flash`, "thinking" mínimo por generación, botón "ver modelos"
La API de Gemini se renovó entera en 2026 y una key **free tier** nueva de AI Studio se comporta
distinto a lo que dicen los blogs y hasta `ListModels`. Lo aprendido, ya en el código:

1. **Default = `gemini-3.7-flash`** (Flash estable más nuevo). Una key free NUEVA da **404** en
   TODOS los `2.5-*` ("use gemini-3.x") y los alias `*-latest` resuelven a modelos paid. Sugeridos:
   `3.7 / 3.6 / 3.5-flash / 3.5-flash-lite`.
2. **`thinkingConfig` mínimo, forma por generación** + `maxOutputTokens: 8192`: `3.x` →
   `{ thinkingLevel: "low" }` (mandar `thinkingBudget` acá = **400**); `2.x/1.x` →
   `{ thinkingBudget: 0 }`. Sin esto los flash "piensan" y se comen todo el `maxOutputTokens` →
   respuesta vacía. El parser descarta `parts` con `thought: true` y procesa el último bloque
   aunque no termine en `\n\n`.
3. **`listarModelos(config)`** (`ia.ts`) — GET `…/v1beta/models` (Gemini) / `client.models.list()`
   (Claude). **No gasta tokens**; 401 si la key es inválida (§8c). Se dispara solo al Guardar una
   key. Modelo guardado fuera de la lista → aviso ámbar. **Es la única fuente de verdad de qué
   modelos puede usar esa key.**
4. **`GEMINI_MODELOS_MUERTOS`** (`ia.ts`, `configIA.ts` lo re-exporta como `MODELOS_MUERTOS`):
   `gemini-2.0-flash` / `-1.5-flash` / `-pro` (retirados) + alias `*-latest`
   (`gemini-flash-latest`, `-pro-latest`, `-flash-lite-latest` → paid / "invalid argument" en
   free tier). Efecto triple: (a) `configIA` los migra al default al cargar; (b)
   `listarModelosGemini` los esconde de los chips de "ver modelos"; (c) si el usuario igual
   tipea uno, `SettingsPanel` avisa en ámbar ("no anda en free tier, se usa `gemini-3.7-flash`")
   en vez de swappear en silencio (antes: "¿por qué me cambió el modelo?"). Los `2.5-*` **NO**
   van acá (una cuenta vieja/con billing sí los llama; Google devuelve su propio mensaje claro).
5. **`mensajeErrorGemini(res, modelo?)`** — helper único de errores para todos los endpoints. 404
   con modelo → sugiere el botón; 503 → texto de Google; **401 `ACCESS_TOKEN_TYPE_UNSUPPORTED`** →
   la cuenta emite keys `AQ.…` que en algunas cuentas todavía no andan en la REST API (bug de Google).

**Lección**: para el default de un servicio con free tier, probar con una key nueva de verdad —
`ListModels` lista modelos que la key ve pero no puede llamar. El botón "ver modelos" + el
`mensajeErrorGemini` transparente destrabaron el diagnóstico.

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
- Separado de `"3maps:settings"` porque es más sensible (varias API keys).
- **Atadas a la cuenta (30-08-2026)**: el almacén tiene un campo `dueño` (uid). Si en el mismo
  navegador se loguea OTRA cuenta, `scopeConfigIA(uid)` **borra todas las keys locales** — son lo
  más sensible (facturación). Casos: keys pegadas sin login (`dueño: ""`) → la primera cuenta que
  loguea las **adopta**; misma cuenta → no toca nada; **logout → tampoco toca nada**. Bug
  encontrado por el usuario: logueó una cuenta nueva y heredó la key de la anterior.
- **Sincronizadas entre dispositivos con sesión (31-08-2026)**: además del `localStorage`, el
  almacén viaja a `sync/<uid>/config.json` (bucket PRIVADO del propio usuario, RLS por cuenta —
  ver `exportarConfigNube` / `fusionarConfigNube` en `configIA.ts`, `bajar/subirConfigNube` en
  `sync.ts`). Al cambiar de sesión: `scopeConfigIA` primero (borra si es otra cuenta), después
  `bajarConfigNube` → `fusionarConfigNube` (unión de keys, **en conflicto gana la nube** = el
  último estado subido; adopta el `activo` de la nube si tiene key). Se re-sube tras cada
  `guardar/cambiar/borrar` y tras la fusión inicial. `dueño` NO viaja (el path es el scoping).
  **Esto relaja la invariante de CLAUDE.md**: las keys ahora se guardan en la infra del usuario
  (su propio Storage de Supabase), nunca en la nuestra ni compartidas. Decisión del usuario: el
  dolor de re-pegar la key en cada dispositivo pesaba más que el riesgo (Storage privado + RLS).
- **Revertir** (sacar el sync de config): volvés a re-pegar la key en cada dispositivo; el bug de
  "heredé la key" ya está cubierto por `scopeConfigIA` solo.

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

> Qué shippeó cada bloque: `docs/historia.md`. Acá el **por qué** de la implementación.

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
  edge function con estado (KV) — pendiente.

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
- **Rate-limit**: no hay todavía — necesita estado (KV) en el function. Pendiente.
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
- **Login NO es obligatorio** (decisión del usuario, 31-08-2026 — se planteó forzarlo "para
  evitar problemas de sync" y se descartó: rompe el local-first / el pitch de "probá sin cuenta",
  y los bugs de sync eran bugs, ya arreglados). En cambio: `<LoginNudge>` (pill descartable para
  el deslogueado) + al fusionar la lista, `fusionarMapasNube` renombra `"X" → "X (2)"` si el
  título choca con otro id (dos dispositivos que generaron "Mapa 2" a la vez), y `nombreMapaLibre`
  usa el primer "Mapa N" libre (no `count + 1`).
- **Free tier**: Supabase manda ~2-4 mails/hora sin SMTP propio. Si molesta, configurar SMTP o
  sumar un provider OAuth.
- **Revertir** (volver a `persistSession: false`): rompe que la sesión sobreviva al reload.
- **Pantalla de consentimiento PUBLICADA** ("En producción", 30-08-2026 → cualquiera loguea con
  Google, no solo test-users). Para pasar de "Prueba" a "Producción", Google Cloud pide (consola
  nueva "Google Auth Platform"): (1) los 3 permisos **no sensibles** cargados explícitamente en
  "Acceso a los datos" (`.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid`) — sin
  esto la config figura "incompleta" y el botón "Publicar app" queda gris; (2) URLs de Política
  de Privacidad y Términos → `public/privacy.html` + `public/terms.html` (estáticos, se deployan
  a `alanepazs.github.io/3maps/{privacy,terms}.html`); (3) el dominio de esas URLs como "dominio
  autorizado" (`alanepazs.github.io`) + homepage. **Sin revisión de Google** porque los permisos
  son no sensibles → queda en producción para siempre, no hay pantalla de "app no verificada".

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

## Fase 3 — pulido de UX

### F3-1. Preferencia de vista (colapsado/expandido del globo) va aparte del `.md`
- `localStorage["3maps:vista"]` = `{ expandidos: { [id]: bool } }`, NO frontmatter. Es cómo mirás
  este navegador, no contenido. Estado local en `MessageNode` (`override ?? !colapsable`, colapsa
  por defecto arriba de 400 chars). Global (no per-mapa): los ids son únicos entre mapas.

### F3-2. La flecha rama↔tronco salta de lado DURANTE el drag, no al soltar
- `FlowCanvas` envuelve el `onNodeDrag` de `useNodeInertia`: si el nodo es rama, actualiza el
  `sourceHandle` (y el `targetHandle`, ver F3-2b) del edge en el estado `edges` en vivo (un
  `findIndex` + copia por frame, sin tocar el árbol). `asentar` sigue fijando `rama` al soltar.
  Es solo cosmético.

### F3-2b. La rama entra al hijo por el COSTADO, no por arriba (01-09-2026, pedido de Alan)
- **Antes**: el `MessageNode` tenía UN handle de entrada, arriba (`Position.Top`), y `arbolAVista`
  solo seteaba `sourceHandle` → toda rama salía del costado del padre pero **entraba por arriba
  del hijo**. El spec solo decía "la rama sale por un costado *del padre*" — nunca aclaró el lado
  del hijo → **nunca quedó implementado de las dos puntas** (no era un bug, quedó a medias).
- **Ahora**: `MessageNode` tiene 3 handles `type="target"` — `t-top` (`Position.Top`),
  `t-left` (`Position.Left`), `t-right` (`Position.Right`). Los de costado **se solapan** con los
  handles `source` del mismo lado (`branch-left`/`branch-right`) → no agregan puntos visibles.
- `arbolAVista` setea `targetHandle` según la rama: `branch-right` → `t-left` (sale por la derecha
  del padre, entra por la izquierda del hijo), `branch-left` → `t-right`, `main` → `t-top`.
- **Regla**: rama = costado ↔ costado; tronco (`main`) = abajo del padre ↔ arriba del hijo,
  siempre vertical.
- El root no tiene ningún handle `target` (no recibe edge).
- **Revertir**: sacar los handles `t-left`/`t-right` y el `targetHandle` de `arbolAVista` → la
  rama vuelve a entrar por arriba del hijo.

### F3-3. Auto-layout ("Ordenar") = layout propio, no dagre/elk
- El modelo tronco (`main` vertical) + ramas (`branch-*` en columnas al costado con su propio
  tronco) es específico; una librería genérica no lo respeta. `calcularLayout` en `layout.ts`,
  recursivo (~60 líneas), usa los altos medidos por React Flow. Escribe x/y al árbol Y a `nodes`
  (la firma de la vista excluye x/y a propósito → `setArbol` solo no movería nada).

### F3-4. Varios mapas: un árbol por mapa, sync PER-MAPA
- **Decidido con el usuario**: selector visible (chip al lado de ⚙️, no enterrado en ⚙️); cada
  mapa sincroniza en su propio `sync/<uid>/<mapId>.json`.
- **El sync NO es push en tiempo real.** Se TRAE del otro dispositivo: (a) `useSync` inicial al
  loguear / cambiar de mapa; (b) `revisarNube` en `useSync` — poll cada 15s + al volver a foco —
  para el mapa ABIERTO; (c) `sincronizarListaMapas` en `FlowCanvas` — mismo poll/foco — para la
  LISTA de mapas. `revisarNube` sólo trae si local está limpio (no pisa cambios sin subir) y
  pre-chequea `metaNube` (hora del servidor) antes de bajar el árbol. Latencia típica: ≤15s o al
  cambiar de app y volver.
- **La "respuesta quedó a medias" en rojo en el otro dispositivo** — 3 causas, todas atacadas:
  1. `subirYa` corta si algún intercambio está `pending` → no sube el árbol a mitad del streaming.
  2. **`parseMarkdown(md, { deOtroDispositivo: true })`** (lo usa `bajarArbolNube`): un `pendiente:1`
     traído de la nube = "el otro dispositivo lo está streameando AHORA" → se muestra como
     `pending` ("escribiendo…" + texto parcial), NO como error rojo. Un `pendiente:1` de un
     RELOAD local (o de un árbol compartido) sí es error (no hay llamada en vuelo).
  3. **Poll adaptivo** en `useSync`: mientras un globo traído sigue `pending`, chequea la nube
     cada 4s (no 15s) → cuando el otro termina, se completa rápido. Y al volver a foco este
     dispositivo, si estaba streameando en background, flush del push (sube la respuesta completa).
  El caso "app cerrada de verdad a mitad de la llamada" sigue con la "↻ Rehacer" del toolbar.
- `mapas.ts`: `3maps:mapas` + `3maps:mapaActivo` + `3maps:arbol:<mapId>`. **Migración**: al leer
  por primera vez se crea el mapa `principal` y se mueve el viejo `3maps:arbol`. En la nube, el
  mapa `principal` cae al viejo `arbol.json` si todavía no hay `principal.json`.
- `useSync` re-corre el sync inicial al cambiar de `(uid, mapId)`. `3maps:sync` pasó a
  `3maps:sync:<mapId>`.
- **Sync de la LISTA de mapas** (reescrito 31-08-2026 — pasó por 3 iteraciones):
  - **Fuente única = el índice `sync/<uid>/_mapas.json`** = `{ mapas: {[id]:{titulo,creado}},
    borrados: [id,...] }`. Un intento intermedio descubría mapas de `storage.list()` (todo
    `<id>.json` = un mapa) — pero eso **resucitaba todo árbol muerto** que hubiera quedado en
    Storage (incluido el `arbol.json` legacy de fase 2.4). Descartado.
  - `subirIndiceMapasNube` hace **UNIÓN de mapas + UNIÓN de tombstones**, y quita de `mapas` todo
    lo tombstoneado. Antes era un overwrite (cada `nuevoMapa`/`renombrar`/`borrar` pisaba la
    lista ajena — el bug que reportó el usuario: "Mapa 1" del celu no aparecía en la PC).
  - **Los borrados SÍ se propagan ahora** (vía `borrados`). Se descartó "no propagar borrados"
    porque en la práctica un mapa borrado volvía como fantasma en el otro dispositivo. Re-crear
    un mapa da un `mapa-<hex>` nuevo → nunca choca con un tombstone.
  - `sincronizarListaMapas` (FlowCanvas, al loguear + al volver a foco): baja el índice →
    `podarMapasBorrados(borrados, mapaActivo)` (borra local + su árbol, sin tocar el mapa activo)
    → `fusionarMapasNube(mapas)` → re-sube si local tiene algo que el índice no y no está
    tombstoneado.
  - Bug de caché: `bajar*` usaban `sb.storage.download()`, que sirve la versión cacheada por el
    navegador hasta 1h (`cache-control: max-age=3600` — igual que §F2-4). Ahora se sube con
    `cacheControl: "0"` y se baja por signed URL con `{ cache: "no-store" }` (`descargarTexto`).
- **Borrar el ÚLTIMO mapa** se permite. `borrarMapaActual` borra el mapa y, si no queda ninguno,
  escribe un mapa nuevo vacío. En la nube (en secuencia): `borrarMapaNube` (borra `<id>.json` +
  `arbol.json` legacy si es "principal") → `subirIndiceMapasNube(..., { borrar: [id] })`.
- **`leerMapas()` NO migra si `3maps:mapas` ya existe** (aunque sea `{}`). Antes: `{}` → dispara
  la migración → recrea "principal" → como "principal" no está tombstoneado, se re-sube al índice
  → reaparece en el otro dispositivo → **loop de mapas fantasma** que el usuario no podía cortar.
  `asegurarUnMapa()` (en el effect de hidratación) garantiza ≥1 mapa creando un `mapa-<hex>`
  nuevo (no "principal") si el registro quedó vacío.
- **"🧹 Empezar de cero"** (`empezarDeCero` / `empezarDeCeroNube`): borra TODOS los mapas —
  local + nube (menos `config.json`) — y deja UNO vacío, con todos los ids viejos + "principal"
  tombstoneados **y un `epoch` nuevo** (`Date.now()`) en el índice. Es la salida cuando el sync
  quedó enredado.
- **`epoch` de reset (01-09-2026)** — antes la convergencia dependía de que el otro dispositivo
  tuviera TODOS sus mapas locales en `borrados` (`rama "all-tombstoned"`). Fallaba si ese
  dispositivo tenía un mapa creado local y nunca subido (otro "Empezar de cero" previo,
  `asegurarUnMapa`): su id no estaba tombstoneado → `every(borrado)` falso → fusionaba en vez de
  resetear → `fusionarMapasNube` renombraba el mapa entrante a **"Mi mapa (2)"** y el "sanar
  índice" subía los dos → el bug se auto-perpetuaba en ambos. Ahora: `_mapas.json` lleva
  `epoch?: number`; cada dispositivo guarda el último aplicado en `3maps:sync:epoch:<uid>`; si
  `indice.epoch > epochAplicado(uid)` → **reset duro**: `sincronizarListaMapas` borra todo
  `3maps:(arbol|vista|sync):*`, adopta `indice.mapas` tal cual, marca el epoch y corta (no toca
  la lógica de tombstones). `subirIndiceMapasNube` arrastra el `epoch` de la nube (nunca lo
  baja). El dispositivo que resetea marca su epoch ANTES de subir → no se auto-resetea.
- La rama "all-tombstoned" de `sincronizarListaMapas` queda como fallback para el caso viejo (sin
  epoch en el índice).
- **Borrar el ÚLTIMO mapa == "Empezar de cero"** (`borrarMapaActual`, rama `eraUltimo`): en vez de
  `borrarMapaNube` + `subirIndiceMapasNube({borrar})` (que hace UNIÓN → un mapa fantasma del otro
  dispositivo, que esta PC nunca tuvo, sobrevive en el índice y re-sincroniza), llama a
  `empezarDeCeroNube` (tombstonea TODO lo de la nube + epoch). "No me queda ningún mapa" y
  "empezar de cero" son lo mismo para la convergencia.
- `sincronizarListaMapas` también: si el mapa activo desapareció (lo reseteó/borró otro
  dispositivo) → cambia a uno válido; si local Y nube quedan sin mapas → crea uno y lo sube.

### F3-7. Al crear un globo se busca un lugar LIBRE (no offsets fijos)
- **Por qué**: los offsets fijos (`parent.y + 240`, `hermanos * 40`, `parent.x + 400`) se
  pisaban en varios casos: 2 "continuar hilo" del mismo padre caían casi en el mismo lugar; una
  rama nueva se pisaba con la respuesta larga del padre o con una rama hermana larga.
- `ubicarNuevoGlobo` (layout.ts) escanea posiciones candidatas cerca del padre y devuelve la
  primera que no solapa NINGÚN globo (usa los rects reales medidos por React Flow). `main` →
  debajo, con columnas alternadas de fallback; `branch` → al lado con menos ramas (empate →
  derecha), filas hacia abajo si está lleno.
- **Las ramas alternan izq/der** (antes: siempre `branch-right`) → árbol parejo, tipo mapa de
  árbol real. El lado también decide el `sourceHandle` de la flecha.
- El alto del globo nuevo no se conoce al crearlo (aún no se midió) → estimado (`H_NUEVO=150`).
- **`resolverSuperposiciones`** (31-08-2026, pedido del usuario: "que NUNCA se pisen"): como el
  estimado casi siempre queda corto (respuestas largas), `FlowCanvas` corre esta pasada (debounce
  500ms, `resolverSolapes`) **al terminar cada respuesta** (`responder`). Empuja hacia ABAJO
  **solo** los globos solapados, mínimamente (`y = quieto.y + quieto.h + 24`), hasta 8 pasadas.
  No re-acomoda el árbol como "Ordenar" — un globo que ubicaste a mano y no pisa a nadie no se
  toca. **NO se llama al traer un árbol de la nube**: reposicionar marcaría el árbol como "con
  cambios" → lo re-subiría y frenaría el poll, con ping-pong de posiciones entre dispositivos. Si
  un árbol traído se pisa en tu pantalla → "▤ Ordenar" a mano. **Decisión del usuario** (vs.
  auto-Ordenar completo, que perdía el arreglo manual).
- **F3-7b (01-09-2026, bug de "ramificar una ramificación")**: la búsqueda de `branch` original
  probaba SOLO las 2 columnas pegadas al padre y bajaba hasta ~2700px (12 filas × 230) buscando
  hueco → en un árbol ancho las 2 columnas están tapadas por las ramas del abuelo y el globo
  nuevo caía lejísimo, abajo de todo, visualmente suelto. Ahora `ubicarNuevoGlobo` hace una
  búsqueda en **anillos acotada** alrededor del padre (hasta 2 columnas al costado × ±3 filas)
  y elige la candidata libre de **menor costo** — `fila` pesa más que `anillo`, así que preferir
  salir una columna al costado *a la altura del padre* antes que bajar mucho por su columna (se
  lee mejor como rama). Si NADA está libre cerca → cae pegada al lado preferido y `resolverSolapes`
  la baja por su columna. `handleSubmit` ahora llama `resolverSolapes()` al crear (no solo al
  terminar la respuesta) para asentar ese caso enseguida. Verificado con scratch (8 asserts) +
  repro en el pane (rama de un nodo medio en árbol denso → queda a `Δy=0` del padre, no a +2700).
- **F3-7c (01-09-2026, "que no pisen NINGÚN globo" — Alan)**: seguía pisando porque (a) `H_NUEVO`
  era 150 y el globo nace colapsado a ~260 → se ubicaba en un hueco donde no entraba; (b) el
  fallback (búsqueda acotada sin resultado) quedaba *pegado al padre, pisándolo*. Ahora `H_NUEVO`
  = 260 (real), la búsqueda en anillos se amplió (0-3 columnas × filas −2..+5), y el fallback es
  **`bajarHastaLibre`**: baja por la columna del lado preferido (o el opuesto, el que caiga más
  cerca) en pasos de 44px hasta el primer lugar que **no pisa a nadie** — la columna es finita,
  siempre termina. Puede quedar más abajo, pero nunca encima de otro globo (prioridad de Alan
  sobre la cercanía). Igual para el fallback de `main`. Verificado: batería de 31 asserts (árbol
  ancho, respuestas largas, nudo de 22 globos) → 0 solapes.

### F3-6. La llamada a la IA tiene watchdog + `pending` se persiste
- **Por qué**: al ramificar varias ramas en paralelo, si el stream de un proveedor se queda
  colgado (conexión abierta sin datos), `reader.read()` no resuelve nunca → el globo queda
  `pending` para siempre y NO hay botón de reintentar (solo los globos en `error` lo tienen).
- **Watchdog** en `responder` (FlowCanvas): un `setInterval` cada 5s aborta el `AbortController`
  si no hubo actividad de `onTexto` en 45s, o si el total pasó 180s. Al abortar por timeout →
  `conError` con un mensaje reintentable (la respuesta parcial queda a la vista, `conError` no la
  borra). Un abort "normal" (el usuario re-disparó / borró el globo) sigue siendo silencioso.
- **`pending` ahora SÍ se persiste** (`pendiente: 1` en el frontmatter). Al recargar o al bajar
  de la nube, `parseMarkdown` convierte un `pendiente` sin terminar en un `error` reintentable
  (sin pisar un error real). Antes: `pending` no se guardaba → una llamada cortada al cerrar la
  app quedaba con texto a medias y sin forma de reintentar.
- **No se serializan las llamadas** (una rama espera a la otra): la idea de ramificar es lanzar
  varias exploraciones en paralelo. El watchdog cubre el caso de que una se cuelgue.
- **Botón "↻ Rehacer" en el toolbar de todo globo** (`retryNode`): además de regenerar una
  respuesta que no te gustó, recupera un globo que quedó estático de ANTES de este fix (su `.md`
  no tiene `pendiente:` → el watchdog/parseo no lo salvan). Antes "Reintentar" solo aparecía en
  el cuerpo de un globo en `error`.

### F3-5. Borrar la raíz: solo cuando ya no le cuelga nada
- **Decidido con el usuario**: nada de multi-raíz ni de promover un hijo. La raíz se borra solo
  si es el último globo → el mapa queda vacío (con confirm). `arbolAVista` expone `data.sinHijos`;
  `MessageNode` muestra 🗑 si `!isRoot || sinHijos`.

### F3-8. Redimensionar el globo: manija propia; tamaño en el `.md` (`Intercambio.ancho/alto`)
- **Por qué no `<NodeResizer>` de React Flow**: escribiría `width`/`height` en el nodo de RF y
  habría que reinyectarlas en cada rebuild de la vista. La manija propia (`onPointerDown` +
  listeners `pointermove`/`pointerup` en `window`, deltas `/ getZoom()`) es autocontenida.
- **El tamaño va al `.md`** (`ancho:` / `alto:` en el frontmatter, `null` = auto), como `x`/`y`.
  Antes vivía en `localStorage["3maps:vista"].tamanos` (per-navegador, no sincronizaba) — el
  usuario lo redimensionaba en un dispositivo y no aparecía en el otro (31-08-2026). Ahora
  sincroniza gratis con el árbol. `MessageNode` lee `data.ancho/alto`; durante el arrastre usa
  estado local (`drag`), al soltar → `resizeNode` (NodeActionsContext) → `conTamano` → `setArbol`.
  `ancho`/`alto` SÍ están en la `firma` de la vista (resize es infrecuente, un commit por
  arrastre) → un resize traído de la nube re-renderiza el globo. El colapso (`expandidos`) SÍ
  sigue local en `vista.ts` (es cómo mirás esta pantalla, no contenido).
- **Tamaño manual gana sobre el colapso de F3-1**: `mostrarColapsado = colapsable && !expandido && !tamano`.
  Doble clic en la manija o botón "↔ Auto" borra la entrada.
- El `pointerup` fuera de la manija dispara un `click` que caía en el fondo → se registra un
  listener `click` de captura `{once:true}` que se lo traga (mismo patrón en la manija del panel).

### F3-9. Ancho del panel lateral: **por dispositivo**, arrastre por DOM
- `settings.transcriptWidth = { mobile, desktop }`, bucket por `window.innerWidth < 768`. El
  arrastre mueve `panelRef.style.width` directo (fluido, sin re-render); al soltar persiste vía
  `onResize` y el padre reclampa a `[320, 75vw]`.
- **Móvil (`< 768`)**: sin manija, panel a pantalla completa, botón "🗺 Ver mapa" para cerrar.

### F3-10. Ctrl/Cmd+Enter ramifica, Enter continúa
- En `Composer` y en el mini-composer de `BranchTranscript`. `handleSubmit` ya aceptaba `"branch"`;
  se agregó leer `e.ctrlKey || e.metaKey` en ambos `onKeyDown` y el `kind` en el `onSubmit` del panel.

### F3-11. Móvil: `h-dvh` (no `vh`), tope de zoom bajo, controles despejados
- **`<main className="h-dvh">`** (era `h-screen` = `100vh`): `100vh` en móvil es el viewport
  GRANDE (barra de URL oculta) → con la barra visible el composer quedaba abajo del área visible y
  había que scrollear. `100dvh` sigue el chrome del navegador. + `overflow-hidden` en `<main>` y
  `<body>` (era `min-h-full`, dejaba crecer).
- **`fitOpts`** (memo según `esMobile`): `{ padding: 0.18, minZoom: 0.15, maxZoom: esMobile ? 0.7 : 1.2 }`
  a `<ReactFlow fitViewOptions>` y a los 4 `fitView()` manuales. Sin esto, `fitView` usaba el
  `maxZoom: 2` de RF y en el celu se veía 1 globo.
- **`globals.css` `@media (max-width:640px)`**: sube `.react-flow__controls` con `margin-bottom`
  (los tapaba el composer; `data-chat="oculto"` en el `<div>` raíz de FlowCanvas lo baja de nuevo
  cuando la barra está escondida) y oculta `.react-flow__minimap` (ocupaba media pantalla).
- **Panel de ⚙️**: `max-h-[calc(100dvh-18rem)]` en `< 640px` (`sm:max-h-[80vh]` arriba) para que
  la última sección se lea sobre el composer.
- **Esconder la barra de chat** (`settings.composerOculto`): botón `⌄` la baja/desvanece; queda un
  botón grande "✎ Escribir" (`rounded-full px-6 py-3`, ~46px — a propósito no un ícono chico).
  El `<div>` interno pasa a `pointer-events-none` cuando está escondida para no tapar el botón.
  Las transiciones CSS no corren en el preview pane → se verifica el estado final.

### F3-12. Render de respuestas: matemática (KaTeX) + HTML crudo saneado + strip de `<think>`
- **Contexto**: probando proveedores (Groq), las respuestas de temas de estudio salían rotas —
  el LaTeX (`$…$`, `\frac`, `\lim`) como texto crudo, `<br>` literal en las tablas, y el
  razonamiento de los modelos "reasoning" (`gpt-oss`, `qwen3`, Kimi) filtrándose en la respuesta
  con un `</think>` suelto. Nada de eso era el proxy ni la key — era el render.
- **`Markdown.tsx`**: `remark-math` + `rehype-katex` (con `katex/dist/katex.min.css` importado).
  `normalizarMath()` convierte `\[ \]`→`$$` y `\( \)`→`$` antes de parsear (remark-math solo
  entiende `$`). El `[ … ]` a pelo (sin backslash) que usan algunos modelos NO se toca — es
  ambiguo con un link/lista; se ataja con la instrucción de sistema.
- **`rehype-raw` + `rehype-sanitize`**: el modelo mete `<br>` en celdas de tabla (única forma de
  multilínea en markdown-tables). Antes `react-markdown` no interpretaba HTML → salía el texto
  `<br>`. Ahora se interpreta pero **saneado** (un árbol compartido `?compartir=` es de otra
  persona → no puede inyectar `<script>`). `sanitize` corre ANTES de `katex` (sanea el TeX como
  texto plano; katex después genera markup confiable). El schema agrega la clase
  `math math-inline|display` al allowlist (si no, katex no encuentra los nodos).
- **`ia.ts` `sinRazonamiento()`**: saca `<think>…</think>` y `◁think▷…◁/think▷` (variante que
  usan algunos modelos) del stream; un `<think>` sin cerrar oculta todo lo que sigue (así no
  parpadea mientras razona).
  `delta.reasoning` / `delta.reasoning_content` se ignoran. Si la respuesta fue 100% razonamiento
  → error claro ("se quedó razonando, subí max tokens / cambiá de modelo").
- **`.katex-compacto`** en `globals.css`: la matemática en bloque scrollea sola (los globos son
  ~260px), no rompe el layout.

### F3-13. El modelo se elige por chips (solo los de la key), no por `<datalist>` ni sugeridos
- **El bug del datalist**: el campo "Modelo" era un `<input list="modelos-ia">` + `<datalist>`.
  La flecha ▾ la dibuja Chrome y **filtra las opciones por el valor actual del input** → con un
  modelo válido ya tipeado (`gemini-2.5-flash`) el popup salía **vacío**. El popup nativo tampoco
  se puede estilar (se ve mal en tema oscuro).
- **Ahora**: sin `datalist`. Fila de chips clickeables bajo el input con **SOLO los modelos que
  la key puede usar de verdad** (`listarModelos` tras "verificar key"). El input de texto queda
  (podés tipear uno que no esté listado). Antes de verificar: sin chips (está el botón).
- **Se eliminó `MODELOS_SUGERIDOS`** (01-09): era una lista adivinada por proveedor que se
  mostraba como "Sugeridos" antes de verificar. Ofrecía modelos que la key no tenía (una key de
  Cerebras mostraba `llama-3.3-70b` etc. que no existían para esa key → "¿aparecieron modelos
  nuevos?"). **Regla nueva**: nunca ofrecer un modelo que no salió de la key. El default por
  proveedor sigue en `MODELO_POR_DEFECTO`.
- **Lista larga → `<details>` plegado** (01-09): con ≤12 modelos, chips inline como siempre.
  Con más (OpenRouter ~300, HuggingFace ~130), el bloque va dentro de un `<details>` cerrado
  ("Elegir de tus N modelos ▸") con un `<input>` de filtro por substring adentro. Se muestran
  **TODOS** los modelos de la key (sin tope — pedido del usuario); el contenedor de chips es
  `max-h-52 overflow-y-auto` (scroll propio) para no empujar el resto del panel. Mismo patrón
  `<details>` que la mini-guía de API key.
- **Revertir** (volver al datalist / a sugerir modelos adivinados): reaparece la flecha vacía /
  vuelve la confusión de "modelos que no son de mi key".

### F3-14. Un globo con basura del modelo no crashea la app — 3 capas
- **El crash** (encontrado por el usuario, 01-09): un modelo de HuggingFace devolvió una respuesta
  = `<PAD>` repetido ~2800 veces (token de padding filtrado). `rehype-raw` toma cada `<PAD>` como
  un tag HTML **sin cerrar** → ~2800 niveles de anidado → `RangeError: Maximum call stack size
  exceeded` al parsear → **crasheaba el render de TODO el canvas + todos los mapas** (Brave: "This
  page couldn't load"). La respuesta quedó guardada y sincronizada → crasheaba en cada carga.
  Reproducido con `renderToStaticMarkup`. Otros floods (`****…`, `[[[[…`, `> > > …` × miles)
  hacen backtracking catastrófico → **cuelgan** el parser (un hang NO lo agarra un error boundary).
- **Capa 1 — en el stream (`ia.ts` `sinTokensBasura`)**: el adaptador OpenAI-compat saca los
  tokens especiales (`<pad>`, `<unk>`, `<s>`/`</s>`, `<bos>`, `<eos>`, `<|…|>`, `<eot_id>`,
  `<end_of_turn>`, …) a medida que llegan → **no se guardan en el `.md`** (fuente de la verdad) ni
  se sincronizan. Si tras limpiar la respuesta queda vacía → `ErrorIA` reintentable (cae en el
  chequeo de "solo razonamiento").
- **Capa 2 — al renderizar (`Markdown.tsx` `sanitizarCrudo`)**, para contenido YA guardado: (a)
  mismo strip de tokens; (b) colapsa tiradas de char especial repetido (`([*_~[\]()#\`<])\1{15,}`)
  y de blockquote anidado (`(>[ \t]*){12,}`); (c) si aún quedan >120 aperturas de tag, escapa
  **todo** `<` → `&lt;`; (d) techo de 60k chars. Una tabla grande ronda 50 `<br>` → nunca se
  gatilla en contenido real (verificado: tabla + math + `<br>` + blockquote intactos).
- **Capa 3 — `<LimiteError>`** (`components/LimiteError.tsx`, error boundary de clase genérico):
  envuelve `<ReactMarkdown>` en `Markdown.tsx` (fallback = texto crudo en `<pre>`) **y el cuerpo
  de cada `MessageNode`** (fallback = "⚠ No se pudo mostrar esta respuesta" + "↻ Rehacer"). Si algo
  imprevisto igual TIRA (no cuelga), un globo roto muestra el fallback y el resto del árbol +
  los otros mapas siguen vivos. `resetKey` = el texto/`respuesta` → se recupera solo al cambiar.
- **No hace falta migración**: las capas 2 y 3 corren en cada render.
- **Revertir**: una respuesta con basura de tokens vuelve a poder tumbar toda la app.

### F3-14b. `normalizarMath` envuelve LaTeX crudo suelto en `$…$` (T13)
- **El problema**: modelos open-source chicos (gpt-oss-120b) escriben `\frac{a}{b}` entre
  paréntesis normales, sin `$`. `remark-math` solo entiende `$`/`$$` → quedaba LaTeX literal. F3-12
  solo cubre `\[ \]` y `\( \)`.
- **`envolverLatexCrudo`** en `Markdown.tsx`, antes de parsear, **línea por línea**: envuelve el
  token `\cmd` (+ args `{…}` / `_` / `^`, 1 nivel de anidado) en `$…$`. Saltea: líneas dentro de un
  fence ` ``` `, líneas indentadas 4+, líneas que ya tienen `$`, líneas sin `\`.
- **`esMathReal`**: un token cuenta solo si lleva `{`/`_`/`^` **o** es un comando de la lista de
  "sueltos" (`\cdot \sum \pi \le`…). Así `\n`, `\t`, `C:\newfolder`, "el comando `\frac`" (sin `{`)
  **no se tocan**.
- **Verificado** con `renderToStaticMarkup`: `\frac`/`\sqrt` → KaTeX; prosa, rutas, tablas + `<br>`
  intactos.
- **Revertir**: gpt-oss vuelve a mostrar `\frac{...}` como texto.

### F3-15. STOP por globo + el globo `pending` no crece con el stream (T1-T3)
- **`stopNode(id)`** (`NodeActionsContext`, como `retryNode`): `enVueloRef.current.get(id)?.abort("usuario")`.
  `responder` chequea `ctrl.signal.aborted && signal.reason === "usuario"` **al tope del catch** —
  `abort(reason)` hace que `fetch` rechace con el *reason* (string), no un `DOMException`, así que
  se mira el signal, no `e`. Conserva `ultimoAcumulado` (lo último que llegó, SIN el throttle de
  80ms del render) como respuesta final: `pending:false`, sin `error`. "↻ Rehacer" sigue.
- **Badge de lápiz + STOP** (`MessageNode`): mientras `pending && !readOnly`, un `<NodeToolbar
  align="start">` (se renderiza fuera del globo, que tiene `overflow-hidden`) con un `✏️` animado
  (`@keyframes lapiz-escribe` en `globals.css`, guard `prefers-reduced-motion`) + un botón cuadrado
  que llama `stopNode`.
- **`modoStream`** (`pending && !tamano && override !== true`): el cuerpo arranca clampeado a
  `ALTO_COLAPSADO` (220px) con `overflow-y-auto`. NO crece con el texto → no empuja el layout. Al
  terminar (`pending:false`) vuelve la lógica de F3-1 (`modoColapsadoFinal`: `overflow-hidden` +
  fade "⌄ ver más"). El tamaño manual (F3-8) sigue ganando.
- **Auto-scroll mientras `pending`**: el `useEffect([respuesta, pending, hayTamano])` apunta al
  contenedor scrolleable que corresponda — `cuerpoRef` (inner, `modoStream`) o `scrollExtRef`
  (wrapper externo `overflow-auto`, cuando hay tamaño manual). Solo fuerza el fondo si estás a
  <200px de él (si scrolleaste arriba a leer, no). Bug que arregla: agrandar el globo a mano
  mientras streamea apagaba el auto-scroll (Alan lo reportó).
- **`BranchTranscript`**: mismo patrón de auto-scroll (T14, `useEffect([ultimo.respuesta,
  streameando])`, guard <120px) + botón "↻ Rehacer" en el último intercambio (`onRetry` →
  `retryNode(transcriptNodeId)`).
- **Revertir**: el abort del usuario vuelve a ser silencioso (globo `pending` para siempre salvo
  watchdog) y el globo vuelve a crecer con cada token.
- **`prefers-reduced-motion`**: NO se saca la animación del lápiz — se cambia el meneo
  (rotate+translate) por un pulso de opacidad (`lapiz-pulso`, no vestibular). El pane y el Brave
  de Alan tienen reduce-motion → un `animation: none` dejaba el lápiz estático (bug que reportó).

### F3-16. ⚙️ `SettingsPanel` en 2 pestañas "Lienzo" / "IA" (T4, T5)
- **"Lienzo"** = envión al soltar + ventana de contexto + instrucción de sistema (comportamiento
  del mapa/conversación). **"IA"** = proveedor + API key + modelo + chips + toggle proxy + Cuenta
  + Compartir. Estado `tab` en `useState` (NO persiste — preferencia de sesión), arranca en
  "Lienzo". Se sacaron los headers de sección "Lienzo"/"IA" (los reemplazan las pestañas).
- **Caja ámbar del proxy**: la explicación larga ("no habilita CORS…") va en un `<details>`
  cerrado ("¿por qué pasa por un proxy? ▸"); el **checkbox del opt-in** y el aviso "esta instancia
  no tiene proxy" quedan siempre visibles. La caja ocupaba media pantalla y molestaba (pedido de Alan).
- **Revertir**: vuelve el panel apilado de 745 líneas en un solo scroll y la caja ámbar gigante.

### F3-17. Manija de resize del globo (◢): `nwse-resize` + contra-escala por zoom (T6)
- **`cursor-se-resize` → `cursor-nwse-resize`** (la flecha diagonal ↖↘). El `title` "Arrastrá para
  redimensionar" ya estaba.
- **Contra-escala**: `escalaManija = clamp(1, 1/zoom, 4)` con `zoom = useStore(s => s.transform[2])`
  (re-render solo al cambiar el zoom, NO al panear). `transform: scale()` en la manija (cosmético
  + área de click; no toca el cálculo del drag, que usa `rootRef.getBoundingClientRect()` / `getZoom()`).
  Sin esto, con zoom 0.15 la manija medía 2.4px en pantalla → imposible de agarrar; ahora ~9.6px.
- **Revertir**: la manija vuelve a volverse sub-píxel al alejar el zoom.

### F3-18. Flechas del panel: 2 laterales, espaciales, y el panel abre en "Vos" (T7-T9)
- **T7/T8/T14** (commit `244f578`): en `BranchTranscript` el intercambio se muestra en 2 turnos
  (Vos / IA con `NOMBRE_PROVEEDOR`), el mini-composer tiene STOP mientras streamea, y el
  auto-scroll sigue el texto (guard <120px del fondo).
- **T9 — flechas de navegación, rediseño (01-09, pedido de Alan)**. La 1ª versión eran 4 flechas
  ▲◀▶▼ en una fila bajo el header, con semántica de árbol (▲ padre, ◀▶ hermanos, ▼ 1er hijo) +
  "hermano N/M". Estaba **mal**: en el canvas el padre de una rama está al *costado*, no arriba, y
  un hijo-rama también → las flechas no se correspondían con el mapa. Ahora:
  - **2 flechas** (`‹` `›`), a media altura del panel, en el **margen** (padding `px-10`) entre el
    chat y el borde — con lugar para agarrar el borde a redimensionar.
  - **Sin flecha ↑**: al contexto (padre por tronco `main`, abuelos) se llega **scrolleando el
    panel hacia arriba** (ya muestra todo el camino raíz→globo). El padre por RAMA sí tiene flecha
    (ver F3-18c).
  - **F3-18b (01-09, "la flecha no respeta el cambio al mover el globo")**: `asentar` leía la
    posición final de `getNode(id)`, que en modo controlado va **un commit atrasado** respecto del
    `nodes` prop → a veces persistía una posición vieja (casi la de creación) y `nav` la usaba.
    Ahora `useNodeInertia` pasa la posición **autoritativa**: `onNodeDragStop(_, node)` → la del
    `node` de React Flow (drop), + lo que acumula el envión frame a frame (no `getNode`). `asentar`
    la recibe como 2º arg. Verificado en el pane: tras un drag, el `x` guardado == el `transform`.
  - **F3-18c (01-09, "navegan a hermanos y no al padre / rama de la que vengo")**. La versión
    "hermanos ordenados por X" confundía: `›` desde un globo saltaba a un hermano `main` en vez de
    al padre del que ramificó. **Regla final**: `nav` navega SOLO a los globos unidos al abierto
    por una **línea de costado** (F3-2b) — sus **ramas hijas**, más el **padre si el globo abierto
    es una rama** (`branch-left` → padre a la derecha `›`; `branch-right` → padre a la izquierda
    `‹`). Los hijos `main`, los hermanos y el contexto NO: a esos se llega por scroll del panel o
    click en el mapa.
  - **F3-18d (01-09, "tengo 2 ramas a la derecha y solo llego a una")**. `nav` devuelve una
    **lista por lado** (no un solo destino) → `BranchTranscript` apila **una flechita por rama**,
    en columna, ordenadas por el `y` del globo destino (borde superior, no el centro → no depende
    del alto). Cada flecha muestra la pregunta del destino al pasar el mouse (`aria-label` +
    `<span>` con `group-hover`). Si un globo se mueve, `nav` recalcula y las flechas se reordenan
    solas (ej: mové "metáforas" arriba de "1 intermedio" → su flecha sube). Verificado en el pane.
  - **F3-18e (01-09)**: al navegar (o abrir el panel), el globo que se ve en el panel queda
    **seleccionado en el canvas** (borde azul), igual que al clickearlo. `verGloboEnPanel(id)`
    (en `FlowCanvas`) hace `setTranscriptNodeId` + `setActiveNodeId` + `setNodes` con
    `selected: n.id === id`. Lo usan `openNode`, `onNodeDoubleClick`, `onNavigate` y el
    mini-composer. Antes el borde azul quedaba en el globo de donde habías navegado.
- **Abrir en "Vos"** (pedido de Alan): al abrir el panel o navegar, `scrollTop` se pone en el
  arranque del intercambio abierto (`inicioUltimoRef`, el `<div>` del último bloque), no al final
  de la respuesta — "así sabemos dónde estamos parados". Reemplaza el viejo `scrollIntoView(end)`
  on `[intercambios.length]`. El follow del streaming (T14) queda igual.
- **Revertir**: vuelve la fila de 4 flechas ▲◀▶▼ + "hermano N/M" y el panel abre scrolleado al final.

### F3-19. `llamarIA` devuelve `{ texto, uso }`; el `usage` del proveedor va al `.md` (T11)
- **Qué cambió**: `llamarIA` pasó de `Promise<string>` a `Promise<{ texto: string; uso: UsoTokens
  | null }>` (`UsoTokens = { entrada, salida }`). Los 3 adaptadores devuelven ese shape.
- **De dónde sale el `usage`**:
  - **Claude**: `final.usage` del `stream.finalMessage()`. `entrada = input_tokens +
    cache_read_input_tokens + cache_creation_input_tokens` (todo lo que entró como contexto,
    comparable con los otros proveedores); `salida = output_tokens`.
  - **Gemini**: `usageMetadata` del stream — llega **acumulativo**, nos quedamos con el último.
    `salida = candidatesTokenCount + thoughtsTokenCount` (el "thinking" se factura como salida).
  - **OpenAI-compat** (vía `ia-proxy`): hay que **pedirlo** — se agregó `stream_options: {
    include_usage: true }` al body. El proxy reenvía el body tal cual, así que no hubo que tocar
    el edge function. El chunk final del SSE trae `usage` con `choices: []` (el guard
    `if (!trozo) return` ya lo saltea para el texto). Groq/OpenRouter/DeepSeek/OpenAI lo soportan;
    si un proveedor lo rechazara habría que gatearlo por proveedor.
- **`uso: null` si el proveedor no lo manda** → sin contador para ese globo (nunca un "0" falso).
- **`resumir()` sigue devolviendo `string`** — desenvuelve `.texto` internamente. **`contexto.ts`
  NO se tocó** (no llama a `llamarIA` ni a `resumir`; `plan.md` decía "firma de resumir en
  contexto.ts" — era un error, `resumir` vive en `ia.ts`).
- **Persistencia**: `Intercambio.tokensEntrada` / `tokensSalida` (`number | null`), frontmatter
  `tokens_in:` / `tokens_out:` (flat, como `ancho`/`alto` — el parser de frontmatter no es YAML).
  `parseMarkdown` de un `.md` viejo sin esas líneas → `null` (`Number("") || null`).
- **`conRespuesta`** acepta `tokensEntrada?` / `tokensSalida?` **opcionales**: se pasan solo en la
  escritura final (con el `usage`); durante el streaming se omiten → se preservan; `FlowCanvas`
  pasa `null` explícito en el reset del reintento para no dejar el conteo viejo.
- **Falta**: que Alan confirme e2e (Chrome real, keys free) que `stream_options` no rompe
  Groq/OpenRouter/HuggingFace.
- **Revertir**: T12 (contador de tokens por globo) se queda sin datos; volvés a `Promise<string>`.

### F3-20. Contador de contexto = estimación local `Σ chars / 4`, nunca dispara el resumen (T10)
- **`estimarTokens(mensajes)`** en `contexto.ts`: `Math.round(Σ m.texto.length / 4)`. Regla de
  dedo de los tokenizers BPE (inglés/español), error ~±20 %. No se baja ningún tokenizer real
  (`js-tiktoken` pesa y no cubre a los proveedores no-OpenAI). Para "¿cuánto contexto mando?"
  alcanza.
- **Qué se cuenta**: `FlowCanvas` corre `estimarTokens(armarContexto(arbol, transcriptNodeId,
  {ventana}, resumen, relevantes))` en un `useMemo`. `resumen` = SOLO lo que ya esté en
  `resumenCacheRef` (de una llamada previa de esa rama); si no hay, `null` → `armarContexto`
  cuenta el tramo viejo completo. **Nunca se llama a `resumir()`** — el contador es lectura pura.
  Consecuencia: en una rama larga que todavía no preguntaste, el número es un **techo** (baja tras
  la primera llamada, cuando el resumen entra al cache).
- **Dónde**: header del panel `BranchTranscript`, junto a "N interc." → "· ≈ 3.2k tokens de
  contexto" (`fmtTokens` formatea el "k"). `title` aclara que es estimación. **Un solo número**:
  el del globo abierto. Se descartó un total del árbol entero — el panel es de una rama; si se
  quiere un "tamaño del mapa" va al lado del `MapaSwitcher`, no acá.
- **Revertir**: sacás `estimarTokens` + el `useMemo` + la prop → el panel no muestra el contexto.

### F3-21. Tokens gastados por globo, inline junto al proveedor (T12)
- Cada turno IA del `BranchTranscript` muestra `{fmtTokens(tokensEntrada)} → {fmtTokens(tokensSalida)}
  tok` al lado del nombre del proveedor, atenuado, con `title` que da los números exactos y aclara
  "entrada (contexto + pregunta)" / "salida". Lee directo de `Intercambio.tokensEntrada/Salida`
  (T11 / F3-19) — cero estado nuevo.
- **Nada si no hay tokens**: el guard es `typeof … === "number"` en AMBOS. Un `.md` viejo, un
  globo sin responder, o un proveedor que no mandó `usage` → no se muestra el bloque (nunca "0").
- **Sin total de rama** (era opcional en el plan). Si se quiere: sumar `tokensEntrada + tokensSalida`
  sobre `intercambios` en el header, al lado del contador de contexto.
- **`fmtTokens`** vive en `BranchTranscript.tsx` (exportado) — lo comparten el contador de contexto
  (F3-20) y este.
- **Revertir**: se saca el `<span>` del turno IA; los datos siguen en el `.md`.

---

## Build / deploy

### 21. `output: "export"` + `basePath: "/3maps"` **condicional a `NEXT_PUBLIC_PAGES === "1"`**
- **Por qué**: `next dev` local queda en la raíz (`localhost:3000`), y solo el build del workflow
  de Pages lleva el prefijo `/3maps`. Un `basePath` fijo rompería el dev local.
- El deploy es automático en cada push a `main` (`.github/workflows/deploy.yml`).

### 22. Se sacó `enablement: true` de `actions/configure-pages`
- **Por qué**: el `GITHUB_TOKEN` del workflow **no puede crear el Pages site** ("Resource not
  accessible by integration"). Pages se habilitó **a mano una vez** (Settings → Pages → Source:
  GitHub Actions). Commits `5ac0922` (lo agregó) → `e54cdc1` (lo sacó) → `11adc6f` (re-trigger ok).
- **No volver a agregarlo**: ya está habilitado, y falla el run si lo ponés.

### 23. `agentRules: false` en `next.config.ts`
- Para que `next dev` de Next 16 **no escriba reglas en `CLAUDE.md`**. Commit `d805723`.

---

## Proceso / herramientas

### 24. Sin test runner. Lógica pura → `npx --yes tsx _scratch.mts`, y borrar el scratch
- **Por qué**: fase 1, no se justifica Jest/Vitest. `tsx` resuelve imports `.ts` sin extensión
  (`node --strip-types` no). Node local es v24.
- El armado del contexto (`contexto.ts`) se validó así con 22 asserts antes de commitear.

### 25. Verificación en browser: pane integrado para **lógica/datos**, Chrome real para **render/inercia/animaciones**
- El preview pane congela `requestAnimationFrame`/`ResizeObserver`, throttlea `setTimeout`, **no
  progresa transiciones CSS** (reloj congelado) y a veces reporta `window.innerHeight`/`innerWidth`
  = 0 → los nodos de React Flow quedan sin medir, `100dvh` colapsa, los gestos sintéticos de
  teclado/drag no disparan. **No es un bug de la app** (confirmado idéntico en commits
  pre-refactor). Verificá el **estado final** (clases aplicadas, `pointer-events`, `localStorage`,
  `.textContent`); la animación en sí y el render los prueba el usuario. Detalle en `.claude/napkin.md`.
