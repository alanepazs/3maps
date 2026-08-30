# Fase 2 — Compartir y sincronizar

> Plan de trabajo. Estado: **borrador inicial** (empezado 29-08-2026). Nada de esto está hecho.
> Fase 1 (MVP) quedó cerrada — ver `docs/estado.md`.

Complementa a `docs/spec-proyecto.md` §7 (compartir), §9 (auth), §13 (roadmap) y a
`docs/decisiones.md` §7a (por qué DeepSeek/GPT esperan a fase 2).

---

## Objetivo

Sumar un backend **opcional** (Supabase) sin romper el "local-first" de fase 1:

1. **Compartir un árbol por link** — subir sus `.md` a Storage, abrir por slug en modo lectura.
2. **Sync entre dispositivos** — si el usuario se loguea, su árbol vive también en el server.
3. **DeepSeek / GPT** — un proxy que agrega los headers de CORS que esos proveedores no mandan.
4. **(Track aparte)** Embeddings locales con `transformers.js` para relevancia de contexto (spec §5.4).

El que solo usa 3maps local **nunca ve nada de esto**: sin login, sin llamadas al server, igual
que hoy.

---

## Qué cambia respecto de fase 1 — invariantes a revisar

Tres convenciones de `CLAUDE.md` dicen explícitamente "en fase 1". Fase 2 las levanta, pero **con
límites nuevos**, no las borra:

| Invariante fase 1 | Qué pasa en fase 2 |
|---|---|
| "Sin login ni backend propio" | Hay backend (Supabase) y login, **ambos opcionales**. El modo local sigue siendo el default y funciona sin tocar el server. |
| "`.md` es la fuente de la verdad, no una DB" | El `.md` **sigue siendo el formato canónico**. Supabase Storage guarda los `.md` tal cual (spec §7: "el servidor solo los aloja"). No se pasa a un esquema relacional para el árbol. Postgres solo guarda metadata (slugs, dueños, títulos). |
| "La API key vive solo en el navegador, nunca a un servidor propio" | **Decisión abierta — ver abajo.** El proxy de DeepSeek/GPT necesita que la key pase por el edge function. |

### Decisión abierta 1 — la key de IA y el proxy

Para llamar a DeepSeek/GPT desde el navegador hace falta un proxy (no habilitan CORS). El proxy
recibe la request del navegador, le agrega los headers de CORS y la reenvía al proveedor. **La
API key del usuario viaja en esa request, a través de nuestro edge function.**

Opciones:

- **A. Proxy stateless de 3maps, opt-in.** Un edge function que solo reenvía: no loguea, no
  guarda, no ve el body más allá de reenviarlo. La invariante pasa a: *"la key nunca se
  **almacena** en un servidor de 3maps; puede **transitar** un proxy stateless que el usuario
  activa a propósito, con un toggle en ⚙️ que lo explica"*. Menor fricción, cubre a todos.
- **B. El usuario trae su propia URL de proxy.** Campo configurable en ⚙️. La invariante queda
  intacta. Fricción alta: casi nadie va a montar un proxy.
- **C. No hacer DeepSeek/GPT.** Gemini (free) + Claude (billing) ya cubren el caso. DeepSeek/GPT
  se quedan en el tipo `Proveedor` sin adaptador, indefinidamente.

**Recomendación:** A. Es lo que hace que "multi-proveedor" de verdad signifique algo, y el
opt-in + la transparencia del toggle respetan el espíritu de la invariante (que nadie mande su
key a un server sin saberlo).

### Decisión abierta 2 — alcance real de fase 2

Fase 2 son 4 tracks que se pueden hacer por separado. ¿Todos, o un subconjunto para empezar?
Ver "Bloques de trabajo" y elegir hasta dónde llega esta tanda.

---

## Bloques de trabajo

Ordenados por dependencia. Cada bloque es committeable solo.

### 2.0 — Fundaciones Supabase

- Proyecto Supabase (free tier). Supabase CLI para migraciones y edge functions.
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `.env.local` (la anon key es
  pública por diseño — RLS protege los datos; **no** confundir con la service_role key, que nunca
  va al repo ni al cliente).
- `src/model/supabase.ts` — cliente singleton, `null` si no hay env (modo local puro).
- CSP: hoy no hay `Content-Security-Policy` en la app. Si se agrega una, incluir el dominio de
  Supabase en `connect-src`. Si no, no hay nada que tocar.
- El deploy sigue siendo GitHub Pages (estático). Las edge functions se deployan aparte con la
  CLI de Supabase — no pasan por el workflow de Pages.

