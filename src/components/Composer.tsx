"use client";

import { useState, type KeyboardEvent } from "react";

export type BranchKind = "main" | "branch";

type Props = {
  // Pregunta del intercambio activo (desde el que se continúa / ramifica).
  activeNodeLabel: string | null;
  // Crea un globo nuevo (intercambio) colgando del nodo activo. Todavía sin
  // llamada real a la IA. "main" = continúa el hilo hacia abajo, "branch" =
  // abre una rama al costado.
  onSubmit: (text: string, kind: BranchKind) => void;
};

// Barra inferior fija para escribir.
export default function Composer({ activeNodeLabel, onSubmit }: Props) {
  const [text, setText] = useState("");
  const canSend = activeNodeLabel !== null && text.trim() !== "";

  const submit = (kind: BranchKind) => {
    if (!canSend) return;
    onSubmit(text.trim(), kind);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter envía (continúa el hilo). Shift+Enter = salto de línea.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit("main");
    }
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-4">
      <div className="pointer-events-auto w-full max-w-2xl rounded-lg border border-white/15 bg-neutral-900/95 p-3 shadow-xl backdrop-blur">
        <p className="mb-2 truncate text-xs text-white/50">
          {activeNodeLabel
            ? `Desde: ${activeNodeLabel}`
            : "Seleccioná un globo del canvas para escribir desde ahí"}
        </p>
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
            Enter para enviar · Shift+Enter para salto de línea
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canSend}
              onClick={() => submit("branch")}
              className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-white/90 enabled:hover:bg-white/10 disabled:opacity-40"
            >
              ⑂ Ramificar
            </button>
            <button
              type="button"
              disabled={!canSend}
              onClick={() => submit("main")}
              className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white enabled:hover:bg-sky-400 disabled:opacity-40"
            >
              ↓ Continuar hilo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
