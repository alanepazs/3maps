# T15 — Respuestas que son un documento entero

> Spec. Estado: **✅ HECHO (02-09, decisiones F3-23)**. 14 asserts + verificado en el pane.
> Alcance: **solo el núcleo** (1 + 2), sin doc card. Nombre de archivo: **heurística**.
> Botones "copiar/guardar respuesta": **solo en el panel** (`BranchTranscript`), el `NodeToolbar`
> del globo queda como está. `systemPrompt`: **no se toca**.
> El botón "copiar por bloque" (punto 2) también queda gateado al panel (prop `conCopiar` en
> `<Markdown>`) para no ensuciar el globo del canvas.

## Problema

Alan le pidió a un globo "escribime un README.md para X". El modelo devolvió el markdown como
**cuerpo de la respuesta, en crudo** (sin fence). El globo lo renderiza como markdown *renderizado*
(títulos grandes, listas con viñetas…), así que:

- No hay forma fácil de **copiar el `.md` fuente** (lo que se ve es el render, no el texto).
- Si el modelo sí lo pone en un ```` ```markdown ```` / ```` ```css ````, se ve como bloque de
  código con scroll horizontal — un archivo de 150 líneas en un globo de 260px es ilegible.
- El globo colapsa a los 400 chars (F3-1) con "ver más" → un documento largo queda escondido.
- No hay "copiar" ni "descargar" en ningún lado.

Lo que Alan quiere: **sacar el documento** — al portapapeles o como archivo.

## Alcance propuesto (para confirmar)

### Núcleo (lo que se hace)

1. **"⧉ Copiar" + "⬇ Guardar" de la respuesta**, en `BranchTranscript`, en el turno de la IA del
   **globo abierto** (el último del camino), junto a "↻ Rehacer". Operan sobre el string
   `respuesta` crudo (lo que está en el `.md`), no sobre el render. Solo si hay `respuesta` y no
   está `pending`. **NO** van en el `NodeToolbar` del globo.
2. **"⧉ Copiar" por bloque de código** en `Markdown.tsx`: con la prop `conCopiar` (la pasa
   `BranchTranscript`, NO `MessageNode`), cada ```` ``` ```` renderizado tiene un botón chico
   arriba a la derecha (hover) que copia **ese** bloque en crudo.

### Descartado (por ahora)

3. **"Doc card"** (tarjeta compacta cuando la respuesta ES un documento). Alan: núcleo ahora,
   doc card después si el núcleo no alcanza.

## Detalle del núcleo

### Guardar: heurística de nombre y extensión

`nombreYExtensionDe(respuesta): { nombre: string; contenido: string; mime: string }`

- **Si toda la respuesta es un solo fence** ```` ```lang … ``` ````: `contenido` = el interior del
  fence (sin las ``` ```); extensión de `lang` (`ts`, `css`, `py`, `md`, `json`, `sh`, `html`…,
  fallback `txt`); `mime` acorde.
- **Si no es un fence pero parece markdown** (tiene `# ` al principio de línea, o `- ` / `1. `
  listas, o `**bold**`): `.md`, `text/markdown`.
- **Si no**: `.txt`, `text/plain`.
- **Nombre base**: slug del primer `# Título` (`readme-de-x`), o `respuesta` si no hay heading.
- Ejemplos: `readme.md`, `estilos.css`, `respuesta.md`, `script.py`.

`descargarTexto(nombre, contenido, mime)` — helper nuevo (o en `adjuntos.ts`, ya tiene
`descargarAdjunto` con el mismo patrón `Blob` + `<a download>`).

### Copiar

`navigator.clipboard.writeText(texto)` — anda en https (Pages) y localhost. Feedback: el botón
muestra "✓ Copiado" 1.5s. Sin fallback para navegadores viejos (best-effort).

### Qué NO se toca

- **El `systemPrompt` por defecto queda en `""`.** No se hardcodea una instrucción tipo
  "devolvé los documentos en un fence" — pelea con el prompt propio del usuario y los modelos la
  ignoran igual. (Si más adelante se quiere, va como *preset* elegible en ⚙️, fuera de T15.)
- El colapso de F3-1 / el `modoStream` de F3-15 — siguen igual.
- El `.md` del intercambio — la respuesta se guarda como hoy.

## Archivos

- `src/model/exportar.ts` (nuevo) — `nombreArchivoRespuesta(respuesta)` (pura) + `descargarTexto`.
- `src/components/Markdown.tsx` — prop `conCopiar?`; `BotonCopiarBloque` + `extraerTextoCodigo(node)`.
- `src/components/BranchTranscript.tsx` — 2 botones en el turno IA del último globo + `conCopiar`
  a su `<Markdown>`.
- `MessageNode.tsx` y `FlowCanvas.tsx`: **no se tocan**.

## Verificación

- `_scratch.mts`: `nombreArchivoRespuesta` con ~8 casos (fence `ts`/`css`/`md`, markdown sin
  fence, texto plano, con/sin `# Título`).
- `tsc` + `lint` + `build` verde.
- Pane: una respuesta larga inyectada → el botón "⬇ Guardar" produce el archivo con el nombre
  correcto (chequear via el `<a download>` / `Blob`); "⧉ Copiar" (chequear `navigator.clipboard`
  stub); botón copiar por bloque.
- Alan en Brave: copiar/pegar de verdad, descargar de verdad.

## Boundaries

- **Siempre**: operar sobre el `respuesta` crudo, no el DOM renderizado. `tsc`/`lint`/`build`
  verde. Feedback visible en el botón copiar.
- **Preguntar primero**: tocar el `systemPrompt` por defecto; agregar la doc card (opción 3);
  cualquier dependencia nueva (no hace falta ninguna).
- **Nunca**: cambiar cómo se guarda la respuesta en el `.md`; romper el colapso / streaming
  actual; meter un editor de markdown.

## Success criteria

- [ ] Desde un globo con una respuesta que es un `.md`, "⬇ Guardar" baja un `.md` con el texto
      **fuente** (no el render) y un nombre razonable.
- [ ] "⧉ Copiar" pone el texto fuente en el portapapeles, con feedback "✓ Copiado".
- [ ] Un bloque ```` ```css ```` largo tiene su propio botón "copiar" que copia solo ese bloque.
- [ ] Los botones aparecen en el globo del canvas Y en el panel; solo con respuesta y sin `pending`.
- [ ] (Si se aprueba la opción 3) una respuesta que es un solo fence se muestra como doc card
      compacta, no como bloque gigante.
- [ ] `tsc` + `lint` + `build` verde; scratch de la heurística de nombre.

## Decisiones (Alan, 02-09)

1. **Solo el núcleo** (1 + 2). Doc card descartada por ahora.
2. **Heurística** para el nombre del archivo.
3. **Solo el panel** — nada en el `NodeToolbar` del globo. El botón "copiar por bloque" también
   se gatea al panel (prop `conCopiar`).
4. **`systemPrompt` no se toca.**
