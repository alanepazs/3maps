# chat-arbol-ia

Este proyecto está en etapa de **planificación**, todavía no hay código escrito. Antes de generar cualquier archivo o estructura, leé `docs/spec-proyecto.md` completo — ahí está el diseño detallado (modelo de datos, pseudocódigo del algoritmo, todas las decisiones de arquitectura). Este archivo es solo un resumen rápido para orientarte al arrancar cada sesión.

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

Sin código todavía. Próximo paso típico: scaffoldear el proyecto Next.js y armar el canvas base con React Flow mostrando nodos de prueba.

## Preguntas todavía abiertas (ver spec, sección 14)

- ¿Abrir un globo muestra solo su mensaje, o la transcripción completa de esa rama?
- Nivel de agresividad del resumen de contexto viejo.
- Formato final de compartir: ¿siempre carpeta comprimida, o también opción de un `.md` único?
