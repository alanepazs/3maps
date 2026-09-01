# T16 — Adjuntar archivos al mini-composer del panel

> Spec. Estado: **decisiones cerradas con Alan (02-09), lista para implementar**.
> Alcance: (1) texto + imágenes + PDF; (2) el adjunto vive en el `.md` del intercambio;
> (3) solo el mini-composer del panel lateral (`BranchTranscript`), no la barra `Composer`.
> Detalle (02-09): (1) **el texto de la pregunta es obligatorio** aunque haya adjunto
> (ej. "explicá"); (2) tipo no soportado → **rechazar + listar los tipos que sí admite**;
> (3) indicador de adjuntos **en ambos** — globo del canvas y panel; (5) orden de sub-tareas:
> **texto → imágenes → PDF**. Límite por adjunto: **ver "Límites" abajo** (pendiente el número
> final de Alan).

## Problema

Hoy solo se le puede mandar texto tipeado a la IA. Casos reales de Alan: "resumime este `.md`",
"explicame este código", "¿qué dice este PDF?", "¿qué hay en esta captura?". Copiar y pegar
texto largo en el textarea es incómodo y para imágenes/PDF no sirve.

## Qué se construye

Arrastrar (o pegar, o elegir con un botón) uno o más archivos **sobre el mini-composer del panel
lateral**. Quedan como "chips" adjuntos a la próxima pregunta. Al enviar, se guardan en el `.md`
del intercambio nuevo y se mandan a la IA junto con la pregunta.

**No** toca la barra `Composer` de abajo (decisión de alcance). **No** hay adjuntos "de árbol" ni
"de sesión": cada adjunto pertenece a **un** intercambio.

## Modelo de datos

### `Adjunto` (nuevo, en `intercambio.ts`)

```ts
export type TipoAdjunto = "texto" | "imagen" | "pdf";

export type Adjunto = {
  nombre: string;        // "notas.md", "captura.png" — para mostrar y como filename
  tipo: TipoAdjunto;
  mime: string;          // "text/markdown", "image/png", "application/pdf"
  // tipo "texto": el contenido del archivo tal cual (UTF-8).
  // tipo "imagen" | "pdf": base64 SIN el prefijo `data:...;base64,` y SIN saltos de línea.
  contenido: string;
};
```

`Intercambio` gana **un** campo:

```ts
adjuntos: Adjunto[];   // [] = sin adjuntos (la mayoría de los intercambios)
```

`crearIntercambio` acepta `adjuntos?: Adjunto[]` (default `[]`).

### Serialización `.md`

Los adjuntos van en el **frontmatter**, en una línea, como JSON — mismo patrón que `error`
(decisiones §1). Los tres tipos de `contenido` (texto escapado, base64) no tienen saltos de
línea reales tras `JSON.stringify`, así que la línea `adjuntos: [...]` no rompe el parser
mínimo de frontmatter (`key: value` por línea).

```
---
id: nodo-abc
...
adjuntos: [{"nombre":"notas.md","tipo":"texto","mime":"text/markdown","contenido":"# Título\n..."}]
---
```

- `toMarkdown`: `adjuntos: ${ic.adjuntos.length ? JSON.stringify(ic.adjuntos) : ""}`.
- `parseMarkdown`: `adjuntos: meta.adjuntos ? (JSON.parse(meta.adjuntos) con validación) : []`.
  Si el JSON está roto o un item no valida → `[]` (no romper la carga del árbol). Un `.md`
  viejo sin la línea → `[]`.
- **Round-trip** obligatorio (scratch): `.md` con 0, 1 y N adjuntos de cada tipo.

### Límites actuales de 3maps (para calibrar los topes de adjuntos)

| Qué | Límite hoy | Dónde |
|---|---|---|
| Compartir — nº de globos | 50 | `MAX_INTERCAMBIOS_COMPARTIR` |
| Compartir — peso total del árbol (JSON) | **~1 MB** (`1_000_000` chars) | `MAX_BYTES_COMPARTIR` |
| Bucket `arboles` (compartir) — por archivo | 2 MB, solo `application/json` | `schema.sql` |
| Bucket `sync` (sync entre dispositivos) — por archivo (= **todo el mapa**) | **5 MB**, solo `application/json` | `schema.sql` |
| `localStorage` (persistencia local) — por origen | ~5-10 MB (cuota del navegador; `guardarArbol` ignora el fallo **en silencio**) | navegador |
| Render de una respuesta | 60k chars | `Markdown.tsx sanitizarCrudo` |
| `max_tokens` de salida | 4096 (Claude/proxy) · 8192 (Gemini) · 2048 (resumen) | `ia.ts` |
| Ventana de contexto | últimos 6 intercambios + resumen | `settings.ventanaContexto` |
| **Peso de un intercambio individual** | **ninguno hoy** | — |

