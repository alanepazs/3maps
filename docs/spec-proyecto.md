# Chat en Árbol IA — Documento de proyecto

> Nombre de trabajo: **chat-arbol-ia**. Cambialo cuando definas un nombre final.
> Estado: fase 1 (MVP) en desarrollo — esqueleto visual del canvas armado, sin IA ni guardado todavía.
> Última actualización: 29-08-2026.

## 1. Resumen del proyecto

Una web app donde el usuario conversa con una IA (Claude, GPT, Gemini, DeepSeek u otra, según la clave que cargue) integrada vía API — sin usar la interfaz de chat del proveedor. En vez de mostrar la conversación como una lista vertical con scroll, la muestra como un **mapa interactivo de nodos** (canvas libre, tipo n8n / Obsidian Canvas): cada **intercambio** (una pregunta + su respuesta) es un "globo" (bubble), las flechas conectan un intercambio con el siguiente, y el usuario puede **ramificar** desde cualquier globo viejo para hacer una sub-pregunta sin desviar el hilo principal ni perder el lugar donde estaba.

**Doble propósito:** herramienta personal (por ejemplo, para armar planes de estudio) y pieza de portfolio para freelance (Upwork/Workana), con la ambición de que eventualmente la use más gente.

## 2. Concepto central (UX)

- La conversación no es una lista, es un **árbol**.
- **Un globo = un intercambio completo**: la pregunta del usuario (arriba, como encabezado) y la respuesta de la IA (abajo, como cuerpo) viven en el mismo nodo. Se busca la menor cantidad de globos posible para que el árbol no crezca visualmente de más.
- Cada globo se mueve libremente por el canvas (posición manual, no un layout fijo — fluidez tipo Obsidian).
- Desde cualquier globo (no solo el último) se puede abrir una pregunta nueva → nace una rama nueva, sin tocar la rama principal. **Lo que importa es ramificar respuestas**: la pregunta que origina la rama es solo el disparador, no un nodo aparte.
- El "tronco" es la conversación principal y siempre baja en **vertical** (arriba → abajo). Cada desvío es una **rama** que sale por un **costado** del globo.
- **Lado de la rama**: al crearse, la rama nace por la derecha. El usuario puede arrastrar el globo ramificado al lado izquierdo del tronco; al soltarlo, la flecha se reconecta sola al costado (izquierda o derecha) que corresponda según dónde quedó.
- Pendiente de definir (ver sección 14): al abrir/hacer doble click en un globo, ¿se ve solo ese intercambio, o se abre una vista de transcripción con toda la rama en orden, tipo chat normal?

## 3. Modelo de datos

Cada **nodo** (un intercambio pregunta + respuesta) se guarda como un archivo `.md` individual, con metadata en YAML al principio (frontmatter) y el contenido en dos secciones abajo:

```markdown
---
id: nodo-8f3a
padre_id: nodo-2c11
rama: main        # "main" (sigue el tronco) | "branch-right" | "branch-left"
x: 420
y: 180
proveedor: claude
fecha: 2026-08-29T14:30:00
---

## Pregunta

¿Cómo divido el temario en semanas?

## Respuesta

<respuesta de la IA en markdown>
```

- Un **árbol completo** = una carpeta con todos sus nodos `.md` adentro.
- La relación padre-hijo (el `padre_id`) ya define las flechas — no hace falta una tabla/archivo aparte de "edges".
- `rama` indica de qué lado del padre sale la flecha: `main` para el tronco (sale por abajo del padre) y `branch-left` / `branch-right` para las ramas (salen por un costado). El usuario lo cambia arrastrando el globo.
- Las posiciones `x, y` se guardan porque el usuario los mueve a mano; solo se genera una posición automática sugerida cuando el nodo se crea por primera vez.
- El nodo **raíz** no tiene `padre_id`. Puede tener `## Pregunta` vacía si el árbol arranca de una consigna del sistema, o contener el primer intercambio real.

## 4. Algoritmo base (pseudocódigo)

