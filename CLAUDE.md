# 3maps

**Nombre**: `3maps` — "3" = three = *tree* (árbol), y suena a "maps". Mapas de árbol.

Para el diseño detallado (modelo de datos, pseudocódigo del algoritmo, todas las decisiones de arquitectura) ver `docs/spec-proyecto.md` completo. Este archivo es solo un resumen rápido para orientarte al arrancar cada sesión.

## Qué es

Web app para conversar con una IA (Claude/GPT/Gemini/DeepSeek, vía API, con la clave del propio usuario) mostrando la conversación como un **árbol de nodos en un canvas libre** (tipo n8n / Obsidian Canvas) en vez de una lista vertical con scroll. Se puede ramificar una pregunta nueva desde cualquier respuesta vieja sin desviar el hilo principal.

Doble propósito: herramienta personal (ej. armar planes de estudio) y pieza de portfolio freelance. Repo pensado para ser público en GitHub.

## Stack decidido

- Next.js (App Router) + TypeScript + Tailwind CSS
- Canvas de nodos: React Flow (`@xyflow/react`)
- Embeddings locales para búsqueda de contexto relevante: `transformers.js` (corre en el navegador, sin instalación)
- **Fase 1 (MVP): sin backend, sin login.** Todo client-side. Deploy en GitHub Pages.
- Fase 2 (más adelante): Supabase (Postgres + Auth + Storage) para compartir árboles por link y sincronizar entre dispositivos — login opcional, no obligatorio.

## Modelo de datos (resumen — ver spec para el detalle completo)

- Cada nodo/mensaje = un archivo `.md` con frontmatter YAML (`id`, `padre_id`, `rol`, `x`, `y`, `proveedor`, `fecha`) y el contenido del mensaje abajo.
- Una carpeta = un árbol completo. El `padre_id` de cada nodo ya define las conexiones, no hace falta archivo aparte de edges.
- Exportar/compartir = comprimir la carpeta en `.zip`.

## Reglas de contexto y costos (importante, no romper esto)

1. Al armar el contexto para mandar a la IA, usar **solo el camino desde la raíz hasta el nodo actual** — nunca el árbol entero.
2. Aplicar ventana de contexto: últimos N nodos completos + resumen de lo más viejo de esa rama.
3. Cargar el contexto completo de una rama vieja solo cuando el usuario se posiciona ahí para ramificar (lazy loading), no antes.
4. Mantener el prefijo del contexto consistente entre llamadas sucesivas para aprovechar el prompt caching de la API.

## Convenciones del proyecto

- Todo en `.md` — es la fuente de la verdad, no una base de datos como storage principal en la fase 1.
- Sin login ni backend en la fase 1: no agregar autenticación ni llamadas a un servidor propio salvo que se esté trabajando explícitamente en la fase 2.
- La clave de API del usuario se guarda solo en su navegador, nunca se manda a un servidor propio.
- Nunca commitear claves ni archivos `.env` al repo (que es público).

## Estado actual

**Fase 1 en desarrollo — esqueleto visual del canvas.** Ya scaffoldeado (Next.js + React Flow) y con:

- Canvas full-screen: un globo = un intercambio (pregunta + respuesta), tronco vertical, ramas por el costado (arrastrables izq/der).
- Barra inferior para escribir (Enter envía). Los botones crean globos con placeholder de respuesta; **sin llamada real a la IA todavía**.
- Botón para eliminar un globo y su subárbol.
- Envión/inercia al soltar globos y al panear (tuerquita de ajustes arriba a la izquierda regula la intensidad).
- Modos del lienzo: sin teclas = manito (pan); barra espaciadora = puntero (recuadro de selección).

Repo: https://github.com/alanepazs/3maps

**Todavía falta**: llamada a la API con la clave del usuario, guardado en `.md`, ventana de contexto + resumen, embeddings locales.

## Preguntas todavía abiertas (ver spec, sección 14)

- ¿Abrir un globo muestra solo ese intercambio, o la transcripción completa de esa rama?
- Nivel de agresividad del resumen de contexto viejo.
- Formato final de compartir: ¿siempre carpeta comprimida, o también opción de un `.md` único?

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
