# 3maps

## ¿Qué es 3maps?

3maps es una aplicación web pensada para resolver un problema común en los
chats con IA: son lineales. Si en medio de una respuesta querés repreguntar
sobre un punto puntual, no hay otra que seguir abajo — y el hilo original
queda enterrado.

3maps te deja repreguntar hacia el costado: cada repregunta abre una rama
nueva sin tocar la conversación principal, y esas ramas van formando un mapa
de nodos navegable.

**Probala:** https://alanepazs.github.io/3maps/ — sin instalar nada, sin cuenta.

## Demo

![Demo de 3maps: árbol de conversación, ramificar, tema claro/oscuro, panel de conversación y modelo local](.github/assets/demo.gif)

---

## Cómo funciona

Todo corre en tu navegador: sin cuenta, sin servidor propio, sin nada que instalar.

- **Guardado local.** Cada conversación se guarda como archivos Markdown en tu
  navegador (un conjunto de archivos = un mapa). Persiste entre sesiones en la
  misma máquina y navegador; no hay sincronización en la nube en este modo.
- **Tu propia API key.** Elegís el proveedor (Google Gemini es gratis) y tu key
  viaja directo a él — 3maps nunca la ve. Más detalle en [Privacidad](#privacidad).
- **O corré todo en tu máquina, sin key.** Con [Ollama](https://ollama.com)
  instalado en tu compu, o con **WebLLM** corriendo directo en el navegador vía
  WebGPU (Chrome/Edge de escritorio, sin instalar nada). 3maps detecta tu equipo
  y te sugiere qué modelo conviene correr.
- **Contexto acotado.** Cada rama solo envía el camino raíz hasta el globo actual;
  lo viejo se resume. Una charla larga no reenvía todo de nuevo cada vez.
- **Exportás e importás** un mapa completo como `.zip`.

## Modo local vs. con cuenta

El login es opcional. Por defecto, 3maps corre 100% local: sin cuenta, sin nada
que configurar.

| Función | Local (default) | Con cuenta |
|---|:---:|:---:|
| IA, ramificar, el lienzo entero | ✅ | ✅ |
| Guardado en el navegador | ✅ | ✅ |
| Login (Google / magic-link) | — | ✅ |
| Compartir un mapa por link | — | ✅ |
| Sincronizar entre dispositivos | — | ✅ |
| Keys en todos tus dispositivos | — | ✅ |

## Proveedores de IA

- **Gratis, sin tarjeta:** Google Gemini, Groq, OpenRouter, Hugging Face.
- **Pagos (con tu propia cuenta):** Claude (Anthropic), OpenAI, DeepSeek.
- **Local:** Ollama (instalado en tu compu) o WebLLM (en el navegador, sin instalar nada).

Adjuntás texto, imágenes y PDF (según lo que soporte el modelo elegido).

## Stack

- **Frontend:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4
- **Canvas de nodos:** [React Flow](https://reactflow.dev/) (`@xyflow/react` v12)
- **Backend opcional:** Supabase (login, compartir, sync, proxy de IA)
- **Deploy:** GitHub Pages (`output: "export"`, estático — todo corre client-side)

## Correr en local

Requiere Node 20.9 o superior (lo que pide Next.js 16).

```bash
git clone https://github.com/alanepazs/3maps.git
cd 3maps
npm install
npm run dev          # http://localhost:3000
```

Sin las variables `NEXT_PUBLIC_SUPABASE_*` en `.env.local`, corre 100% local: sin
login, sin compartir por link, sin sincronizar entre dispositivos — el resto
(IA, ramificar, exportar) funciona igual.

## Privacidad

Tu API key vive solo en tu navegador y viaja directo al proveedor que elegiste —
nunca pasa por infraestructura de 3maps. Los proveedores que no habilitan CORS
pasan, si querés, por un edge function propio y `stateless`: solo reenvía la
solicitud, no la loguea ni la guarda.

El repo es público y no tiene claves ni archivos `.env` commiteados.

## Documentación

- [`docs/arquitectura.md`](docs/arquitectura.md) — qué hace cada archivo de `src/`
- [`docs/decisiones.md`](docs/decisiones.md) — por qué el código es como es
- [`docs/spec-proyecto.md`](docs/spec-proyecto.md) — diseño: modelo de datos
  (`.md` por intercambio), algoritmo de contexto, costos de tokens, roadmap
- [`CLAUDE.md`](CLAUDE.md) — invariantes y convenciones del proyecto