**El límite que aprieta**: el mapa entero sincroniza como **un** JSON ≤ 5 MB. Todo lo que se
adjunte compite con eso. Compartir es más estricto todavía (~1 MB el árbol entero).

### Mitigación (parte de la spec)

- **Compresión de imágenes en el cliente** antes de guardar: si es `image/*` y pesa > ~400 KB,
  recomprimir a JPEG calidad ~0.8, máx 1568px de lado (el máximo útil para la visión de
  Claude/Gemini). PNG con transparencia → mantener PNG. Un `<canvas>` alcanza, sin librería.
- **Topes por adjunto / por intercambio**: número final pendiente de Alan (ver "Preguntas
  abiertas"). Rango propuesto: imagen/PDF **1-1.5 MB** post-compresión, texto **128-256 KB**,
  total por intercambio **2-3 MB**.
- **Al pasar `localStorage`**: `guardarArbol` hoy traga el error. Con adjuntos hay que
  **detectar el `QuotaExceededError` y avisar** ("no se pudo guardar: el mapa + los archivos
  superan lo que el navegador permite").
- **Compartir**: si el árbol con adjuntos supera `MAX_BYTES_COMPARTIR` → el error de
  `compartirArbol` lo dice explícito ("sacá los archivos adjuntos o son muy pesados").
  **No** se suben adjuntos recortados. (Futuro: subir imágenes como objetos aparte en el
  bucket — fuera de alcance de T16.)
- **Sync**: si un mapa con adjuntos supera 5 MB, el push a Storage falla (política del bucket).
  `subirArbolNube` tiene que reportarlo, no fallar en silencio.
- Avisar en la UI cuando un adjunto se rechaza por tamaño, listando el tope.

## Contexto para la IA (`contexto.ts` + `ia.ts`)

### Regla: los adjuntos van SOLO en el turno del intercambio al que pertenecen

Cuando el intercambio con adjuntos es **la pregunta actual** (se está respondiendo), sus adjuntos
se mandan. Cuando ese mismo intercambio aparece **más arriba en el camino** como contexto de un
hijo, se manda **solo su texto** (pregunta + respuesta), nunca de nuevo la imagen/PDF.

Motivo: costo de tokens y de ancho de banda. Una imagen re-enviada en cada pregunta de la rama
sería carísimo y rompería el prompt caching.

### `Mensaje` (en `contexto.ts`)

```ts
export type Mensaje = { rol: Rol; texto: string; adjuntos?: Adjunto[] };
```

`armarContexto`: después de armar los mensajes, si el intercambio `actual` (el último del camino)
tiene `adjuntos`, se los cuelga al **último mensaje `user`** (que es su pregunta). `aplanar` y el
resto no cambian. Los intercambios viejos nunca copian `adjuntos` al `Mensaje`.

`estimarTokens` (T10): un adjunto de texto suma `contenido.length / 4`; una imagen suma un fijo
aproximado (~= `mime` de imagen → 1200 tokens, heurística grosera de Claude/Gemini); PDF →
`~1500 × páginas` si se conoce, si no un fijo. Es estimación, no hace falta precisión.

### `ia.ts` — mapeo por proveedor

`Mensaje.adjuntos` se traduce distinto en cada adaptador. **El bloque de imagen/documento va
ANTES del texto** en los tres.

| Proveedor | Imagen | PDF | Notas |
|---|---|---|---|
| **Claude** (`llamarClaude`) | `{type:"image", source:{type:"base64", media_type, data}}` | `{type:"document", source:{type:"base64", media_type:"application/pdf", data}}` | `content` pasa de `string` a `(TextBlock\|ImageBlock\|DocumentBlock)[]`. Sin beta header. Límite PDF: 100 págs en modelos de 200k (Haiku 4.5, el default). Todos los modelos Claude actuales tienen visión. |
| **Gemini** (`intentarGemini`) | `parts: [{inline_data:{mime_type, data}}, {text}]` | igual, `mime_type:"application/pdf"` | Todos los Gemini (flash incluido) aceptan imagen y PDF nativo, **gratis en free tier**. Límite inline ~20 MB por request; con nuestro tope de 3 MB/intercambio no llegamos. |
| **OpenAI-compat** (`llamarOpenAICompat`) | `content: [{type:"image_url", image_url:{url:"data:<mime>;base64,<data>"}}, {type:"text", text}]` | **no** (la mayoría de modelos abiertos no; OpenAI `type:"file"` no está garantizado vía proxy) | Solo funciona en modelos con visión (Groq llama-4/3.2-vision, algunos de OpenRouter; HF casi ninguno). **No podemos saber de antemano** qué modelo la soporta → se intenta y si el proveedor devuelve 400/415 se muestra su error. |

**Sub-regla PDF**: si un intercambio tiene un adjunto `pdf` y el proveedor activo **no** es
`gemini` ni `claude` → al enviar, avisar ("los PDF solo andan con Gemini —gratis— o Claude; con
{proveedor} se va a ignorar / probablemente falle"). No bloquear (Alan puede querer intentar),
pero que sepa. El texto de la pregunta sí se manda.

## UI — `BranchTranscript` (mini-composer)

### Zona de drop

El **área del mini-composer al pie** (el `<div>` que contiene el textarea) es la dropzone.
`onDragOver` (preventDefault + estado `arrastrando`), `onDragLeave`, `onDrop`. Mientras
`arrastrando`: borde punteado + "Soltá los archivos acá".

También:
- **Pegar** (`onPaste` en el textarea): si el clipboard trae `items` de tipo `file` (típico:
  captura de pantalla) → adjuntar.
- **Botón 📎** al lado del textarea → `<input type="file" multiple hidden>` con `accept` de los
  tipos soportados.

### Tipos aceptados

- **texto**: `text/*`, y por extensión `.md .txt .csv .json .ts .tsx .js .jsx .py .html .css .yml
  .yaml .toml .sh .rs .go .java .rb .sql` (mapear a `tipo:"texto"`, `mime` real o `text/plain`).
- **imagen**: `image/png`, `image/jpeg`, `image/webp`. **GIF → rechazar** (decisión de Alan;
  no vale la pena el primer-frame).
- **pdf**: `application/pdf`.
- Otro tipo → **rechazar con un aviso que lista los tipos admitidos**: "No puedo adjuntar
  `{nombre}` ({mime}). Acepto: texto (.md, .txt, .csv, .json, código), imágenes (PNG, JPEG,
  WebP) y PDF."

### Chips de adjuntos

Fila arriba del textarea, uno por adjunto: `📄 notas.md · 12 KB ✕` / `🖼 captura.png · 340 KB ✕` /
`📕 informe.pdf · 800 KB ✕`. La `✕` lo quita. Si hay un `pdf` y el proveedor no es gemini/claude,
el chip del PDF va en ámbar con el aviso al hover.

### Envío

`onSubmit` pasa de `(text, kind)` a `(text, kind, adjuntos: Adjunto[])`. **El texto de la
pregunta es obligatorio** aunque haya adjuntos (decisión de Alan): el botón queda deshabilitado
si `text.trim() === ""`, con adjuntos o sin ellos. El placeholder cambia cuando hay adjuntos:
"Escribí qué hago con el archivo (ej: 'explicá', 'resumí')…". Tras enviar, los chips se limpian.

`responderDesdePanel(text, kind, adjuntos)` → `handleSubmit(text, kind, transcriptNodeId,
adjuntos)` → `crearIntercambio({ ..., adjuntos })`.

### Mostrar los adjuntos de un intercambio ya creado

En el turno "Vos" del panel (`BranchTranscript`), bajo la pregunta, los mismos chips en modo
lectura (sin `✕`). Imagen → thumbnail clickeable (abre en tamaño completo en un overlay o nueva
pestaña con `URL.createObjectURL`). PDF/texto → chip con nombre; click descarga (`Blob` +
`<a download>`). **No** se re-renderiza el contenido del texto adjunto inline (puede ser enorme).

`MessageNode` (el globo del canvas): indicador chico **"📎 N"** en el header si el intercambio
tiene adjuntos (decisión de Alan: sí, en ambos lados). Sin thumbnails en el canvas (ruido) —
solo el contador. Al abrir el panel se ven los chips/thumbnails completos.

## Retry / Rehacer

`retryNode` / "↻ Rehacer" vuelve a llamar `responder(id)`. Como los adjuntos están en el
`Intercambio` (en el `.md`), `armarContexto` los re-adjunta solo. **Nada que hacer** — pero
verificar que el retry de un intercambio con imagen efectivamente la re-manda.

## Modo compartido / read-only

Un árbol compartido (`?compartir=`) es de otro. Si tiene adjuntos (y entró bajo el tope), se
**muestran** (thumbnails, descarga) pero el mini-composer no existe en read-only, así que no se
pueden agregar. Sin cambios extra.

## Fuera de alcance (T16)

- Adjuntos en la barra `Composer` de abajo.
- Subir imágenes a Storage como objetos aparte (para compartir árboles pesados).
- Files API de Claude / Gemini (subir una vez, referenciar por id) — para archivos > tope.
- OCR / extracción de texto de PDF en el cliente para los proveedores sin soporte nativo.
- Audio / video.
- Re-mandar un adjunto en turnos posteriores de la rama.

## Sub-tareas (implementación incremental)

**T16a — Texto, punta a punta. ✅ HECHO (02-09, decisiones F3-22).**
`Adjunto` + `Intercambio.adjuntos` + `.md` (frontmatter JSON 1 línea) + `Mensaje.adjuntos`
(imagen/pdf) + `armarContexto` pega el texto adjunto a la pregunta actual (NO se re-manda a los
hijos) + `src/model/adjuntos.ts` (`tipoDeArchivo`/`leerArchivo`/topes/`fmtBytes`/`iconoAdjunto`/
`descargarAdjunto`). UI: dropzone + `onPaste` + botón 📎 + chips con ✕ + aviso ámbar, solo texto
en T16a. Badge "📎 N" en el globo (`arbolAVista` → `MessageNode`). Chip lectura en el turno "Vos".
`compartir.ts`: error que menciona los adjuntos si el árbol pesa de más.
25 asserts scratch + verificado en el pane. `tsc`/`lint`/`build` verde.
**Los adaptadores de `ia.ts` NO se tocaron** — el texto adjunto se pega dentro del `Mensaje.texto`
en `armarContexto`; `Mensaje.adjuntos` (imagen/pdf) recién lo consumen los adaptadores en T16b/c.

**T16b — Imágenes. ✅ HECHO (02-09, decisiones F3-22b).**
`comprimirImagen` (`<canvas>` sin librería, 1568px, JPEG q0.82/0.6 salvo PNG con transparencia).
`imagenesDe(m)` + mapeo por adaptador en `ia.ts` (Claude `image` / Gemini `inline_data` /
OpenAI-compat `image_url`). `estimarTokens` +1300/imagen. `accept` ampliado; chips y turno "Vos"
con thumbnail; lightbox `verImagen`. `mensajeError*` sugiere Gemini/Claude en un 400 con imágenes.
`eslint.config.mjs` apaga `no-img-element`. 13 asserts + pane. Falta prueba de Alan con keys.

**T16c — PDF. ✅ HECHO (02-09, decisiones F3-22c).**
`leerArchivo` acepta PDF (base64, tope 1MB). `multimediaDe(m)` en Claude (`document` block) y
Gemini (`inline_data` application/pdf); OpenAI-compat NO manda el PDF (solo texto). Aviso ámbar
"PDF solo Gemini/Claude" via props `proveedorLeePdf`/`proveedorNombre` (no bloquea). `estimarTokens`
+3000/pdf. Chip 📕 + descarga (ya andaba de T16a). 11 asserts + pane. **T16 completo.**

## Criterios de aceptación (globales)

- [ ] Soltar un `.md`/`.txt` en el mini-composer → aparece un chip; al enviar, la IA claramente
      "ve" el contenido (probar con "¿qué dice el archivo?").
- [ ] Soltar una imagen → chip con thumbnail; con Gemini, la IA la describe bien.
- [ ] Soltar un PDF con Gemini → la IA lo lee. Con Groq/OpenRouter → aviso claro, no un crash.
- [ ] El `.md` del intercambio guarda los adjuntos; recargar la página los conserva; el turno
      "Vos" del panel los muestra.
- [ ] Un adjunto > tope → rechazado con aviso, no se guarda a medias.
- [ ] `tsc` + `lint` + `build` verde. Scratch: round-trip `.md` + `armarContexto` con adjuntos.
- [ ] Un árbol viejo (sin `adjuntos:` en el `.md`) carga igual.
- [ ] Compartir un árbol con un adjunto pesado → error claro, no un 413 silencioso.

## Preguntas abiertas para Alan

1. ✅ Texto de la pregunta **obligatorio** aunque haya adjunto.
2. ✅ GIF → **rechazar**; el aviso lista los tipos admitidos.
3. ✅ Indicador de adjuntos **en ambos** (globo del canvas "📎 N" + chips en el panel).
4. **Topes por adjunto — pendiente.** Ver la tabla "Límites actuales". Mi recomendación:
   - imagen/PDF **≤ 1 MB** ya comprimido · texto **≤ 128 KB** · total por intercambio **≤ 2 MB**.
   - Deja margen para ~3-4 globos con imagen en un mapa antes de rozar el tope de sync (5 MB).
   - Un mapa con adjuntos **no se va a poder compartir** casi nunca (tope ~1 MB) — es
     esperable; el error lo dice.
5. ✅ Orden: **texto (T16a) → imágenes (T16b) → PDF (T16c)**.
