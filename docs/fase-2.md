# Fase 2 — Compartir y sincronizar

> Plan de trabajo. Estado: **2.0 + 2.3 codeados** (29-08-2026), esperando que el usuario corra
> `supabase/schema.sql` y cargue los secrets de GitHub para probar el flujo real.
> Fase 1 (MVP) quedó cerrada — ver `docs/estado.md`.

## Pendiente del usuario para activar 2.3

1. **Correr `supabase/schema.sql`** en el panel de Supabase → SQL Editor → pegar → Run.
   (Crea el bucket `arboles` + las políticas de acceso.)
2. **Cargar los secrets en GitHub** para que la app publicada tenga backend:
   repo → Settings → Secrets and variables → Actions → New repository secret:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://ejecjjpdjoxgrbqrhwwd.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la publishable key (`sb_publishable_…`)
   Sin esto, la app publicada se buildea sin backend (el botón Compartir no aparece); local sí
   funciona porque está el `.env.local`.
3. **Probar** (con guía): ⚙️ → sección Compartir → "Generar link" → abrir el link en otra ventana
   → ver el árbol en modo lectura → "Guardar en mi 3maps".

## Decisiones tomadas (29-08-2026)

1. **Proxy IA (DeepSeek/GPT) → opción A**: edge function stateless opt-in. Nuestro server
   reenvía sin loguear ni guardar; toggle en ⚙️ que avisa que la key transita el proxy. La
   invariante de CLAUDE.md pasa a: *"la key nunca se **almacena** en un servidor de 3maps; puede
   **transitar** un proxy stateless que el usuario activa a propósito"*.
2. **Primera tanda → 2.0 + 2.3**: fundaciones Supabase + compartir un árbol por link. El resto
   (proxy, auth completo, sync, embeddings) queda para tandas siguientes.
3. **Compartir anónimo permitido** — no exige login para generar un link (decisión de arranque;
   revisable si aparece abuso). El login (2.2) suma "mis árboles" y poder despublicar.

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

### 2.0 — Fundaciones Supabase — ✅ codeado (`76758d3`)

- [x] Proyecto Supabase (free tier), región Americas. `ref` = `ejecjjpdjoxgrbqrhwwd`.
- [x] `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `.env.local` (gitignoreado).
      La anon/publishable key es pública por diseño; la service_role **nunca** va al repo ni al
      cliente.
- [x] `src/model/supabase.ts` — `getSupabase()` → cliente singleton o `null` si no hay env.
      `haySupabase()` para la UI.
- [x] `supabase/schema.sql` — bucket `arboles` + políticas RLS. **Lo corre el usuario** en el
      SQL Editor (ver arriba).
- [x] `deploy.yml` pasa las env desde repo secrets. **Faltan cargar los secrets** (ver arriba).
- CSP: hoy no hay `Content-Security-Policy` en la app → nada que tocar.
- El deploy sigue siendo GitHub Pages (estático). Las edge functions (2.1+) se deployan aparte
  con la CLI de Supabase.

**Nota de entorno:** hay un MCP de Supabase (`plugin:…:supabase`) que en esta sesión no está
autorizado. Para usarlo el usuario tiene que correr el OAuth desde una sesión interactiva
(`claude mcp` o `/mcp`). No es bloqueante para planear ni para el código — solo acelera el setup.

### 2.1 — Proxy IA para DeepSeek / GPT — ✅ codeado (`9a2eecc`), falta deployar la function

Decisión: **opción A** (proxy stateless opt-in). Ver `decisiones.md` §7a + F2-6.

- [x] `supabase/functions/ia-proxy/index.ts` — edge function Deno. Reenvía a `api.openai.com` /
      `api.deepseek.com` con la key del usuario (`x-ia-key`), agrega CORS, hace pipe del stream.
      **Stateless**: no loguea el body ni la key, no guarda. Proveedores + rutas fijos (anti-SSRF),
      orígenes permitidos (`alanepazs.github.io` + `localhost:3000`, override con env
      `PROXY_ALLOWED_ORIGINS`). `supabase/config.toml` → `verify_jwt = false`.
- [x] `llamarOpenAICompat` + `listarModelosOpenAICompat` en `ia.ts`. SSE estilo OpenAI
      (`choices[0].delta.content`). `max_tokens` (deepseek) vs `max_completion_tokens` (gpt).
      La URL del proxy se deriva de `NEXT_PUBLIC_SUPABASE_URL` (`/functions/v1/ia-proxy`).
- [x] `PROVEEDORES_DISPONIBLES` = los 4. `settings.usarProxyIA` (opt-in, default false).
      SettingsPanel: caja ámbar + checkbox. Sin toggle → error claro; sin Supabase → "no disponible".
- [x] Verificado en navegador: toggle off → error "activá el proxy"; toggle on → intenta el proxy.

**Pendiente del usuario:**
1. **Deployar la function.** Con la CLI de Supabase (`npm i -g supabase`, `supabase login`):
   ```
   supabase functions deploy ia-proxy --project-ref ejecjjpdjoxgrbqrhwwd
   ```
   O en el panel: Edge Functions → Create → nombre `ia-proxy` → pegar el contenido de
   `supabase/functions/ia-proxy/index.ts` → Deploy. Después, en la config de esa function,
   **desactivar "Verify JWT"**.
2. **Probar con una key real** de DeepSeek o OpenAI (como pasó con Claude — sin key propia no se
   puede verificar end-to-end). DeepSeek es el más barato.

### 2.2 — Auth opcional (Supabase Auth)

Depende de: 2.0.

- Magic link por email, o OAuth con Google (elegir uno para empezar).
- Botón "Iniciar sesión" discreto (¿en ⚙️? ¿esquina?). El usuario anónimo no ve cambios.
- `useSession()` / contexto de auth. La mayor parte de la app lo ignora.
- Sin login, todo sigue en `localStorage` como hoy.

### 2.3 — Compartir un árbol por link — ✅ codeado (`51dc403`)

- [x] `src/model/compartir.ts` — `compartirArbol(arbol, titulo)` sube `arboles/<slug>.json` y
      devuelve `{slug, url}`. `cargarArbolCompartido(slug)` lo baja y reconstruye. Sin tabla de
      metadata todavía (llega con login).
- [x] Botón "Compartir" en ⚙️ (sección nueva) → título opcional → "Generar link" → copiar.
- [x] Abrir `…/?compartir=<slug>` → carga en **modo lectura** (`SharedBanner` + `readOnly` por
      `NodeActionsContext`); "Guardar en mi 3maps" lo pasa a local editable. Link roto → cae al local.
- [x] Topes: 50 intercambios / ~1 MB (cliente) + 2 MB (bucket).
- [x] **Flujo verificado end-to-end** (29-08-2026): en local y **en producción**
      (`alanepazs.github.io/3maps`, deploy #35 con los secrets cargados). Generar link → abrir en
      limpio → modo lectura → "Guardar en mi 3maps". Bucket `arboles` + políticas OK.

**2.3 completo.** Nada pendiente del usuario para compartir por link.

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

## Decisiones abiertas (para tandas siguientes)

- **Auth (2.2): magic link o Google OAuth** para empezar.
- **Sync (2.4): estrategia de conflicto** cuando se edita en dos dispositivos offline.
- **Embeddings (2.5): en fase 2 o se difiere a fase 3.**

---

## Plan concreto de la primera tanda (2.0 + 2.3)

### Lo que hace falta del lado del usuario (Alan)

1. Crear un proyecto en Supabase (free tier). Ya lo hizo antes, conoce el flujo.
2. Pasarme dos datos del proyecto (los dos son públicos por diseño, no son secretos):
   - **Project URL** (algo como `https://xxxx.supabase.co`)
   - **anon/public key** (el JWT largo que empieza con `eyJ…`)
