"use client";

import { useState } from "react";

import Markdown from "./Markdown";

// Tarjeta compacta para una respuesta que ES un documento — un solo bloque de
// código, sin texto alrededor (T15 "doc card"). Evita volcar 200 líneas inline.
// Detección: `docDeRespuesta` (model/exportar.ts).
// - `compacto` (en el globo del canvas): solo el encabezado, sin desplegar — el
//   globo es un overview, se abre el panel para leer.
// - sin `compacto` (en el panel): encabezado + cuerpo desplegable.
export default function DocCard({
  nombre,
  lang,
  lineas,
  textoCrudo,
  compacto = false,
}: {
  nombre: string;
  lang: string;
  lineas: number;
  textoCrudo: string;
  compacto?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);

  const encabezado = (
    <div className="flex items-center gap-2 px-3 py-2 text-left">
      <span aria-hidden>📄</span>
      <span className="truncate font-mono text-xs text-white/90">{nombre}</span>
      <span className="shrink-0 text-[11px] text-white/40">
        {lineas} línea{lineas === 1 ? "" : "s"}
        {lang ? ` · ${lang}` : ""}
      </span>
      {!compacto && (
        <span className="ml-auto shrink-0 text-[11px] text-white/40">
          {abierto ? "▾ ocultar" : "▸ ver"}
        </span>
      )}
    </div>
  );

  return (
    <div className="rounded-md border border-white/15 bg-white/[0.03]">
      {compacto ? (
        encabezado
      ) : (
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          className="block w-full hover:bg-white/[0.03]"
        >
          {encabezado}
        </button>
      )}
      {abierto && !compacto && (
        <div className="border-t border-white/10 px-3 py-2">
          <Markdown conCopiar>{textoCrudo}</Markdown>
        </div>
      )}
    </div>
  );
}
