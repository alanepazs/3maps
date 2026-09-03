# Decisiones — 3maps

> Por qué el código es como es. Cada entrada: **qué se decidió**, **por qué**, y **qué romperías
> si lo revertís sin pensar**. Si vas a ir en contra de una de estas, que sea a propósito.
> Última actualización: 03-09-2026 (backlog B1-B10 + B6 logo + fixes IA).

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

### 7e. Modelos OpenAI-compat escondidos de los chips (`modeloListable` en `ia.ts`)
El `/models` de Groq (y de cualquier proveedor del proxy) mezcla en la misma lista modelos de
chat con cosas que no sirven para 3maps: STT (`whisper-*`), TTS (`orpheus-*`), clasificadores
(`llama-prompt-guard-2-*`, `max_tokens` ≤ 512), y modelos que responden en otro idioma
(`allam-2-7b` → árabe, inútil para un usuario en español — Alan 02-09). `modeloListable(proveedor,
id)` (`MODELO_OCULTO_PATRON` regex + `MODELOS_OCULTOS_POR_PROVEEDOR` por id) filtra
`listarModelosOpenAICompat` (chips) **y** `configIA.modeloVigente` (una config vieja apuntando a
`whisper-*` se cura sola al cargar → default del proveedor). Mismo criterio que
`GEMINI_MODELOS_MUERTOS` (§7b) y la eliminación de `MODELOS_SUGERIDOS` (F3-13): **nunca ofrecer en
los chips un modelo que va a fallar o confundir**. El usuario igual puede tiparlos a mano.
- **Visión** (02-09): de Groq, solo `qwen/qwen3.6-27b` y `qwen3.8-27b` leen imágenes. El resto →
  400 `messages[N].content must be a string`; `mensajeErrorOpenAICompat` agrega "¿acepta
  imágenes? probá Gemini/Claude". El PDF **nunca** se manda por el proxy (solo Gemini/Claude
  nativo, F3-22c).
