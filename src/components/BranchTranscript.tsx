"use client";

import { useEffect } from "react";

import Markdown from "./Markdown";
import type { Intercambio } from "@/model/intercambio";

// Panel lateral read-only: la rama raíz→globo aplanada a preguntas y respuestas,
// tipo chat normal. Es una vista derivada del árbol (no toca estado). Se abre
// con doble-click en un globo o con el botón ⤢ de su barra.
export default function BranchTranscript({
  intercambios,
  onClose,
}: {
  intercambios: Intercambio[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-20 flex justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-[460px] flex-col border-l border-white/15 bg-neutral-950 text-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <span className="font-medium text-white">
            Transcripción de la rama
            <span className="ml-2 text-xs font-normal text-white/40">
              {intercambios.length} interc.
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {intercambios.map((ic) => (
            <div key={ic.id} className="space-y-1.5">
              {ic.pregunta && (
                <div className="rounded-md bg-white/10 px-3 py-2 text-white">
                  {ic.pregunta}
                </div>
              )}
              <div className="px-1">
                {ic.error ? (
                  <p className="whitespace-pre-wrap text-xs text-red-300">
                    ⚠ {ic.error}
                  </p>
                ) : ic.respuesta ? (
                  <div className="text-white/90">
                    <Markdown>{ic.respuesta}</Markdown>
                  </div>
                ) : ic.pending ? (
                  <p className="italic text-white/40">escribiendo…</p>
                ) : (
                  <p className="italic text-white/40">Respuesta pendiente</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
