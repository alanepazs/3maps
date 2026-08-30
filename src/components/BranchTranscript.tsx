"use client";

import { useEffect, useRef, useState } from "react";

import Markdown from "./Markdown";
import type { Intercambio } from "@/model/intercambio";

// Panel lateral read-only: el camino raíz→globo aplanado a preguntas y
// respuestas, tipo chat normal. Es una vista derivada del árbol (no toca
// estado). Se abre con doble-click en un globo o con el botón ⤢ de su barra. El
// lado (izq/der) lo elige el usuario con el botón ⇄ y se persiste en Settings.
//
// Si recibe `onSubmit` (no en modo compartido), muestra un mini-composer al pie
// para seguir la conversación sin cerrar el panel (fase 3.9): crea un hijo del
// último globo del camino y el panel se mueve a ese hijo.
export default function BranchTranscript({
  intercambios,
  side,
  onFlipSide,
  onClose,
  onSubmit,
}: {
  intercambios: Intercambio[];
  side: "left" | "right";
  onFlipSide: () => void;
  onClose: () => void;
  onSubmit?: (text: string) => void;
}) {
  const [borrador, setBorrador] = useState("");
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Bajar al último intercambio cuando llega uno nuevo (o crece el path).
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [intercambios.length]);

  const enviar = () => {
    const t = borrador.trim();
    if (!t || !onSubmit) return;
    onSubmit(t);
    setBorrador("");
  };

  return (
    <div
      className={`absolute inset-0 z-20 flex bg-black/40 ${
        side === "left" ? "justify-start" : "justify-end"
      }`}
      onClick={onClose}
    >
      <div
        className={`flex h-full w-full max-w-[460px] flex-col bg-neutral-950 text-sm shadow-2xl ${
          side === "left" ? "border-r border-white/15" : "border-l border-white/15"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <span className="font-medium text-white">
            Conversación hasta este globo
            <span className="ml-2 text-xs font-normal text-white/40">
              {intercambios.length} interc.
            </span>
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onFlipSide}
              className="rounded px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white"
              aria-label={side === "left" ? "Mover a la derecha" : "Mover a la izquierda"}
              title={side === "left" ? "Mover a la derecha" : "Mover a la izquierda"}
            >
              ⇄
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
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
          <div ref={finRef} />
        </div>

        {onSubmit && (
          <div className="border-t border-white/10 p-3">
            <textarea
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              rows={2}
              placeholder="Seguí la conversación desde este globo…"
              className="w-full resize-none rounded-md border border-white/15 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-sky-400 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-white/30">Enter para enviar</span>
              <button
                type="button"
                onClick={enviar}
                disabled={borrador.trim() === ""}
                className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white enabled:hover:bg-sky-400 disabled:opacity-40"
              >
                ↓ Enviar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