3. Estos van en un `.env.local` que **no se commitea** (ya está en `.gitignore` por ser `.env*`).
   Para el deploy de Pages, se cargan como *repository secrets* / *variables* de GitHub Actions
   y el workflow los inyecta en el build.
4. La **service_role key** de Supabase (la secreta de verdad) **nunca** me la pases ni la
   pongas en el repo. Solo se usa dentro de Supabase (edge functions), configurada en su panel.

### Lo que hago yo — paso a paso

**2.0 — Fundaciones**
- `src/model/supabase.ts`: cliente de Supabase. Si no hay env configurado → devuelve `null` y la
  app sigue 100% local como hoy (nadie que no configure nada nota ningún cambio).
- Agregar `@supabase/supabase-js` a las dependencias.
- Migración SQL para la tabla `shared_trees` (metadata de los árboles compartidos) + un bucket de
  Storage `arboles` con sus reglas de acceso (RLS): cualquiera lee por slug, solo el dueño escribe.
- Actualizar `arquitectura.md` y `decisiones.md`.

**2.3 — Compartir por link**
- Función `compartirArbol(arbol)`: sube cada `.md` del árbol al bucket bajo un slug aleatorio
  corto (tipo `a7f3k9`), crea la fila en `shared_trees` con el título y la fecha, y devuelve el
  link (`https://alanepazs.github.io/3maps/?compartir=a7f3k9`).
- Botón "Compartir" en la UI (¿en ⚙️? ¿un botón flotante?). Al apretarlo: sube, y muestra el link
  con un "copiar".
- Al abrir 3maps con `?compartir=<slug>` en la URL: baja los `.md` de ese slug, los parsea con el
  parser que ya existe, y muestra el árbol **en modo lectura** con un botón "guardar una copia en
  este navegador" para quien lo quiera editar.
- Límite de tamaño (ej. 50 intercambios o 1 MB por árbol) para no quemar el free tier, con un
  mensaje claro si se pasa.

### Cómo se verifica

- Lógica (subir/bajar/parsear, generar slug, límite de tamaño): scripts de prueba, como siempre.
- El flujo real (apretar Compartir → abrir el link en otra ventana → ver el árbol): lo probás vos
  con el proyecto de Supabase de verdad, con mi guía paso a paso, igual que hicimos con las keys
  de IA.

### Nota sobre el MCP de Supabase

Hay un conector de Supabase para Claude (`plugin:…:supabase`) que **no está autorizado en esta
sesión** y no se puede autorizar desde acá (es no-interactiva). Si lo autorizás desde una
terminal `claude` interactiva (`/mcp`), me deja hacer parte del setup (crear tablas, ver el
estado) sin que copies y pegues. **No es necesario** — sin el MCP, yo escribo el SQL y las
instrucciones, y vos las corrés en el panel de Supabase. Vos decidís si vale la pena autorizarlo.