- **`gpt-oss-safeguard-20b` NO se esconde** — es un chat de texto normal; el regex evita `guard-2`
  justamente para no pescarlo.

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
   free tier) + **`gemini-2.5-flash-lite` / `gemini-2.5-pro`** (02-09: "no longer available to new
   users" → 404). Efecto triple: (a) `configIA` los migra al default al cargar; (b)
   `listarModelosGemini` los esconde de los chips de "ver modelos"; (c) si el usuario igual
   tipea uno, `SettingsPanel` avisa en ámbar ("no anda en free tier, se usa `gemini-3.7-flash`")
   en vez de swappear en silencio (antes: "¿por qué me cambió el modelo?").
   - **`gemini-2.5-flash` a secas SÍ anda** — no va acá.
   - **Cambio de criterio (02-09, Alan)**: antes los `2.5-*` NO se escondían "porque una cuenta
     vieja/con billing sí los llama". Pero `ListModels` de Google los ofrece a keys que **no**
     pueden usarlos → aparecían en los chips, el user los elegía, y 404. Confunden más de lo que
     sirven al usuario regular (probado 02-09 con imagen adjunta: 404 en `2.5-flash-lite` y
     `2.5-pro`; los 8 modelos `3.x` leen la imagen bien). Se aceptó perder el acceso de las
     cuentas viejas a esos 2 desde los chips (igual pueden tipearlos y verán el aviso ámbar).
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
- **Auto-switch de proveedor (03-09)**: `proveedorDeLaKey(key)` en `ia.ts` — devuelve el proveedor
  solo si el prefijo es **inequívoco** (`sk-ant-`→claude, `sk-or-`→openrouter, `AQ.`/`AIza`→gemini,
  `gsk_`→groq, `hf_`→huggingface; `sk-…` a secas = deepseek|gpt → `null`, ambiguo). Si pegás en el
  campo una key de OTRO proveedor, `SettingsPanel` muestra un botón **"Cambiar a X"** (en vez del
  aviso ámbar plano). No cambia solo: un click. La key pegada **se conserva** cruzando el cambio
  (`keyTrasCambio` state → el re-sync del borrador la usa en vez de la guardada). Antes solo
  avisaba "no parece una key de X" y había que cambiar el `<select>` a mano y re-pegar.
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
- **Resumen INCREMENTAL (B2, 03-09)**: cuando la ventana se corre y hay que re-resumir, `responder`
  busca en `resumenCacheRef` el **prefijo cacheado más largo** del set viejo (que crece agregando
  al final) y le pasa a `resumir()` solo la **cola nueva** + ese resumen (`opts.resumenPrevio`).
  Así la entrada de la llamada oculta no crece sin tope en una rama larga (verificado: 8 viejos →
  1600 chars la 1ª vez, 617 la 2ª). Se descartó "ventana adaptativa que se achica" (§B2 del plan):
  no baja el costo del resumen (habría MÁS para resumir) y recorta el contexto reciente. El
  prompt caching de la respuesta ya está roto en ramas profundas (el resumen cambia cada turno →
  cache miss desde su posición) — el incremental no lo empeora, solo abarata la llamada de resumen.

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
- **Watchdog** en `responder` (FlowCanvas): un `setInterval` cada 3s aborta el `AbortController`.
  **Por FASES (03-09, reporte de Alan: "se cortan a la mitad, más con 2 ramificaciones a la vez")**:
  el watchdog viejo era un solo `INACTIVIDAD_MS` de 45s que arrancaba a contar antes de `resumir()`
  — con 2 ramas en paralelo desde un punto profundo, `resumir()` (la llamada OCULTA) tarda >45s en
  un free tier saturado y el watchdog mataba la respuesta **antes de que arrancara**, con el
  mensaje falso "no llegó nada en 45s". Ahora:
  - **resumir / armado del contexto**: solo el tope duro `TOTAL_MS` (240s). Además `resumir()`
    tiene su propio corte a 50s (`AbortSignal.any([ctrl.signal, AbortSignal.timeout(50s)])`) → si
    tarda, se sigue **sin resumen** (el tramo viejo va entero) en vez de hacer esperar.
  - **respuesta esperando el 1er token**: gracia larga `PRIMER_BYTE_MS` (90s) — un free tier
    saturado tarda en empezar, sobre todo con varias llamadas a la vez.
  - **respuesta ya en curso**: `INACTIVIDAD_MS` (45s) entre chunks.
  `resumir()` ahora recibe `signal` (antes no) → STOP y el `TOTAL_MS` la cancelan de verdad.
  Mensajes de error distintos según si llegó algo o no.
- **Respuesta cortada por el límite de tokens del modelo (03-09, reporte de Alan: "no terminó de
  escribir y ya se habilitó Rehacer")**: el stream de Gemini terminaba "bien" con
  `finishReason: "MAX_TOKENS"` y `intentarGemini` devolvía el texto parcial como si estuviera
  completo (el chequeo de `MAX_TOKENS` solo corría con texto vacío). Ahora los 3 adaptadores
  devuelven `RespuestaIA.truncada` (Gemini `MAX_TOKENS` / Claude `max_tokens` / OpenAI-compat
  `length`); `responder` marca el intercambio con un `error` **sin borrar el texto** ("llegó al
  límite de tokens y quedó incompleta"). El render (`MessageNode` + `PanelConversacion`) muestra
  ahora la respuesta **y** la nota de error juntas (antes el `error` reemplazaba al texto — también
  afectaba al watchdog-cut con parcial). Copiar/Guardar quedan disponibles sobre lo que llegó.
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
- El `pointerup` fuera de la manija dispara un `click` sintético que caía en el fondo →
  `tragarClickSintetico()` (`components/gestos.ts`) lo traga. **F5-0 (02-09)**: antes era un
  `{ once: true }` que se comía el **próximo** click, sin importar cuándo — si redimensionabas
  algo y después clickeabas otra cosa (típico: el `⌄` que esconde el composer), ese click se
  perdía y parecía "no responde / pide doble clic". Ahora se distingue: el click sintético
  post-drag no viene precedido de un `pointerdown` nuevo; uno real sí → si llega un `pointerdown`
  antes del click, se desarma. Timeout de respaldo 500ms. Mismo helper en la manija del panel.
  + el `⌄` del composer pasó de un glifo suelto (25×28px) a "⌄ ocultar" (más fácil de acertar).

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

### F3-22. Adjuntar archivos (T16a — texto): `Adjunto` en el `.md`, se pega al contexto, no se re-manda
Spec completa y decisiones de alcance en `tasks/T16-spec.md`. Lo no obvio de la implementación:

- **`Adjunto` (`intercambio.ts`)** = `{ nombre, tipo: "texto"|"imagen"|"pdf", mime, contenido }`.
  `contenido` = texto plano (tipo `texto`) o base64 sin prefijo (imagen/pdf, T16b/c).
  `Intercambio.adjuntos: Adjunto[]` (`[]` = ninguno).
- **`.md`**: `adjuntos: <JSON.stringify(adjuntos)>` en **una línea** del frontmatter. Funciona con
  el parser mínimo (`key: value` por línea) porque `JSON.stringify` nunca emite un `\n` real (los
  saltos van como `\\n`) y el base64 no tiene `:` ni `\n`. JSON roto o item inválido → ese item se
  descarta (`parseAdjuntos`), nunca rompe la carga del árbol. `.md` viejo sin la línea → `[]`.
  Mismo criterio que el `error` (§1).
- **El adjunto va a la IA SOLO en el turno de su intercambio.** `armarContexto`: al aplanar el
  intercambio `actual`, pega los adjuntos de **texto** dentro del `Mensaje.texto` del usuario,
  delimitados (`--- archivo adjunto: {nombre} ---`). Los de imagen/pdf van en `Mensaje.adjuntos`
  (nuevo campo opcional) para que los mapeen los adaptadores en T16b/c. Cuando el mismo globo es
  contexto de un hijo, se manda **solo su pregunta/respuesta** — nunca de nuevo el archivo (costo
  de tokens + rompería el prompt caching). `normalizar` ahora preserva `.adjuntos` al concatenar.
- **Los adaptadores de `ia.ts` no se tocaron en T16a** (el texto ya viaja dentro de `.texto`).
- **`src/model/adjuntos.ts`** (nuevo): lectura/validación (`FileReader`), `tipoDeArchivo` (por
  MIME + extensión), topes (`LIMITE_TEXTO` 128 KB · `LIMITE_BINARIO` 1 MB · `LIMITE_INTERCAMBIO`
  2 MB — el mapa entero sincroniza como UN JSON de 5 MB, así que cada adjunto compite con eso),
  `pesoAdjunto`/`fmtBytes`/`iconoAdjunto`/`descargarAdjunto`. T16a: `leerArchivo` solo acepta
  texto; imagen/pdf → aviso "pronto".
- **UI**: dropzone + `onPaste` + botón 📎 SOLO en el mini-composer del panel (no la barra
  `Composer`). El texto de la pregunta es **obligatorio** aunque haya adjunto. Badge "📎 N" en el
  header del globo (`data.adjuntosN` desde `arbolAVista`) y chips en el turno "Vos" del panel
  (descargan al click).
- **Revertir**: sacás el campo `adjuntos` del modelo + `adjuntos.ts` + la UI del panel. Un `.md`
  con `adjuntos:` seguiría parseando (la línea se ignora).

### F3-22b. Adjuntar imágenes (T16b): compresión en el cliente + bloques nativos por proveedor
- **`comprimirImagen` (`adjuntos.ts`)**: decodifica el `File` a `<img>`, lo dibuja en un `<canvas>`
  achicado a **1568 px** de lado máximo (el máximo útil para la visión de Claude/Gemini) y lo
  re-encodea. Sin librería.
  - Formato de salida: **JPEG q0.82** (baja a 0.6 si sigue > `LIMITE_BINARIO` 1 MB), **salvo** que
    el original sea PNG **y** tenga transparencia (`getImageData` → algún alpha < 255) → PNG.
  - Si no hay que achicar y el original ya entra en el tope → se usa tal cual (sin re-encode).
  - Si tras comprimir sigue > 1 MB → error "probá recortarla".
  - `contenido` = base64 **sin** el prefijo `data:...;base64,`.
- **`ia.ts`, un mapeo por adaptador** (`imagenesDe(m)` = adjuntos `tipo:"imagen"` del mensaje;
  el bloque de imagen va **antes** del texto):
  - **Claude**: `content` pasa de `string` a `[{type:"image",source:{type:"base64",media_type,data}},
    {type:"text",text}]`. Todos los modelos Claude actuales tienen visión.
  - **Gemini**: `parts: [{inline_data:{mime_type,data}}, {text}]`. Todos los Gemini (flash incluido)
    aceptan imagen **gratis**. ⚠️ si Gemini 400ea la imagen, probar `inlineData`/`mimeType`
    (camelCase) — se eligió snake_case (`inline_data`/`mime_type`) por los curl históricos de Google.
  - **OpenAI-compat**: `content: [{type:"image_url",image_url:{url:"data:<mime>;base64,<data>"}},
    {type:"text",text}]`. Solo funciona en modelos con visión (Groq llama-4/3.2-vision, algunos de
    OpenRouter; HF casi ninguno). **No sabemos de antemano** cuál soporta → se manda igual y, si el
    proveedor devuelve 400/415/422, `mensajeErrorOpenAICompat` agrega "¿este modelo acepta
    imágenes? probá Gemini o Claude". Idem `mensajeErrorGemini` para un 400 con imágenes.
- **`estimarTokens`** (T10): suma un fijo por adjunto no textual — imagen ~1300, pdf ~3000
  (heurística grosera; es estimación).
- **UI**: el `accept` del `<input file>` suma `image/png,image/jpeg,image/webp`. Chip del composer
  con thumbnail 20 px; en el turno "Vos" un thumbnail 64 px que abre un **lightbox** (`verImagen`
  state, overlay `z-40` con `stopPropagation` para no cerrar el panel; Esc cierra el lightbox
  antes que el panel).
- **`eslint.config.mjs`**: se apagó `@next/next/no-img-element` — `next/image` no sirve con
  `output: "export"` para data-URIs; el canvas es todo estático/client-side.
- **Falta** (prueba de Alan, keys reales): imagen real con Gemini / Claude / un modelo de visión
  de Groq; el aviso "sin visión"; pegar una captura.

### F3-22c. Adjuntar PDF (T16c): nativo en Claude/Gemini, ignorado (con aviso) en los demás
- **`leerArchivo`** para `tipo:"pdf"`: sin compresión, solo tope (`LIMITE_BINARIO` 1 MB) →
  base64 sin prefijo. `mime` fijo `application/pdf`.
- **`ia.ts` `multimediaDe(m)`** (imágenes + PDFs) reemplaza a `imagenesDe` en los adaptadores que
  soportan PDF:
  - **Claude**: bloque `{type:"document", source:{type:"base64", media_type:"application/pdf",
    data}}` antes del texto. Sin beta header. Límite: 100 págs en modelos de 200k (Haiku 4.5, el
    default).
  - **Gemini**: `{inline_data:{mime_type:"application/pdf", data}}` — **gratis** en free tier.
  - **OpenAI-compat**: sigue usando `imagenesDe` — **el PDF NO se manda** (no hay formato vía
    proxy con modelos abiertos). El texto de la pregunta sí va.
- **Aviso**: `BranchTranscript` recibe `proveedorLeePdf` (`= proveedor ∈ {gemini, claude}`) y
  `proveedorNombre` desde `FlowCanvas`. Si hay un PDF adjunto y `!proveedorLeePdf` → línea ámbar
  "El PDF solo lo leen Gemini (gratis) o Claude — con {N} se va a ignorar". **No bloquea el
  envío** (decisión de la spec: Alan puede querer intentar; el texto se manda igual).
- `estimarTokens`: +3000 por PDF (heurística; una estimación mejor necesitaría contar páginas).
- **Con esto T16 queda completo** (texto + imágenes + PDF). El `.md` es la fuente de la verdad;
  un árbol con adjuntos pesados no se puede compartir (tope ~1 MB) — el error lo dice.

### F3-23. Sacar una respuesta como texto: copiar / guardar (T15)
- **El problema**: pedir un `.md` a un globo → el modelo lo devuelve como cuerpo de la respuesta
  en crudo → el globo lo **renderiza**, así que no había forma de copiar el `.md` fuente ni
  bajarlo.
- **`src/model/exportar.ts`** (nuevo): `nombreArchivoRespuesta(respuesta) → { nombre, contenido,
  mime }` — heurística:
  - Toda la respuesta (tras trim) es UN solo fence ```` ```lang … ``` ```` → `contenido` = el
    interior; extensión y mime del `lang` (`css`→`.css text/css`, `ts`→`.ts`, `md`→`.md`…, lang
    desconocido/sin lang → `.txt`).
  - Si no, pero `pareceMarkdown` (encabezados, listas, `**bold**`, fences, links, tablas) → `.md`
    / `text/markdown`, contenido completo.
  - Si no → `.txt` / `text/plain`.
  - Nombre base: slug del primer `# Título` (acentos y símbolos limpiados), si no `respuesta` /
    `documento`.
  - `descargarTexto` (Blob + `<a download>`), `copiarTexto` (`navigator.clipboard`, sin fallback).
- **UI — SOLO en el panel** (decisión de Alan; el `NodeToolbar` del globo queda como está):
  - `BranchTranscript`, en **cada** turno IA (F5, pedido de Alan 02-09 — antes solo el último):
    "⑂ ramificar desde acá" · "⧉ Copiar" (feedback "✓ Copiado" 1.5s) · "⬇ Guardar", como **links
    sutiles** (`text-[11px] text-white/25`, siempre visibles) en una fila por turno. Solo con
    `respuesta` y sin `error`/`pending`. "↻ Rehacer" sigue **solo en la punta** (es la única que se
    puede re-pedir) y como botón con borde. El estado del feedback es `copiadaId` (id del turno
    copiado, con updater funcional para no pisar otro "✓") en vez de un bool global.
    Copiar/Guardar andan también en modo compartido (no requieren `onSubmit`).
  - `Markdown.tsx` gana la prop **`conCopiar`** (la pasa `BranchTranscript`, NO `MessageNode`):
    con ella, `components.pre` → `preConCopiar` envuelve cada bloque con un botón "⧉" (hover,
    `group-hover:opacity-100`) que copia ese bloque en crudo (`extraerTextoCodigo(node)` del hast).
- **Descartado**: la "doc card" (tarjeta compacta cuando la respuesta ES un documento) y tocar el
  `systemPrompt` por defecto — Alan: núcleo ahora, el resto si no alcanza.
- **Revertir**: se saca `exportar.ts` + los botones + la prop `conCopiar`.

---

## Fase 5 — el globo pasa a ser un *tramo* de la conversación

> Spec completa: `tasks/fase5-spec.md`. **Cambio de arquitectura de la VISTA — el modelo de datos
> no cambió, no hubo migración.**

### F5-0. El swallower de click post-resize se comía cualquier click
Ver F3-8 — `components/gestos.ts`. **Obsoleto**: el swallower global (`tragarClickSintetico`) se
reemplazó por pointer capture en **B3-b** (03-09). Dejó de ser una carrera.

### F5-1. Un nodo del canvas = un TRAMO (cadena `main`), no un intercambio
- **`calcularTramos(arbol)`** (`intercambio.ts`): agrupa cada cadena maximal de `rama: "main"`
  (empezando en la raíz o en el destino de una rama) en un `Tramo { cabezaId, intercambios[] }`.
  El intercambio sigue siendo la unidad de datos; el tramo es **derivado**. Helpers:
  `tramoDesde(a, cabezaId)`, `cabezaDeTramo(a, intercambioId)`.
- **`arbolAVista`** reescrito: 1 nodo por tramo, `id` = id de la cabeza, `position` = x/y de la
  cabeza. `data` lleva `intercambios` (el tramo entero, para `MessageNode`) + `n`, `pending`/
  `error` (de la punta), `adjuntosN` (suma), `rev` (firma corta del tramo). Los edges van del
  tramo padre a la cabeza del tramo hijo (solo las cabezas tienen edge de entrada), con
  `data.desdeId` = el intercambio del que se ramificó.
- **`datosIguales`** (`FlowCanvas`) **ignora `intercambios`** (array recreado en cada
  `arbolAVista`) y confía en `data.rev`. Sin esto, todos los nodos se re-medían en cada rebuild
  (parpadeo — decisiones §3).
- **`MessageNode`** renderiza `data.intercambios` como transcripción scrolleable (overview);
  header "N mensajes" + "📎 N"; colapso por cantidad/largo; el resize / STOP / Rehacer operan
  sobre la **punta** del tramo (`data.intercambios.at(-1).id`), `Eliminar` sobre la cabeza (borra
  el tramo + sub-ramas).
- **`FlowCanvas`**: `transcriptNodeId` ahora es la **punta** del tramo abierto (así
  `caminoRaizA(punta)` = raíz→acá completo). `verGloboEnPanel(id)` resuelve cualquier id →
  cabeza (para seleccionar el nodo) + punta (para el panel). `nav`, `activeNodeId` al cargar,
  `deleteNode` → todos resueltos a cabeza vía `cabezaDeTramo` / `cabezaUltimo`.
- **`handleSubmit` con `kind === "main"`**: NO crea un globo — agrega un hijo `main` a la **punta**
  del tramo del padre (Enter continúa desde la punta). Solo "ramificar" busca lugar
  (`ubicarNuevoGlobo`) y crea un nodo. → F5-2 quedó casi resuelto acá.
- **Cero migración**: un mapa de fase 1-4 (N globos de 1 intercambio en cadena `main`) se agrupa
  solo → 1 tramo. Verificado en el pane (6 intercambios → 2 globos; Enter → "5 mensajes" sin
  globo nuevo; el panel de una rama muestra raíz→b→x→y sin la continuación hermana `c`).
- **Revertir**: volvés a `arbolAVista` 1:1 + `MessageNode` de un solo intercambio. `datosIguales`
  vuelve a comparar todo.

### F5-3. Ramificar desde cualquier intercambio del tramo
- **`BranchTranscript`**: cada turno de la IA tiene un "⑂ ramificar desde acá" (atenuado; se
  ilumina el elegido). Al clickearlo se setea `ramificarDesde` (id del intercambio) + focus al
  textarea → aparece un chip "⑂ Ramificando desde: «pregunta» ✕", el placeholder cambia
  ("Escribí la pregunta de la rama nueva…"), y **Enter + el botón ramifican desde ese punto** (no
  continúan). El ✕ vuelve al default (ramificar desde la punta). `onSubmit` gana un 4º arg
  `desdeId?`.
- **`FlowCanvas.responderDesdePanel`**: `kind === "branch"` → `handleSubmit(text, "branch", desdeId
  ?? transcriptNodeId, adjuntos)`. `handleSubmit` linkea `padreId = desdeId` (el intercambio del
  medio) y posiciona la rama con `ubicarNuevoGlobo`.
- **`ubicarNuevoGlobo` (`layout.ts`) — ahora tramo-aware**: resuelve `parentId` → cabeza
  (`cabezaDeTramo`), calcula posición y choques contra los **tramos** (`calcularTramos` — la
  cabeza tiene la x/y y el rect medido; los no-cabeza tienen x/y viejas). Cuenta las ramas de
  TODO el tramo para el balance izq/der.
- El contexto de la rama = raíz→intercambio-elegido + la rama (`caminoRaizA` ya lo hace — sigue
  el `padreId`). NO incluye la continuación hermana del tramo original.
- Verificado: 8 asserts (rama desde el medio, tramo original intacto, `edge.data.desdeId`, camino
  sin la continuación) + pane (chip, ramifica desde `b` no desde la punta `c`).

### F5-4. El globo crece con la conversación (slider en "Lienzo") + se saca "expandir/colapsar"
- **`Settings`**: `crecimientoPxPorMensaje` (0-24, default 9) y `crecimientoTope` (px, default 320).
  `ALTO_BASE_GLOBO` = 108. Sliders en la pestaña "Lienzo" de ⚙️ (el de tope se esconde si px=0).
- **`MessageNode`**: sin tamaño manual, `height = ALTO_BASE_GLOBO + min(n * px, tope)`. El cuerpo
  scrollea adentro. Los valores llegan por `NodeActionsContext` (`crecimientoPx`/`crecimientoTope`,
  clampeados en `FlowCanvas`) — no por `data`, así que cambiar el slider re-renderiza los nodos sin
  reconstruir la vista.
- **Se sacó el "expandir/colapsar" por globo (F3-1)**: con el alto configurable + scroll interno
  ya no aporta. Se borró `vista.ts` (`leerExpandido`/`guardarExpandido`/`ALTO_COLAPSADO`), el
  botón "⌄ ver más" y el toggle del toolbar. Para leer todo → se abre el panel. La clave
  `localStorage["3maps:vista"]` queda muerta (inofensiva).
- Verificado en el pane: 2 msgs → 126px, 12 msgs → 216px (px=9); slider a 20 → 348px; px=0 →
  todos 108px.

### F5-4b. Fixes post-F5-4: auto-scroll de streaming, `⌄` de un click, agarre de resize
- **Auto-scroll durante el stream** (se había perdido en el panel y en los globos): patrón
  `pegado` — un `useRef(true)` que se re-arma al cambiar la punta (`ultimo?.id` / `puntaId`),
  un `onScroll` que lo apaga si el usuario sube a leer (>40-60px del fondo) y lo re-prende si
  vuelve a bajar, y un `useEffect` que hace `scrollTop = scrollHeight` en cada tick del stream
  **solo si `pegado`**. En `BranchTranscript`, el efecto viejo "abre en el Vos" ahora se saltea
  cuando `ultimo` todavía no tiene `respuesta` (respuesta fresca en curso) → no pelea con el
  follow.
- **`gestos.ts` (`tragarClickSintetico`) — de `pointerdown`-disarm a ventana de tiempo**: el
  click sintético post-drag llega <150ms del `pointerup`; un click real llega después. Se traga
  el primer `click` **solo si** cae dentro de esa ventana; si no, se deja pasar. Backstop 400ms.
  El approach anterior (desarmar en el primer `pointerdown`) fallaba con mouse real → el `⌄`
  pedía doble click.
- **Agarre de resize del globo (`MessageNode`)**: la zona clickeable pasó de `h-4 w-4` (16px) a
  `h-7 w-7` (28px, ~2x área) con la manija visible (`h-4 w-4` + gradiente) adentro, alineada
  abajo-derecha. El cursor `nwse-resize` cambia antes al acercarse a la esquina.
- Verificado en el pane: `⌄` togglea en un click en los dos sentidos; grip `cursor: nwse-resize`
  con zona de 28px. El follow del stream lo prueba Alan con key real.
- **02-09 (Alan, Chrome real)**: el follow **de los globos anda**. En el **panel** se planta a
  mitad de la respuesta (largo o corto) — backlog **B9** (el `scrollTop = scrollHeight` propio
  dispara `alScrollear` y apaga `pegado`).

### F5-4c. El `⌄` y el cursor de resize, de verdad (lo que F5-0/F5-4b no cerraron)
Alan probó F5-4b en Chrome real: **el auto-scroll anda**; el `⌄` **seguía pidiendo doble click**
y el cursor de la esquina **seguía tardando en pasar de "manito" a "flechas"**. Reproducidos en
el navegador con eventos de puntero reales (CDP) — el pane no los reproduce (congela CSS +
`visibility:hidden` en los nodos sin medir), por eso las dos "verificaciones en el pane"
anteriores mintieron.

- **`⌄` doble click — causa**: `tragarClickSintetico` armaba un listener de `click` **global en
  `window`** después de cada resize. Las heurísticas para distinguir "sintético" de "real"
  (F5-0: desarmar en `pointerdown`; F5-4b: ventana de 150ms) **las dos leakean**: un click real
  y rápido sobre otro control (el `⌄`, un botón del toolbar) caía en la ventana y se perdía.
  - **Fix**: el discriminante deja de ser el TIEMPO y pasa a ser **dónde cae el click**. Se traga
    solo si `ev.target` **es exactamente** `.react-flow__pane` (fondo del lienzo) o un
    `[data-cierra-al-click]` (backdrop del panel — atributo nuevo en `BranchTranscript`). `matches`,
    no `closest`: los nodos viven DENTRO de `.react-flow__pane` y un click sobre el contenido de un
    nodo (o sobre cualquier `<button>`) nunca matchea → pasa intacto. Un click que no matchea **no
    desarma** el listener (el sintético "malo" sobre el fondo puede venir justo después); corta el
    backstop de 400ms.
  - Verificado (CDP): resize globo → click `⌄` a 7ms → **togglea en un click**; `✎ Escribir` ídem;
    el globo queda seleccionado tras el resize; click normal en el fondo **sigue** deseleccionando;
    resize del panel que termina sobre el backdrop **no** lo cierra; click intencional en el
    backdrop **sí** lo cierra.
- **Cursor de resize — causa**: la manija vivía DENTRO del `overflow-hidden` + `rounded-md` +
  `border` del root del `MessageNode`. El borde (1px) + el arco de la esquina redondeada dejaban
  una banda de ~2-6px con `cursor: grab` (el del pan) justo donde uno apunta para redimensionar.
  Agrandar la zona a 28px (F5-4b) no tocó ese borde exterior.
  - **Fix**: el root del `MessageNode` pasa a ser un contenedor de posición **sin recorte**
    (`relative text-sm`); la tarjeta visible (header + cuerpo + handles) es un hijo `absolute
    inset-0` que se clippea a sí mismo. La manija sale del recorte y **cuelga 4px por fuera** de
    la esquina (`-bottom-1 -right-1`) → el `nwse-resize` agarra *antes* de llegar al borde visible.
    Las `NodeToolbar` ya se portalean, no las afecta.
  - Verificado (CDP): `cursor: nwse-resize` desde 4px por fuera de la esquina hacia adentro; ya no
    hay banda muerta con `grab`.

### B3-b (03-09). El `⌄` de un click, versión final: pointer capture (adiós `tragarClickSintetico`)
El `⌄` **volvió a pedir doble click** (reporte de Alan). F5-4c redujo el swallower global de
`click` a un discriminante por target, pero seguía siendo frágil: un listener de `click` en
`window`, armado tras cada resize, es una carrera contra el click real del usuario.

- **Fix real**: `gestos.ts` pasa de `tragarClickSintetico()` (swallower) a
  **`arrastrarConCaptura(e, onMove, onEnd)`** — hace `handle.setPointerCapture(e.pointerId)` al
  empezar el drag. El pointer capture re-dirige a `handle` **todos** los eventos siguientes del
  puntero, **incluido el `click` sintético** que el navegador dispara al soltar → ese click ya no
  cae sobre `.react-flow__pane` (deselección) ni sobre el backdrop del panel (cierre). Cero
  listeners globales, cero heurística. Es el patrón estándar para "click después de drag".
- La manija del globo (`MessageNode`) y del panel (`PanelConversacion`) ya llevan
  `onClick={(e) => e.stopPropagation()}` como segunda barrera (si el click reencaminado igual
  burbujea).
- Se borra `[data-cierra-al-click]` del backdrop del panel y todo `tragarClickSintetico`.
- Verificado en el pane: resize del globo (con `setPointerCapture` que tira en eventos sintéticos
  → cae a los listeners de `window`, el drag igual redimensiona) + `⌄ ocultar` **togglea en un
  click**; el globo queda seleccionado. El `click` reencaminado real lo confirma Alan en Chrome
  (el pane no dispara `setPointerCapture` con eventos no confiables).
- **Revertir**: volvés al swallower global y a que el `⌄` pida doble click cada dos por tres.

### B7. Zoom de lupa en hover

- **`Settings.hoverZoom: boolean`** (def `false`). Toggle en "Lienzo".
- **CSS puro**, gateado por `:root[data-hoverzoom="on"]`: al hacer `:hover` sobre un
  `.react-flow__node` se escala `.globo-root` (el root del `MessageNode`) a `scale(1.35)` +
  `z-index: 50`. `transform` **no afecta el layout** → los vecinos no se corren.
- **`data-hoverzoom` va en el `<html>` desde un `useEffect`** (el mismo que aplica fuente/tamaño de
  B5), NO como prop inline. Con prop inline había **mismatch de hidratación** (SSR = default `off`,
  cliente con `localStorage` = `on`) y React 19 **no lo patchea**. El effect corre post-montaje y
  lo ajusta siempre. (Mismo patrón que `--fuente-3maps`.)
- **`data-chat` / `--xy-edge-stroke-width` / `<Composer oculto>` tenían el mismo mismatch** (lo
  reportó Alan al recargar con `composerOculto` guardado). Fix (03-09): `sVista = hidratado ?
  settings : DEFAULT_SETTINGS` — un flag `hidratado` (`useState(false)` + `useEffect(()=>set(true))`)
  hace que el 1er render del cliente use los defaults (= lo que prerenderiza el server), y recién
  el 2º render aplica los ajustes guardados. Los `useEffect` (fuente/tamaño/hoverzoom) siguen
  usando `settings` directo (post-montaje, sin SSR).
- **Exclusiones**: `:not(.dragging)` (RF marca así el nodo que se arrastra — no salta de tamaño a
  mitad del drag) y `:not(.selected)` (con el globo seleccionado están el anillo + la toolbar).
  `@media (hover: hover)` → en touch no aplica.
- **`onResizeStart` pasó de `getBoundingClientRect().width / zoom` a `offsetWidth`/`offsetHeight`**:
  `offset*` es el tamaño de layout, inmune a los transforms (zoom del lienzo + scale del
  hover-zoom); con `getBoundingClientRect` el hover-zoom inflaba el tamaño de arranque del resize.
- Verificado en el pane: `data-hoverzoom` togglea en el `<html>` (sin mismatch), la regla CSS está
  bien formada, `@media (hover: hover)` matchea, `.globo-root` es hijo directo del nodo, el
  checkbox persiste. **El `:hover` visual (scale + z-index) lo prueba Alan en Chrome** — el pane no
  dispara `:hover` real (napkin §2).
- **Revertir**: se saca la regla CSS + el `data-hoverzoom` del effect; `offsetWidth` en el resize
  queda (es más robusto igual).

### B6. Logo — favicon + watermark del canvas

- **Assets que subió Alan** (`public/`): `logo.png` (lockup: árbol de globos + wordmark "3maps") y
  `3.png` (la marca sola). **Ambos ya traen transparencia** — son palette PNG con chunk `tRNS`;
  `file` dice "no alpha channel" pero `sharp(...).metadata()` reporta `channels: 4` y el fondo es
  `[r,g,b,α=0]`. (Al principio les pasé un "blanco→alfa" y les metí un rectángulo verde
  semiopaco — las zonas transparentes tenían RGB verde. Se sacó: usar los PNG tal cual.)
- **Favicon** — `src/app/{icon.png, favicon.ico}` (SIN `apple-icon.png` — decisión de Alan
  03-09: nadie va a "agregar a pantalla de inicio" y confunde). Ambos son **la marca (`3.png`),
  no el lockup** — a 16-32px el wordmark es ilegible; todo producto usa solo la marca en el tab
  (GitHub = pulpo, no "GitHub"). Centrada en un cuadrado **con fondo blanco** (el tab espera opaco).
  - `icon.png` (256px): Next lo linkea `<link rel="icon">` **con `basePath`** (`/3maps/icon.png`
    en Pages) → es el que **realmente funciona** en GitHub Pages (el `favicon.ico` auto-requesteado
    va a `alanepazs.github.io/favicon.ico`, raíz, que no es la app). No `metadata.icons` a mano —
    los string paths NO se prefijan.
  - `favicon.ico` (16/32/48, hecho con `png-to-ico`): reemplaza al del template (triángulo de
    Vercel). Sirve para dev local (`/favicon.ico` a la raíz sí anda) y para un self-host futuro.
- **Watermark del canvas**: **`logo.png` — el lockup COMPLETO** (árbol + globos + wordmark; Alan lo
  quiere así, ayuda a un usuario nuevo a reconocer la app). `background-image` de un `<div
  aria-hidden absolute inset-0>` **hijo de `<ReactFlow>`** (después de `<Background/>`),
  `z-index: 0` → sobre el fondo de RF pero debajo del `.react-flow__pane` (z-1) y los nodos.
  `opacity: 0.05`, centrado, `background-size: min(72vw, 440px) auto`. Fijo (no pan/zoom — no está
  en `.react-flow__viewport`).
  - **Por qué hijo de RF y no del wrapper**: `<ReactFlow colorMode="dark">` pinta un
    `background-color: #141414` OPACO en `.react-flow` (el `--xy-background-color-default:
    transparent` lo pisa la clase `.dark`) → un watermark en el wrapper quedaba tapado.
- **`src/model/assets.ts`**: `rutaAsset(archivo)` = `${basePath}/${archivo}` — Next NO prefija
  las URLs de `public/` que referenciás a mano (sí `app/icon.png` y `next/image`). Reusable para
  futuros assets.
- **`3.png`** (marca sola) queda en `public/` como fuente para regenerar los íconos.

### F5-5. `calcularLayout` ("▤ Ordenar") + `resolverSuperposiciones` tramo-aware
Las dos funciones de `layout.ts` seguían recorriendo el árbol **intercambio por intercambio**
(vía `hijos()`), poniendo cada `main` en su propio slot vertical. Con Fase 5 eso desparrama un
tramo de N mensajes en N slots (y solo la cabeza tiene nodo).

- **`calcularLayout`** ahora recorre **tramos** (`calcularTramos`). Por tramo: 1 posición (la de la
  cabeza, = la `id` del nodo de React Flow). `alturaDe(cabezaId)` ya devuelve el alto del tramo
  entero (React Flow mide el nodo completo); fallback sin medir = `130 + (n-1)*40`. Las ramas que
  salen de **cualquier** intercambio del tramo (`tramosHijos`, ordenadas por el índice del
  intercambio del que salen) van a columnas ±1 al costado, **alineadas con el top del tramo** (no
  empujadas hacia abajo por la cantidad de mensajes). Una 2ª continuación `main` desde el medio
  cae como otro tronco debajo.
- **`resolverSuperposiciones`** ahora arma `pos`/`dim` por **cabeza de tramo** y `medir(cabezaId)`
  da el rect del tramo entero. El loop de empuje-hacia-abajo no cambió. `FlowCanvas.resolverSolapes`
  ya escribía por `pos.get(n.id)` (n.id = cabeza) y por `pos.get(i.id)` por intercambio (solo las
  cabezas están en el map → los no-cabeza no se tocan).
- **`ubicarNuevoGlobo`** ya era tramo-aware (F5-3) y solo corre al **ramificar**.
- Verificado: 19 asserts en `_scratch.mts` (cadena `main` → 1 posición; rama desde el medio →
  alineada al top; raíces apiladas; fallback escala con n; solape entre tramos empuja al de abajo;
  1 tramo / sin solape → `null`) + e2e en el pane (árbol tramo + 2 ramas → "▤ Ordenar" deja
  cabeza en (0,0), rama-right en (400,0), rama-left en (-400,0); persiste al `.md` solo las
  cabezas).

### F5-7. B8/B9/B10 — perf del drag, scroll-follow del panel, manija vs scrollbar

Tres bugs de la prueba de Alan en Chrome (02-09).

- **B8 — arrastrar un globo iba a ~5 fps.** React Flow re-renderiza el nodo arrastrado en cada
  frame (posición / `dragging`); `MessageNode` re-corría `intercambios.map(<Markdown>)` →
  **react-markdown re-parseaba TODA la transcripción del tramo por frame** (remark + rehype-raw +
  sanitize + katex). Fix en dos capas:
  1. `Markdown` = `memo(Markdown)` + `useMemo` del texto normalizado. Mismo `children` string →
     no se re-parsea. Sirve para globo Y panel.
  2. `MessageNode`: la transcripción sale a `CuerpoTramo`, `memo` con compare `(a,b) =>
     a.rev === b.rev && a.readOnly === b.readOnly`. `rev` (`data.rev`) es la firma corta del tramo
     (id + largo de cada respuesta + pending/error + nº adjuntos) — estable = mismo contenido. Un
     drag / zoom / cambio de selección no toca `rev` → `CuerpoTramo` no se renderiza. `onRehacer`
     va como `useCallback([retryNode, puntaId])` (estable mientras `rev` no cambie).
  - Verificado (CDP): 0 mutaciones de DOM en el cuerpo del globo durante 5 wheel de zoom + un drag.
- **B9 — el scroll-follow del PANEL se plantaba a mitad del stream** (los globos seguían bien).
  El `cont.scrollTop = cont.scrollHeight` que hacemos nosotros dispara un `scroll` event →
  `alScrollear` corría antes del reflow del markdown recién crecido, veía `diff > 60` y apagaba
  `pegado`. Fix (en `PanelConversacion` y `MessageNode`, misma forma): (a) `useLayoutEffect` en vez
  de `useEffect` para scrollear después del mutate del DOM y antes del paint (sin frame de atraso);
  (b) `autoScroll` ref — se prende antes del scroll propio, se apaga en `requestAnimationFrame`;
  `alScrollear` sale temprano si está prendido. Así el scroll propio nunca apaga `pegado`; el
  scroll real del usuario (después del rAF) sí.
- **B10 — la manija de resize del panel y el scrollbar de la conversación quedaban pegados.** Solo
  con el panel a la **izquierda**: la manija va en el borde derecho y el scrollbar de `scrollRef`
  también (borde derecho, LTR).
  - **1er intento (mal)**: `scrollRef` con `mr-4` cuando `side === "left"`. Corría el scrollbar 16px
    adentro y dejaba un hueco vacío entre el scrollbar y el borde — la flecha `›` de nav (`right-3`)
    quedaba flotando en ese hueco, desconectada ("bugueada", reporte de Alan).
  - **Fix**: sin margen; la **manija sale entera del panel** cuando `side === "left"`
    (`left-full ml-1` = 4px afuera del borde) → despejada del scrollbar Y de la flecha `›`. Con
    `side === "right"` la manija sigue en el borde izquierdo (mira al canvas, sin conflicto,
    `left-0 -ml-1.5`). La `›` queda igual que con el panel a la derecha (que ya estaba bien).
  - Verificado (CDP): side-left, manija [panel+3, panel+15] — 4px de aire respecto del scrollbar;
    la `›` en la misma posición relativa que side-right (solape de ~3px con el scrollbar, igual que
    side-right); el resize sigue andando (960→1050 al arrastrar).

### B1. Color por globo

- **Paleta FIJA de 6 slots** (`ambar`, `verde`, `rojo`, `cian`, `violeta`, `rosa`) + `null`, NO hex
  libre — el `.md` queda legible (`color: ambar`) y los colores consistentes. Se descartó `azul`
  para no chocar con el `ring-sky-400` de la selección. `COLORES_GLOBO` (slugs) + `ColorGlobo`
  viven en `intercambio.ts`; el hex (`COLOR_GLOBO_HEX`) en `MessageNode` (presentación).
- **Vive en la CABEZA del tramo** (como `ancho`/`alto`, F5-1). `Intercambio.color: ColorGlobo |
  null`. `conColor(a, id, color)` (mutación pura). `.md` frontmatter: línea `color:` (vacía = null);
  `parseMarkdown` valida contra la lista → desconocido / línea ausente = `null` (compat con `.md`
  viejos y árboles compartidos previos).
- **Sync / compartir: gratis** — el color va en el `.md`, no hubo que tocar `sync.ts` ni
  `compartir.ts`.
- `arbolAVista`: `data.color` de la cabeza + se sumó a `data.rev` (`…x${cabeza.color}`) y a la
  `firma` de `FlowCanvas` → cambiar el color re-deriva la vista y re-renderiza el nodo. (Cuesta un
  re-parse del markdown del tramo por click de color — acción deliberada, no per-frame, aceptable.)
- **UI**: punto de color en la esquina sup-derecha del header del globo (visible siempre, también
  en modo compartido). Fila de 6 swatches + "✕ sin color" en el `NodeToolbar` (2ª fila, bajo
  Abrir/Rehacer/Eliminar; solo `!readOnly`). Click en el color activo → lo saca.
- `nodeActions.ts` gana `colorNode(id, color)`; `FlowCanvas` lo cablea (`id` = cabeza del nodo).
- Verificado: 12 asserts en `_scratch.mts` (round-trip `.md`, compat `.md` viejo, color inválido →
  null, `rev` cambia, no-cabeza no afecta) + e2e en el pane (swatch aplica → punto en el header +
  `color: rojo` en el `.md`; toggle-off; ✕; persiste tras reload).

### B4. Grosor de las líneas (edges)

- `Settings.grosorLineas: number` (1-5, def **1.5**). Slider en la pestaña "Lienzo".
- **No pasa por `arbolAVista`** (es pura, no conoce settings, y cambiar el slider no debería
  re-derivar la vista). Se aplica como la **CSS var `--xy-edge-stroke-width`** en el `<div>`
  contenedor del canvas (`FlowCanvas`, `style` inline clampeado 1-5) → la heredan `.react-flow` y
  `.react-flow__edge-path` (RF v12: `stroke-width: var(--xy-edge-stroke-width, var(...-default: 1))`;
  RF nunca setea la var sin `-default`, así que la nuestra gana). Cambiar el slider se aplica al
  toque, sin re-render de nodos/edges.
- Config vieja sin `grosorLineas` → `{ ...DEFAULT_SETTINGS, ...parsed }` da 1.5.
- Verificado (CDP): slider 1/2/4/5 → `getComputedStyle('.react-flow__edge-path').strokeWidth` =
  1/2/4/5px en vivo; persiste.

### B3. Multi-select move: envión parejo a todo el grupo, sin `onSelectionDrag*`

- **El bug** (reporte de Alan, 02-09): al arrastrar varios globos seleccionados con flick, **solo
  1 tenía envión** y el resto quedaba estático (y su posición nueva no persistía al `.md`).
- **Causa** (leída del source de `@xyflow/system` 12.11.5, `XYDrag`): hay **dos** draggers y cuál
  dispara depende de dónde agarrás:
  - agarre **sobre un globo** → el `XYDrag` del `NodeWrapper` (con `nodeId`) → dispara **solo**
    `onNodeDrag*`, con TODOS los seleccionados como 3er arg (`currentNodes`).
  - agarre **sobre el recuadro de selección** → el `XYDrag` de `NodesSelection` (sin `nodeId`) →
    dispara `onNodeDrag*` **y** `onSelectionDrag*` (el node primero).
  El código viejo: `onNodeDragStop` ignoraba el 3er arg y hacía `glide([node])` (un globo);
  `onSelectionDrag*` corría en paralelo y competía por el mismo `sampleRef` de velocidad. El que
  perdía la carrera se comía la muestra → el otro `glide` recibía `!v` → asentaba estático.
- **Complicación**: `onNodeDragStop` **debería** traer todos los nodos arrastrados como 3er arg
  (`currentNodes`), pero en la práctica no es confiable — según agarres un globo o el recuadro de
  selección, y por `selectNodesOnDrag` (default `true`) que dispara `handleNodeClick` al empezar,
  a veces llega uno solo aunque haya varios `.selected`. Probado por Alan: seguía glideando 1.
- **Fix**:
  - `useNodeInertia` deja de exportar `onSelectionDrag*`; `<ReactFlow>` no los cablea.
  - `FlowCanvas` **envuelve** `onNodeDragStop`: arma el grupo con **su propia** selección
    (`getNodes().filter(n => n.selected)`) — no confía en el arg de RF. Si el globo soltado está
    en esa selección y hay >1 → glidea todos; si no → `[node]` (drag individual).
  - El hook `glide(items)` aplica **una sola velocidad** a todo el grupo (en una selección los
    globos van rígidos, la del que trackeamos = la de todos).
  - `onSettle` pasa de `(id, pos)` a `(items[])`. `FlowCanvas.asentar` → **`asentarVarios(items)`**:
    un solo `setArbol` que aplica `conPosicion` + (`conRama` si es rama) a todos → persiste x/y y
    lado de cada uno en un commit (antes: N `setArbol` / N `guardarArbol`, y solo del globo
    agarrado → el resto no persistía).
  - Tras un drag de grupo la selección **se mantiene** (pedido de Alan, 02-09 — corrige la
    decisión previa de deseleccionar). Se limpia sola al clickear el fondo del canvas (default de
    React Flow, `resetSelectedElements` en el `Pane`; no hace falta `onPaneClick`).
  - **Toolbar compartida** (`ToolbarGrupo`): con >1 globo seleccionado, cada `MessageNode` esconde
    su `NodeToolbar` (`isVisible={selected && !variosSeleccionados}`, `variosSeleccionados` vía
    `useStore` — cuenta `n.selected`, corta en 2) y `FlowCanvas` muestra UNA
    `<NodeToolbar nodeId={idsSeleccionados}>` (RF la posiciona sobre el bounding box del grupo).
    Acciones en lote: **🗑 Eliminar N** (`deleteMuchos` — un solo `confirm`; si un seleccionado
    cuelga de otro seleccionado se borra con él, no se cuenta dos veces) y **swatches de color**
    (`colorMuchos` → `conColor` a cada uno). `idsSeleccionados` se memoiza por un `selKey`
    ordenado → no re-deriva en cada frame de drag. `COLOR_GLOBO_HEX` salió de `MessageNode` a
    `components/colores.ts` (lo comparten `MessageNode` y `ToolbarGrupo`).
- **Decisión** (Alan, tras probar): **envión parejo a todo el grupo** (no "sin envión de grupo",
  que era la opción pre-elegida en `tasks/plan.md` — la sintió y le gustó).
- **Lo que NO se tocó**: el flip de handle en vivo del `onNodeDrag` wrapper sigue siendo solo del
  globo de referencia durante el drag; en un drag de grupo el resto de los edges se corrigen en el
  drop (`conRama` → cambia la `firma` → `arbolAVista` redibuja). Cosmético, aceptado.
- Verificado: 10 asserts en `_scratch.mts` (grupo de 3 persiste las 3 posiciones; rama izq/der del
  padre; main/raíz nunca flipean; grupo rígido no flipea la rama; lista vacía no-op; id fantasma
  se saltea) + `tsc`/`lint`/`build` verde. **En el pane** (con un shim de `requestAnimationFrame`
  para saltear el freeze, napkin §2): grupo de 3 seleccionado → flick simulado → los 3 se mueven
  **rígidos** (mismo delta), `asentarVarios` persiste los 3, y la selección se limpia (0
  toolbars). **Confirmado por Alan en Chrome real (02-09): los 4 vuelan parejo.**
- **Revertir** (volver a `onSelectionDrag*` en paralelo, o confiar en el 3er arg de
  `onNodeDragStop`): vuelve a glidear 1 solo globo, y los demás sin persistir.

### B5. Fuente + tamaño de texto

- **`Settings.fuenteTexto`** (`sistema` | `geist` | `serif` | `mono`, def `sistema`) +
  **`escalaTexto`** (0.8–1.3, def 1). `FUENTES_TEXTO` (familias CSS) + los topes en `settings.ts`.
- **Tamaño = escalar el `font-size` del `<html>`**, no un contenedor: `rem` es relativo a la raíz,
  así que un `font-size` en un wrapper NO afecta a Tailwind (`text-sm`/`text-xs` = `rem`). Escalando
  `<html>` crece **todo** parejo (contenido + chrome). Se descartó "solo los globos" — hubiera
  requerido convertir a `em` cada clase de texto en `MessageNode`/`Markdown`/`PanelConversacion`
  (3 archivos delicados) para una diferencia marginal.
- **`FlowCanvas` un `useEffect`** (dep `escalaTexto`/`fuenteTexto`) hace
  `document.documentElement.style.fontSize = esc===1 ? "" : "NN%"` y
  `style.setProperty("--fuente-3maps", …)`. `globals.css`: `body { font-family: var(--fuente-3maps,
  Arial…) }`. Imperativo post-montaje, sin mismatch de hidratación (igual que el resto de settings).
- **`Markdown.tsx`**: los `text-[13px]` / `text-[11px]` / `text-[10px]` sueltos (h1/h2, code,
  tabla, botón copiar) pasaron a `em` (`text-[1.08em]` / `text-[0.92em]` / `text-[0.82em]`) → antes
  eran px fijos y no escalaban. El resto del contenido ya usa `text-xs`/`text-sm` (`rem`).
- **`Lora`** (serif) se sumó a `layout.tsx` con `next/font` (`--font-lora`). "sistema" = el stack
  Arial de siempre (el `body` ya renderiza en Arial, no en Geist — nadie aplica `font-sans`).
- Verificado en el pane: `<html>` 125% → pregunta 15px, h1 18.9px, tabla 16.1px, `body`
  font-family = Lora; escala 1 limpia el `font-size` inline; slider/`select` en vivo + persisten.
- **Revertir**: el texto vuelve a tamaño/fuente fijos; las clases `em` de `Markdown` quedan (son
  equivalentes a los px viejos a escala 1).

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
