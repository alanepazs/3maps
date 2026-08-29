# chat-arbol-ia

Web app para conversar con una IA (Claude / GPT / Gemini / DeepSeek, vía API con
la clave del propio usuario) mostrando la conversación como un **árbol de nodos
en un canvas libre** (tipo n8n / Obsidian Canvas) en vez de una lista con scroll.
Desde cualquier respuesta se puede **ramificar** una pregunta nueva sin desviar el
hilo principal.

> Estado: **fase 1 (MVP) en desarrollo**. Hoy hay solo el esqueleto visual del
> canvas: nodos, ramas, barra para escribir y placeholders. Todavía **no** hay
> llamadas a la IA ni guardado en disco.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Canvas de nodos: [React Flow](https://reactflow.dev/) (`@xyflow/react`)
- Fase 1: sin backend, sin login, todo client-side (deploy pensado para GitHub Pages)

## Correr en local

```bash
npm install
npm run dev
```

Abrir http://localhost:3000.

## Qué anda hoy

- Canvas a pantalla completa: arrastre libre, zoom y pan
- El hilo principal baja en vertical; las ramas salen por el costado
- Barra inferior para escribir (Enter envía, Shift+Enter salto de línea)
- Cada envío crea el nodo de la pregunta + un placeholder de respuesta de la IA
- Botón para eliminar un nodo y todo lo que cuelga de él

## Documentación de diseño

- [`CLAUDE.md`](CLAUDE.md) — resumen rápido de arquitectura y convenciones
- [`docs/spec-proyecto.md`](docs/spec-proyecto.md) — diseño detallado: modelo de
  datos (`.md` por nodo), algoritmo de contexto, gestión de costos de tokens,
  roadmap por fases

## Privacidad

La clave de API del usuario se guarda solo en su navegador. Nunca se manda a un
servidor de este proyecto. Nunca commitear claves ni archivos `.env`.
