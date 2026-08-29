# 3maps

**Nombre**: `3maps` — "3" = three = *tree* (árbol), y suena a "maps". Mapas de árbol.

## Al arrancar una sesión, leé (en este orden)

1. Este archivo (invariantes + convenciones que no se rompen).
2. `docs/estado.md` — dónde estamos, qué anda, qué falta, issues conocidos, cómo correr/publicar.
3. `docs/arquitectura.md` — mapa de `src/` para no leer todo el código.
4. `.claude/napkin.md` — gotchas del entorno (preview pane, git/gh, etc).
5. `docs/decisiones.md` — por qué el código es como es (decisiones de implementación que no se
   revierten sin pensar). Leer antes de tocar `ia.ts`, `FlowCanvas`, persistencia o el `.md`.
6. `docs/spec-proyecto.md` — diseño detallado (modelo de datos, pseudocódigo, decisiones de
   producto). Solo si vas a tocar la parte de datos / IA / contexto.

## Qué es

Web app para conversar con una IA (Claude/GPT/Gemini/DeepSeek, vía API, con la clave del propio
usuario) mostrando la conversación como un **árbol de nodos en un canvas libre** (tipo n8n /
Obsidian Canvas) en vez de una lista vertical con scroll. Se puede ramificar una pregunta nueva
desde cualquier respuesta vieja sin desviar el hilo principal.

Doble propósito: herramienta personal (ej. armar planes de estudio) y pieza de portfolio
freelance. Repo público: https://github.com/alanepazs/3maps

## Stack

- Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind CSS 4
- Canvas de nodos: React Flow (`@xyflow/react` v12)
- Fase 2 (más adelante): `transformers.js` para embeddings locales; Supabase para compartir/sync.
- **Fase 1 (MVP): sin backend, sin login.** Todo client-side. Deploy pensado para GitHub Pages.

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
- `.md` es la fuente de la verdad en fase 1, no una DB.
- Sin login ni backend propio en fase 1.
- La clave de API del usuario vive solo en su navegador. Nunca a un servidor propio.
- Nunca commitear claves ni `.env` (el repo es público).
- Al terminar una sesión: `tsc` + `lint` en verde, `git push`, y actualizar `docs/estado.md`.