**Nota de entorno:** hay un MCP de Supabase (`plugin:…:supabase`) que en esta sesión no está
autorizado. Para usarlo el usuario tiene que correr el OAuth desde una sesión interactiva
(`claude mcp` o `/mcp`). No es bloqueante para planear ni para el código — solo acelera el setup.

### 2.1 — Proxy IA para DeepSeek / GPT

Depende de: 2.0 y de la **decisión abierta 1**.

- `supabase/functions/ia-proxy/index.ts` — reenvía a `api.openai.com` / `api.deepseek.com`,
  agrega headers de CORS, hace pipe del stream SSE de vuelta. Stateless: sin logs del body, sin
  storage.
- `llamarOpenAICompat(config, mensajes, opts)` en `ia.ts` — un helper para los dos `case`
  (`deepseek` y `gpt`), mismo shape de SSE, cambia base URL y `max_tokens` vs
  `max_completion_tokens`. Pega contra la URL del proxy, no contra el proveedor.
- `PROVEEDORES_DISPONIBLES` suma `deepseek` y `gpt`.
- ⚙️: toggle "usar el proxy de 3maps para DeepSeek/GPT" (opt-in) con el texto que explica que la
  key transita el proxy. Sin el toggle activo, esos proveedores quedan deshabilitados con un
  cartel que linkea a la explicación.
- Actualizar `decisiones.md §7a` (hoy dice "diferido a fase 2") con la decisión final.

### 2.2 — Auth opcional (Supabase Auth)

Depende de: 2.0.

- Magic link por email, o OAuth con Google (elegir uno para empezar).
- Botón "Iniciar sesión" discreto (¿en ⚙️? ¿esquina?). El usuario anónimo no ve cambios.
- `useSession()` / contexto de auth. La mayor parte de la app lo ignora.
- Sin login, todo sigue en `localStorage` como hoy.

### 2.3 — Compartir un árbol por link

Depende de: 2.0. Auth (2.2) **no** es estrictamente necesaria para compartir de forma anónima,
pero sí para "mis árboles compartidos" y para poder despublicar.

- Acción "Compartir" → sube los `.md` del árbol a un bucket de Storage bajo un slug aleatorio.
- Tabla `shared_trees` en Postgres: `slug`, `owner_id` (nullable si anónimo), `titulo`,
  `created_at`. RLS: lectura pública por slug, escritura solo del dueño.
- Abrir `…/3maps/?share=<slug>` → baja los `.md`, reconstruye el árbol **en modo lectura** (o con
  botón "importar a mi copia local"). Reusa el parser de `.md` que ya existe.
- Límite de tamaño / rate-limit para no comerse el free tier.

### 2.4 — Sync entre dispositivos

Depende de: 2.2 y 2.3 (reusa Storage).

- Usuario logueado: su árbol se sincroniza a su Storage privado.
- Estrategia de conflicto: last-write-wins por archivo `.md`, con `updated_at`. Documentar el
  caso "edité en dos dispositivos offline".
- Vista "Mis árboles".

### 2.5 — Embeddings locales (`transformers.js`) — track independiente

No depende de Supabase. Se puede hacer antes, después o en paralelo.

- `transformers.js` en un web worker. Modelo chico de embeddings (~25 MB, se baja una vez y
  queda en cache del browser).
- Calcular embedding por intercambio al crearlo. Guardar junto al `.md` (¿frontmatter? ¿store
  aparte en IndexedDB?).
- Al armar contexto: en vez de solo la ventana lineal (últimos N + resumen), traer también los
  intercambios viejos **semánticamente cercanos** a la pregunta actual (spec §5.4).
- UX del primer uso: la descarga del modelo no puede bloquear la app.
- Riesgo: complejidad alta para la ganancia. Evaluar si entra en esta fase o queda para después.

---

## Qué NO se hace en fase 2

- Modelos locales tipo Ollama (spec §10) — fase 3.
- Estado `expandido`/colapsado por globo para performance (spec §8) — ortogonal, cuando duela.
- Colaboración en tiempo real / multi-cursor. Compartir es lectura, no co-edición.
- Migrar el árbol a un esquema relacional. El `.md` manda.

---

## Decisiones abiertas (resumen)

1. **Proxy y la key de IA** — A (proxy stateless opt-in) / B (proxy propio del usuario) / C (no
   hacer DeepSeek/GPT). Recomendado: A.
2. **Alcance de esta tanda** — ¿los 4 tracks, o empezar por un subconjunto (ej: 2.0 + 2.3
   compartir, y dejar proxy/sync/embeddings para después)?
3. **Auth: magic link o Google OAuth** para empezar.
4. **Compartir anónimo permitido, o solo con login.**
5. **Embeddings: en fase 2 o se difiere.**
