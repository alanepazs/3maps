# 3maps

**Nombre**: `3maps` — "3" = three = *tree* (árbol), y suena a "maps". Mapas de árbol.

**Logo** (B6, shippeado 03-09): un **árbol verde** cuya **copa son globos de diálogo**
naranjas/ámbar (algunos verdes) + wordmark **"3maps"** naranja lowercase. Assets en `public/`:
`logo.png` (lockup completo) y `3.png` (la marca sola), ambos transparentes. **Favicon** =
`src/app/{icon.png, favicon.ico}` (la marca `3.png` sobre blanco — el lockup con texto es
ilegible a 16px; sin `apple-icon.png` por decisión de Alan). **Watermark** del canvas =
`logo.png` completo al 5% de opacidad, hijo de `<ReactFlow>` (el `colorMode="dark"` pinta fondo
opaco). `src/model/assets.ts` `rutaAsset()` (Next no prefija con basePath las URLs de `public/`
a mano). Ver decisiones B6.

## Al arrancar una sesión, leé (en este orden)

1. Este archivo (invariantes + convenciones que no se rompen).
2. `docs/estado.md` — dónde estamos, qué falta, gotchas, cómo correr/publicar. **Corto.**
3. `docs/arquitectura.md` — mapa de `src/` (qué hace cada archivo + `file:línea`).
4. `.claude/napkin.md` — gotchas del entorno (preview pane, git/gh, graphify).
5. `docs/decisiones.md` — por qué el código es como es (no revertir sin pensar). Antes de tocar
   `ia.ts`, `FlowCanvas`, persistencia, sync o el `.md`.
6. `docs/historia.md` — qué shippeó cada fase. Solo si necesitás el contexto histórico.
7. `docs/spec-proyecto.md` — diseño de producto (modelo de datos, pseudocódigo). Solo si tocás
   datos / IA / contexto.

**Navegar el código — `graphify` SIEMPRE (imperativo, Alan 03-09)**: antes de tocar código o
abrir archivos de `src/`, correr `graphify query "<pregunta>"` desde `D:\IA\3maps` — devuelve el
subgrafo con `archivo:línea` de qué llama a qué (napkin §6b). Al terminar cambios de estructura,
regenerar: `graphify update . --force`.

**Los `.md` de `docs/` son la fuente de la verdad del proyecto — trabajá SIEMPRE entre ellos**:
antes de un cambio, leé el que corresponde; después del cambio, actualizá `estado.md` +
`decisiones.md` (el porqué) + `arquitectura.md` (si cambió la estructura) + `historia.md` (qué
shippeó). No dejar los `.md` desincronizados del código. Vale para todo cambio, no solo "de ahora
en más".

## Método de trabajo — IMPERATIVO (agent-skills)

Antes de cualquier tarea no trivial (implementar, arreglar un bug, cambiar comportamiento,
diseñar, revisar, shippear), **invocá el skill `using-agent-skills`** y seguí el skill de la fase
que corresponda. No es opcional. Las 25 skills viven en `.claude/skills/` (gitignoreado, vendorizado
de github.com/addyosmani/agent-skills MIT — ver `.claude/AGENT-SKILLS.md`; actualizar re-clonando).

- **Ciclo**: `spec-driven-development` → `planning-and-task-breakdown` → `incremental-implementation`
  + `test-driven-development` → `debugging-and-error-recovery` → `code-review-and-quality` /
  `code-simplification` → `git-workflow-and-versioning` / `shipping-and-launch`.
- **Activación por contexto**: API/interfaces → `api-and-interface-design`; UI → `frontend-ui-engineering`;
  perf → `performance-optimization`; seguridad → `security-and-hardening`; migraciones →
  `deprecation-and-migration`; docs/ADRs → `documentation-and-adrs`.
- **Slash commands** (en `.claude/commands/`): `/spec` `/plan` `/build` `/test` `/constraints`
  `/review` `/code-simplify` `/webperf` `/ship`. **Subagents** (`.claude/agents/`): `code-reviewer`,
  `security-auditor`, `test-engineer`, `web-performance-auditor`.
