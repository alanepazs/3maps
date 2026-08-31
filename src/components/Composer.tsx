"use client";

import { useState, type KeyboardEvent } from "react";

export type BranchKind = "main" | "branch";

type Props = {
  // Pregunta del intercambio activo (desde el que se continúa / ramifica).
  activeNodeLabel: string | null;
  // El árbol no tiene ningún globo → el primer submit crea la raíz.
  arbolVacio: boolean;
  // Crea un globo nuevo (intercambio) colgando del nodo activo. "main" = continúa
  // el hilo hacia abajo, "branch" = abre una rama al costado.
  onSubmit: (text: string, kind: BranchKind) => void;
  // El usuario escondió la barra (se persiste en Settings). Escondida = solo se
  // ve un botón grande "✎ Escribir" abajo.
  oculto: boolean;
  onToggleOculto: () => void;
};

// Barra inferior fija para escribir. Se puede esconder hacia abajo (fase 3.13):
// al esconderse queda un botón grande centrado para traerla de vuelta.
export default function Composer({
  activeNodeLabel,
  arbolVacio,
  onSubmit,
  oculto,
  onToggleOculto,
}: Props) {
  const [text, setText] = useState("");
  const canSend =
    (arbolVacio || activeNodeLabel !== null) && text.trim() !== "";

  const submit = (kind: BranchKind) => {
    if (!canSend) return;
    onSubmit(text.trim(), kind);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    // Ctrl/Cmd+Enter = ramifica. Enter solo = continúa el hilo.
    e.preventDefault();
    submit(e.ctrlKey || e.metaKey ? "branch" : "main");
  };

  return (
    <>
      {/* Botón para volver a mostrar la barra — grande, no un ícono chico. */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-4 transition-opacity duration-200 ${
          oculto ? "opacity-100" : "opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={onToggleOculto}
          aria-hidden={!oculto}
          tabIndex={oculto ? 0 : -1}
          className={`flex items-center gap-2 rounded-full border border-white/15 bg-neutral-900/95 px-6 py-3 text-sm font-medium text-white shadow-xl backdrop-blur transition-colors hover:bg-white/10 ${
            oculto ? "pointer-events-auto" : "pointer-events-none"
          }`}
        >
          ✎ Escribir
        </button>
      </div>

      {/* La barra. Al esconderse baja y se desvanece; el botón "✎ Escribir"
          queda en su lugar. */}
      <div
        style={{ translate: oculto ? "0 1.5rem" : undefined }}
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-4 transition-[opacity,translate] duration-200 ${
          oculto ? "opacity-0" : "opacity-100"
        }`}
        aria-hidden={oculto}
      >
        <div
          className={`w-full max-w-2xl rounded-lg border border-white/15 bg-neutral-900/95 p-3 shadow-xl backdrop-blur ${
            oculto ? "pointer-events-none" : "pointer-events-auto"
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="truncate text-xs text-white/50">
              {arbolVacio
                ? "Escribí tu primera pregunta para empezar el árbol"
                : activeNodeLabel
                  ? `Desde: ${activeNodeLabel}`
                  : "Seleccioná un globo del canvas para escribir desde ahí"}
            </p>
            <button
              type="button"
              onClick={onToggleOculto}
              tabIndex={oculto ? -1 : 0}
              title="Esconder el chat"
              aria-label="Esconder el chat"
              className="shrink-0 rounded px-2 py-0.5 text-white/40 hover:bg-white/10 hover:text-white/80"
            >
              ⌄
            </button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder="Escribí tu pregunta…"
            className="w-full resize-none rounded-md border border-white/15 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-sky-400 focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-white/30">
              Enter continúa · Ctrl+Enter ramifica · Shift+Enter salto de línea
            </span>
            <div className="flex gap-2">
              {!arbolVacio && (
                <button
                  type="button"
                  disabled={!canSend}
                  onClick={() => submit("branch")}
                  className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-white/90 enabled:hover:bg-white/10 disabled:opacity-40"
                >
                  ⑂ Ramificar
                </button>
              )}
              <button
                type="button"
                disabled={!canSend}
                onClick={() => submit("main")}
                className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white enabled:hover:bg-sky-400 disabled:opacity-40"
              >
                {arbolVacio ? "Empezar" : "↓ Continuar hilo"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