```
FUNCION crear_nodo(padre_id, rama, pregunta, respuesta, x, y):
    nodo = { id: nuevo_id(), padre_id, rama, pregunta, respuesta, x, y, fecha: ahora() }
    guardar_como_md(nodo)
    RETORNAR nodo

FUNCION armar_contexto(nodo_actual):
    # Camino de intercambios desde la raíz hasta el nodo actual.
    camino = []
    nodo = nodo_actual
    MIENTRAS nodo != NULO:
        camino.insertar_al_principio(nodo)
        nodo = SI nodo.padre_id ENTONCES buscar_nodo(nodo.padre_id) SINO NULO
    # Aplanar cada intercambio a mensajes user/assistant para la API:
    mensajes = []
    PARA CADA intercambio EN camino:
        SI intercambio.pregunta NO vacía:
            mensajes.agregar({ rol: "user", texto: intercambio.pregunta })
        SI intercambio.respuesta NO vacía:
            mensajes.agregar({ rol: "assistant", texto: intercambio.respuesta })
    RETORNAR mensajes   # SOLO este camino, nunca el árbol entero

FUNCION enviar_pregunta(nodo_desde, texto_pregunta, rama):
    # rama: "main" para continuar el hilo, "branch-right"/"branch-left" para desviar.
    contexto = armar_contexto(nodo_desde)
    contexto_recortado = aplicar_ventana_y_resumen(contexto)  # ver sección 5
    nodo_nuevo = crear_nodo(padre_id: nodo_desde.id, rama, pregunta: texto_pregunta,
                            respuesta: NULO, ...)   # se ve como "respuesta pendiente"
    respuesta = llamar_ia(proveedor_activo, contexto_recortado + [{rol:"user", texto:texto_pregunta}])
    nodo_nuevo.respuesta = respuesta
    guardar_como_md(nodo_nuevo)
    RETORNAR nodo_nuevo

FUNCION ramificar(nodo_viejo, texto_pregunta):
    # Igual que enviar_pregunta pero partiendo de un nodo que no es el último
    # de la rama activa, y con rama = "branch-right" (el usuario después lo puede
    # arrastrar al lado izquierdo y pasa a "branch-left").
    RETORNAR enviar_pregunta(nodo_desde: nodo_viejo, texto_pregunta, rama: "branch-right")
```

Este es el esqueleto. Los "problemas a resolver" de las secciones siguientes son detalles que cuelgan de `aplicar_ventana_y_resumen` y de la interfaz.

## 5. Gestión de contexto y costos (tokens)

Para que el costo no crezca sin techo a medida que el árbol se hace grande:

1. **Ventana de contexto activa**: al mandar un mensaje nuevo, no se manda el camino completo siempre — se mandan los últimos N nodos completos + un resumen corto de lo más viejo de esa misma rama.
2. **Carga perezosa (lazy loading)**: el contexto completo de una rama vieja recién se reconstruye (leyendo la cadena de `.md`) cuando el usuario se para sobre un nodo de esa rama para ramificar desde ahí — no antes.
3. **Prompt caching del proveedor**: las APIs (Claude incluida) pueden cachear de su lado un tramo de contexto repetido entre llamadas y cobrar menos por esa parte en el siguiente mensaje. Aprovechar esto mandando el contexto de forma consistente (mismo prefijo) entre llamadas sucesivas de la misma rama.
4. **Embeddings locales para relevancia (recomendado, prioridad alta)**: en vez de que el usuario tenga que elegir a mano qué nodos viejos importan, calcular embeddings de cada nodo **en el navegador** (con una librería tipo `transformers.js`, WebAssembly, sin instalar nada) y usar búsqueda semántica para traer automáticamente solo los nodos viejos relevantes a la pregunta actual.

**Pendiente de decidir**: qué tan agresivo es el resumen de "lo viejo" del punto 1 — mucho resumen ahorra tokens pero puede perder matices importantes.

## 6. Multi-proveedor de IA

Arrancar con **un solo proveedor** (a elegir: DeepSeek o Claude Haiku por costo, para prototipar barato). Igual armar desde el día 1 una función `llamar_ia(mensajes)` que por dentro decide el proveedor — así sumar el segundo proveedor más adelante no obliga a reescribir la lógica del árbol, solo agregar una rama de código dentro de esa función.

## 7. Export, import y compartir

- Exportar un árbol = comprimir su carpeta de `.md` en un `.zip`.
- Importar = descomprimir y reconstruir el árbol leyendo el `padre_id` de cada archivo.
- Fase 1 (MVP): todo local, el usuario descarga/sube el `.zip` a mano.
- Fase 2 (si se suma backend): permitir subir el árbol a un storage (ej. Supabase Storage) para compartir por link, guardando los mismos archivos `.md` tal cual — el servidor solo los aloja, no cambia el formato.

## 8. Rendimiento visual (UI)

Separado del ahorro de tokens (sección 5) — esto es rendimiento del navegador, no costo de IA:

- Cada nodo tiene un estado `expandido: true/false`.
- Colapsado = se ve solo la pregunta (encabezado) como título del globo.
- Expandido = se ve la pregunta + la respuesta completa en markdown renderizado.
- Con muchos nodos en pantalla, solo se renderiza el detalle completo de los nodos visibles/expandidos — el resto queda liviano.

## 9. Autenticación

**Recomendado: sin login en el MVP.** Todo local-first:

- Los árboles se guardan como `.md` en la máquina del usuario.
- Cada usuario carga su propia clave de API, guardada solo en su navegador (nunca llega a un servidor de este proyecto).
- Sin cuentas, sin backend de autenticación, sin costo de API para el desarrollador (cada uno paga la suya).

**Login opcional, fase 2**: recién se justifica cuando se sume la función de compartir árboles por link (necesita saber de quién es cada árbol guardado en el servidor). Ahí sumar Supabase Auth como capa opcional encima — el que solo usa local nunca se loguea.

## 10. Modelos de IA locales (extra opcional, fase futura)

Usar un modelo chico corriendo en la PC del usuario (vía Ollama) para tareas internas (resumir, titular ramas) — **no** para las respuestas reales. Contras identificados que hacen que sea de baja prioridad:

- No funciona en celular (Ollama es de escritorio).
- Fricción de instalación → lo usa solo un porcentaje técnico de usuarios.
- Calidad inconsistente entre usuarios según qué modelo tengan instalado.
- Requiere configurar CORS en Ollama para que el navegador le hable (`OLLAMA_ORIGINS`).
- Consume batería/CPU del usuario.
- El ahorro real de tokens es chico comparado con las secciones 5 y 6, que además benefician al 100% de los usuarios.

Queda como función avanzada opcional, no como parte del núcleo.

## 11. Stack técnico recomendado

| Capa | Elección | Motivo |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript + Tailwind | Mismo stack que Legends Fitness, cero curva de aprendizaje nueva, refuerza portfolio |
| Canvas de nodos | React Flow (`@xyflow/react`) | Librería hecha para esto — arrastre libre, zoom/pan infinito, nodos custom. Es la misma familia de tecnología que usa n8n. |
| Embeddings locales | `transformers.js` (WebAssembly) | Corre en el navegador, sin instalación, mantiene el "cero instalación" del proyecto |
| Backend (fase 1) | Ninguno | Todo corre client-side; se puede alojar gratis en GitHub Pages |
| Backend (fase 2) | Supabase (Postgres + Auth + Storage) | Ya conocido de Legends Fitness, para compartir por link y sync entre dispositivos |
| Repositorio | GitHub, público | Portfolio + transparencia de que la clave de API nunca sale del navegador |
| Licencia | A definir (ver sección 12) | — |

## 12. Código abierto

- Repo público en GitHub desde ahora — no hay secretos que proteger en la fase 1 (sin backend).
- Nunca commitear claves ni `.env` — cuidado especial cuando se sume el backend de la fase 2.
- Licencia: evaluar modelo "open core" — el motor cliente (canvas, árbol, lógica de contexto) público con licencia permisiva (ej. MIT); si en el futuro se decide monetizar la parte de backend/cuentas/compartir, esa parte podría vivir en un repo aparte, privado.

## 13. Roadmap por fases

1. **Fase 1 — MVP local-first, sin login, sin backend.** Canvas con React Flow, un proveedor de IA, guardado/exportado en `.md`, ventana de contexto + resumen, embeddings locales para relevancia. Deploy gratis en GitHub Pages.
2. **Fase 2 — Compartir y sincronizar.** Backend con Supabase, login opcional, compartir árboles por link, multi-proveedor.
3. **Fase 3 — Extras avanzados.** Modelos locales tipo Ollama como opción para usuarios avanzados, mejoras de rendimiento adicionales.

## 14. Preguntas abiertas / pendientes

- ¿Abrir un globo muestra solo ese intercambio, o la transcripción entera de esa rama? (sección 2)
- ¿Qué tan agresivo debe ser el resumen de contexto viejo antes de perder calidad de respuesta? (sección 5)
- ¿Formato final de compartir: siempre `.zip` de carpeta, o también un `.md` único concatenado como opción rápida?
- Nombre definitivo del proyecto (hoy: "chat-arbol-ia", nombre de trabajo).

### Resueltas

- **Un globo = un intercambio (pregunta + respuesta), no un mensaje suelto.** 1 archivo `.md` por intercambio. Se decidió para que el árbol no crezca visualmente de más. (29-08-2026)
- **El tronco es siempre vertical; las ramas salen por un costado y se pueden pasar de derecha a izquierda arrastrando.** (29-08-2026)