- **Principios no negociables del meta-skill**: enunciar supuestos antes de implementar; frenar ante
  inconsistencias en vez de adivinar; pushback con impacto concreto; preferir la solución aburrida;
  disciplina de scope (solo lo pedido); **verificar, no asumir** (una tarea no está lista hasta que
  la verificación pasa).

Esto convive con las convenciones de abajo y el modo caveman; ante conflicto, las invariantes de
este archivo ganan.

## Qué es

Web app para conversar con una IA (Claude/GPT/Gemini/DeepSeek, vía API, con la clave del propio
usuario) mostrando la conversación como un **árbol de nodos en un canvas libre** (tipo n8n /
Obsidian Canvas) en vez de una lista vertical con scroll. Se puede ramificar una pregunta nueva
desde cualquier respuesta vieja sin desviar el hilo principal.

Doble propósito: herramienta personal (ej. armar planes de estudio) y pieza de portfolio
freelance. Repo público: https://github.com/alanepazs/3maps

## Stack

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind CSS 4
- Canvas de nodos: React Flow (`@xyflow/react` v12)
- Supabase (backend **opcional**): login, compartir por link, sync, proxy de IA (`ia-proxy`).
- Deploy: **GitHub Pages** (`output: "export"`, estático). Todo el canvas + la IA corren client-side.
- Fase 1-4 en prod. Fase 5 (globo = tramo) en curso. Estado y pendientes: `docs/estado.md`.

## Invariantes — NO romper

### Modelo de datos
- **El intercambio (una pregunta + su respuesta) es la unidad de DATOS.** Cada uno es un `.md`
  con frontmatter (`id`, `padre_id`, `rama`, `x`, `y`, `ancho`, `alto`, `color`, `proveedor`,
  `fecha`, `tokens_in/out`, `adjuntos`) + secciones `## Pregunta` / `## Respuesta`. Una carpeta =
  un árbol. El `padre_id`
  define las flechas. Exportar = `.zip` de la carpeta.
- **Un globo (nodo del canvas) = un TRAMO: una cadena maximal de intercambios unidos por
  `rama: "main"`** (Fase 5, decisiones F5-1). Enter agrega al mismo tramo; un globo nuevo se crea
  solo al **ramificar** (`rama != "main"`). El tramo es una agrupación **derivada** en
  `arbolAVista` (`calcularTramos`) — el modelo de datos no cambió, no hubo migración.
- Lo que importa es **ramificar respuestas** desde cualquier intercambio del tramo; la pregunta
  que abre una rama es solo el disparador.

### Contexto y costos de tokens
1. Al armar el contexto para la IA, usar **solo el camino raíz→nodo actual**, nunca el árbol
   entero. Aplanar cada intercambio a mensajes user/assistant.
2. Ventana de contexto: últimos N intercambios completos + resumen de lo más viejo de esa rama.
3. Cargar el contexto completo de una rama vieja solo al posicionarse ahí para ramificar (lazy).
4. Mantener el prefijo del contexto consistente entre llamadas para aprovechar el prompt caching.

### Convenciones
- **El `.md` es la fuente de la verdad, no una DB.** Supabase Storage guarda los `.md` tal cual
  (el server solo los aloja); Postgres solo guarda metadata (slugs, dueños, títulos).
- **Login y backend (Supabase) son opcionales.** Sin las env `NEXT_PUBLIC_SUPABASE_*` la app es
  100% local, idéntica a fase 1. El modo local es el default.
- **La clave de API del usuario vive en su navegador; nunca en infraestructura de terceros ni
  compartida con otros usuarios.** Dos excepciones acordadas: (a) los proveedores
  OpenAI-compatibles *transitan* el proxy stateless `ia-proxy` — no loguea ni guarda (decisiones
  §7a); (b) **con sesión iniciada**, las keys/modelos se guardan en el bucket privado del propio
  usuario (`sync/<uid>/config.json`, RLS por cuenta) para tenerlas en todos sus dispositivos
  (decisiones §9). Sin login, siguen solo en `localStorage`.
- Nunca commitear claves ni `.env` (el repo es público). La `service_role` de Supabase **nunca**
  al repo ni al cliente.
- Al terminar una sesión: `tsc` + `lint` en verde, `git push`, y actualizar `docs/estado.md`.
