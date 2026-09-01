"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { BranchKind } from "./Composer";
import Markdown from "./Markdown";
import { ANCHO_PANEL_MAX_FRAC, ANCHO_PANEL_MIN } from "./settings";
import { NOMBRE_PROVEEDOR } from "@/model/ia";
import type { Intercambio } from "@/model/intercambio";

// Panel lateral read-only: el camino raíz→globo aplanado a preguntas y
// respuestas, tipo chat normal. Es una vista derivada del árbol (no toca
// estado). Se abre con doble-click en un globo o con el botón ⤢ de su barra. El
// lado (izq/der) lo elige el usuario con el botón ⇄ y se persiste en Settings.
//
// Si recibe `onSubmit` (no en modo compartido), muestra un mini-composer al pie
// para seguir la conversación sin cerrar el panel (fase 3.9): crea un hijo del
// último globo del camino y el panel se mueve a ese hijo. Enter continúa el
// hilo, Ctrl/Cmd+Enter abre una rama (fase 3.12).
//
// Ancho (fase 3.11): en desktop se arrastra el borde interno (`onResize` con el
// ancho ya clampeado por el padre en `width`). En móvil (`resizable === false`)
// va a pantalla completa y el header muestra un botón "🗺 Mapa" para volver.
export default function BranchTranscript({
  intercambios,
  side,
  onFlipSide,
  onClose,
  onSubmit,
  onStop,
  onRetry,
  nav,
  onNavigate,
  width,
  resizable = false,
  onResize,
}: {
  intercambios: Intercambio[];
  side: "left" | "right";
  onFlipSide: () => void;
  onClose: () => void;
  onSubmit?: (text: string, kind: BranchKind) => void;
  // Corta el stream del globo abierto en el panel (si está `pending`).
  onStop?: () => void;
  // Vuelve a pedir la respuesta del globo abierto en el panel.
  onRetry?: () => void;
  // Navegación por el árbol desde el globo abierto (ids destino o null).
  nav?: {
    prev: string | null;
    next: string | null;
    up: string | null;
    down: string | null;
    pos: number;
    total: number;
  } | null;
  onNavigate?: (id: string) => void;
  width?: number;
  resizable?: boolean;
  onResize?: (px: number) => void;
}) {
  const [borrador, setBorrador] = useState("");
  const finRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const ultimo = intercambios[intercambios.length - 1];
  const streameando = Boolean(ultimo?.pending);

  // El arrastre del borde mueve el ancho por el DOM directamente (fluido, sin
  // re-render); al soltar se persiste vía `onResize` y el padre vuelve con
  // `width` reclampeado al viewport.
  const onResizeStart = (e: ReactPointerEvent) => {
    if (!resizable) return;
    e.preventDefault();
    e.stopPropagation();
    const max = Math.round(window.innerWidth * ANCHO_PANEL_MAX_FRAC);
    const calc = (ev: PointerEvent) => {
      const crudo =
        side === "right" ? window.innerWidth - ev.clientX : ev.clientX;
      return Math.min(max, Math.max(ANCHO_PANEL_MIN, Math.round(crudo)));
    };
    let ultimo = width ?? ANCHO_PANEL_MIN;
    const onMove = (ev: PointerEvent) => {
      ultimo = calc(ev);
      if (panelRef.current) panelRef.current.style.width = `${ultimo}px`;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      onResize?.(ultimo);
      // El `pointerup` fuera de la manija dispara un `click` sintético cuyo
      // target puede ser el fondo (que cierra el panel). Tragarse ese click.
      window.addEventListener(
        "click",
        (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
        },
        { capture: true, once: true },
      );
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

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

  // Mientras el último globo streamea, seguir el texto — pero solo si el usuario
  // ya está cerca del fondo (si scrolleó hacia arriba a leer, no lo forzamos).
  useEffect(() => {
    if (!streameando) return;
    const cont = scrollRef.current;
    if (!cont) return;
    const cerca =
      cont.scrollHeight - cont.scrollTop - cont.clientHeight < 120;
    if (cerca) finRef.current?.scrollIntoView({ block: "end" });
  }, [ultimo?.respuesta, streameando]);

  const enviar = (kind: BranchKind) => {
    const t = borrador.trim();
    if (!t || !onSubmit) return;
    onSubmit(t, kind);
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
        ref={panelRef}
        style={width ? { width } : undefined}
        className={`relative flex h-full max-w-full flex-col bg-neutral-950 text-sm shadow-2xl ${
          width ? "" : "w-full"
        } ${
          side === "left" ? "border-r border-white/15" : "border-l border-white/15"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {resizable && onResize && (
          <div
            onPointerDown={onResizeStart}
            onClick={(e) => e.stopPropagation()}
            title="Arrastrá para cambiar el ancho"
            className={`absolute inset-y-0 z-30 w-3 cursor-ew-resize bg-white/5 hover:bg-sky-400/40 ${
              side === "right" ? "left-0 -ml-1.5" : "right-0 -mr-1.5"
            }`}
          />
        )}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <span className="font-medium text-white">
            Conversación hasta este globo
            <span className="ml-2 text-xs font-normal text-white/40">
              {intercambios.length} interc.
            </span>
          </span>
          <div className="flex items-center gap-1">
            {!resizable && (
              <button
                type="button"
                onClick={onClose}
                className="whitespace-nowrap rounded border border-white/15 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
              >
                🗺 Ver mapa
              </button>
            )}
            {resizable && (
              <button
                type="button"
                onClick={onFlipSide}
                className="rounded px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white"
                aria-label={
                  side === "left" ? "Mover a la derecha" : "Mover a la izquierda"
                }
                title={
                  side === "left" ? "Mover a la derecha" : "Mover a la izquierda"
                }
              >
                ⇄
              </button>
            )}
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

        {nav && onNavigate && (
          <div className="flex items-center gap-1 border-b border-white/10 px-4 py-1.5 text-white/60">
            {(
              [
                ["up", "▲", "Ir al globo padre"],
                ["prev", "◀", "Hermano anterior"],
                ["next", "▶", "Hermano siguiente"],
                ["down", "▼", "Ir al primer hijo"],
              ] as const
            ).map(([dir, icon, label]) => (
              <button
                key={dir}
                type="button"
                onClick={() => nav[dir] && onNavigate(nav[dir]!)}
                disabled={!nav[dir]}
                title={label}
                aria-label={label}
                className="rounded px-1.5 py-0.5 text-xs enabled:hover:bg-white/10 enabled:hover:text-white disabled:opacity-25"
              >
                {icon}
              </button>
            ))}
            {nav.total > 1 && (
              <span className="ml-1 text-[11px] text-white/40">
                hermano {nav.pos} / {nav.total}
              </span>
            )}
          </div>
        )}

        <div
          ref={scrollRef}
          className="flex-1 space-y-5 overflow-y-auto px-4 py-4"
        >
          {intercambios.map((ic, i) => (
            <div key={ic.id} className="space-y-2">
              {ic.pregunta && (
                <div className="border-l-2 border-sky-400/50 pl-2.5">
                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300/70">
                    Vos
                  </p>
                  <div className="whitespace-pre-wrap rounded-md rounded-tl-none bg-sky-500/10 px-3 py-2 text-white">
                    {ic.pregunta}
                  </div>
                </div>
              )}
              <div className="border-l-2 border-white/15 pl-2.5">
                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/40">
                  {ic.proveedor ? NOMBRE_PROVEEDOR[ic.proveedor] : "IA"}
                </p>
                {ic.error ? (
                  <p className="whitespace-pre-wrap text-xs text-red-300">
                    ⚠ {ic.error}
                  </p>
                ) : ic.respuesta ? (
                  <div className="rounded-md rounded-tl-none bg-white/[0.04] px-3 py-2 text-white/90">
                    <Markdown>{ic.respuesta}</Markdown>
                  </div>
                ) : ic.pending ? (
                  <p className="italic text-white/40">escribiendo…</p>
                ) : (
                  <p className="italic text-white/40">Respuesta pendiente</p>
                )}
                {/* "Rehacer" en el último intercambio (el globo abierto). */}
                {onRetry && !ic.pending && i === intercambios.length - 1 && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="mt-1.5 rounded border border-white/15 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                    title="Volver a pedir la respuesta"
                  >
                    ↻ {ic.error ? "Reintentar" : "Rehacer"}
                  </button>
                )}
              </div>
            </div>
          ))}
          <div ref={finRef} />
        </div>

        {onSubmit && streameando && onStop ? (
          <div className="flex items-center justify-between gap-2 border-t border-white/10 p-3">
            <span className="flex items-center gap-1.5 text-[11px] text-white/40">
              <span className="lapiz-escribiendo text-sm leading-none" aria-hidden>
                ✏️
              </span>
              escribiendo…
            </span>
            <button
              type="button"
              onClick={onStop}
              className="flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10"
            >
              <span className="block h-2.5 w-2.5 bg-current" /> Detener
            </button>
          </div>
        ) : onSubmit ? (
          <div className="border-t border-white/10 p-3">
            <textarea
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.shiftKey) return;
                e.preventDefault();
                enviar(e.ctrlKey || e.metaKey ? "branch" : "main");
              }}
              rows={2}
              placeholder="Seguí la conversación desde este globo…"
              className="w-full resize-none rounded-md border border-white/15 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-sky-400 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-white/30">
                Enter continúa · Ctrl+Enter ramifica
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => enviar("branch")}
                  disabled={borrador.trim() === ""}
                  className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-white/90 enabled:hover:bg-white/10 disabled:opacity-40"
                >
                  ⑂ Ramificar
                </button>
                <button
                  type="button"
                  onClick={() => enviar("main")}
                  disabled={borrador.trim() === ""}
                  className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white enabled:hover:bg-sky-400 disabled:opacity-40"
                >
                  ↓ Enviar
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
