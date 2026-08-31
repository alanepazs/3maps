# 3maps

**Nombre**: `3maps` — "3" = three = *tree* (árbol), y suena a "maps". Mapas de árbol.

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

**Para navegar el código sin leer archivos enteros**: `graphify query "<pregunta>"` desde
`D:\IA\3maps` (napkin §6b) — devuelve el subgrafo con `archivo:línea`.

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
- Fase 1 + 2 + 3 shippeadas y en prod. Estado y pendientes: `docs/estado.md`.

## Invariantes — NO romper

### Modelo de datos
- **Un globo = un intercambio** (una pregunta + su respuesta), no un mensaje suelto.
- Cada intercambio se guardará como un `.md` con frontmatter (`id`, `padre_id`, `rama`, `x`, `y`,
  `proveedor`, `fecha`) + secciones `## Pregunta` / `## Respuesta`. Una carpeta = un árbol.
  El `padre_id` define las flechas. Exportar = `.zip` de la carpeta.
- Lo que importa es **ramificar respuestas**; la pregunta que abre una rama es solo el disparador.

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
