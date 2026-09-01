"use client";

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { BranchKind } from "./Composer";
import Markdown from "./Markdown";
import { ANCHO_PANEL_MAX_FRAC, ANCHO_PANEL_MIN } from "./settings";
import {
  dataUrl,
  descargarAdjunto,
  fmtBytes,
  iconoAdjunto,
  leerArchivo,
  pesoAdjunto,
} from "@/model/adjuntos";
import { NOMBRE_PROVEEDOR } from "@/model/ia";
import type { Adjunto, Intercambio } from "@/model/intercambio";

// 1234 → "1.2k", 950 → "950". Compartido por el contador de contexto (T10) y el
// de tokens gastados (T12).
export function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

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
  contextoTokens,
  width,
  resizable = false,
  onResize,
}: {
  intercambios: Intercambio[];
  side: "left" | "right";
  onFlipSide: () => void;
  onClose: () => void;
  onSubmit?: (text: string, kind: BranchKind, adjuntos: Adjunto[]) => void;
  // Corta el stream del globo abierto en el panel (si está `pending`).
  onStop?: () => void;
  // Vuelve a pedir la respuesta del globo abierto en el panel.
  onRetry?: () => void;
  // Globos unidos por una línea de costado (ver `nav` en FlowCanvas). Una lista
  // por lado, ordenada de arriba a abajo → una flechita por destino, apiladas.
  nav?: {
    left: { id: string; label: string }[];
    right: { id: string; label: string }[];
  } | null;
  onNavigate?: (id: string) => void;
  // Estimación (≈ chars/4) de tokens de contexto para el globo abierto (T10).
  contextoTokens?: number | null;
  width?: number;
  resizable?: boolean;
  onResize?: (px: number) => void;
}) {
  const [borrador, setBorrador] = useState("");
  // Archivos adjuntos a la próxima pregunta (T16). Se limpian al enviar.
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [avisoAdj, setAvisoAdj] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  // Imagen abierta a tamaño completo (lightbox).
  const [verImagen, setVerImagen] = useState<Adjunto | null>(null);
  const arrastreDepth = useRef(0);
  const inputArchRef = useRef<HTMLInputElement>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Arranque del intercambio abierto ("Vos: …") — al abrir/navegar el panel se
  // posiciona acá, no al final de la respuesta, para ver dónde estás parado.
  const inicioUltimoRef = useRef<HTMLDivElement>(null);

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
      if (e.key !== "Escape") return;
      if (verImagen) setVerImagen(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, verImagen]);

  // Al abrir el panel o navegar a otro globo: mostrar el arranque de ESE
  // intercambio ("Vos: …") arriba de todo — no el final de la respuesta. Para
  // ver el contexto (los padres) se scrollea hacia arriba.
  useEffect(() => {
    const cont = scrollRef.current;
    const ini = inicioUltimoRef.current;
    if (!cont || !ini) return;
    cont.scrollTop = Math.max(0, ini.offsetTop - 12);
  }, [ultimo?.id]);

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

  // Lee archivos soltados / pegados / elegidos y los suma a `adjuntos`, con los
  // topes de `adjuntos.ts`. El texto de la pregunta sigue siendo obligatorio.
  const agregarArchivos = async (files: FileList | File[]) => {
    const lista = Array.from(files);
    if (lista.length === 0) return;
    setAvisoAdj(null);
    let peso = adjuntos.reduce((n, a) => n + pesoAdjunto(a), 0);
    const nuevos: Adjunto[] = [];
    for (const file of lista) {
      const r = await leerArchivo(file, peso);
      if (r.ok) {
        nuevos.push(r.adjunto);
        peso += pesoAdjunto(r.adjunto);
      } else {
        setAvisoAdj(r.error);
      }
    }
    if (nuevos.length > 0) setAdjuntos((prev) => [...prev, ...nuevos]);
  };

  const quitarAdjunto = (i: number) =>
    setAdjuntos((prev) => prev.filter((_, j) => j !== i));

  const onDrop = (e: ReactDragEvent) => {
    e.preventDefault();
    arrastreDepth.current = 0;
    setArrastrando(false);
    if (e.dataTransfer.files.length > 0) void agregarArchivos(e.dataTransfer.files);
  };
  const onDragEnter = (e: ReactDragEvent) => {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    arrastreDepth.current += 1;
    setArrastrando(true);
  };
  const onDragOver = (e: ReactDragEvent) => {
    if ([...e.dataTransfer.types].includes("Files")) e.preventDefault();
  };
  const onDragLeave = () => {
    arrastreDepth.current = Math.max(0, arrastreDepth.current - 1);
    if (arrastreDepth.current === 0) setArrastrando(false);
  };
  const onPaste = (e: ReactClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      void agregarArchivos(files);
    }
  };

  const enviar = (kind: BranchKind) => {
    const t = borrador.trim();
    if (!t || !onSubmit) return;
    onSubmit(t, kind, adjuntos);
    setBorrador("");
    setAdjuntos([]);
    setAvisoAdj(null);
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
              {typeof contextoTokens === "number" && (
                <span
                  title="Estimación (≈ 4 caracteres por token) de lo que se manda como contexto al preguntar desde este globo. La llamada real puede mandar menos si resume lo más viejo."
                >
                  {` · ≈ ${fmtTokens(contextoTokens)} tokens de contexto`}
                </span>
              )}
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

        {/* Flechas laterales: una por cada rama unida por ese costado (ramas
            hijas, o el padre si este globo es una rama), apiladas en el orden
            vertical de los globos en el mapa. El resto (hijos de continuación,
            hermanos, contexto) se ve scrolleando el panel o clickeando el mapa. */}
        {nav && onNavigate && nav.left.length > 0 && (
          <div className="absolute left-3 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-1">
            {nav.left.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onNavigate(d.id)}
                aria-label={`Ir a: ${d.label}`}
                className="group/nav relative flex h-9 w-6 items-center justify-center rounded-md border border-white/15 bg-neutral-900/90 text-lg leading-none text-white/60 shadow-lg hover:bg-white/10 hover:text-white"
              >
                ‹
                <span className="pointer-events-none absolute left-full ml-1.5 hidden max-w-[14rem] truncate whitespace-nowrap rounded bg-neutral-800 px-2 py-1 text-xs text-white/85 shadow-lg group-hover/nav:block">
                  {d.label}
                </span>
              </button>
            ))}
          </div>
        )}
        {nav && onNavigate && nav.right.length > 0 && (
          <div className="absolute right-3 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-1">
            {nav.right.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onNavigate(d.id)}
                aria-label={`Ir a: ${d.label}`}
                className="group/nav relative flex h-9 w-6 items-center justify-center rounded-md border border-white/15 bg-neutral-900/90 text-lg leading-none text-white/60 shadow-lg hover:bg-white/10 hover:text-white"
              >
                ›
                <span className="pointer-events-none absolute right-full mr-1.5 hidden max-w-[14rem] truncate whitespace-nowrap rounded bg-neutral-800 px-2 py-1 text-xs text-white/85 shadow-lg group-hover/nav:block">
                  {d.label}
                </span>
              </button>
            ))}
          </div>
        )}

        <div
          ref={scrollRef}
          className="relative flex-1 space-y-5 overflow-y-auto px-10 py-4"
        >
          {intercambios.map((ic, i) => (
            <div
              key={ic.id}
              ref={i === intercambios.length - 1 ? inicioUltimoRef : undefined}
              className="space-y-2"
            >
              {ic.pregunta && (
                <div className="border-l-2 border-sky-400/50 pl-2.5">
                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300/70">
                    Vos
                  </p>
                  <div className="whitespace-pre-wrap rounded-md rounded-tl-none bg-sky-500/10 px-3 py-2 text-white">
                    {ic.pregunta}
                  </div>
                  {ic.adjuntos.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-start gap-1.5">
                      {ic.adjuntos.map((a, j) =>
                        a.tipo === "imagen" ? (
                          <button
                            key={j}
                            type="button"
                            onClick={() => setVerImagen(a)}
                            title={`${a.nombre} — ver`}
                            className="overflow-hidden rounded border border-white/15 hover:border-sky-400/60"
                          >
                            <img
                              src={dataUrl(a)}
                              alt={a.nombre}
                              className="h-16 w-16 object-cover"
                            />
                          </button>
                        ) : (
                          <button
                            key={j}
                            type="button"
                            onClick={() => descargarAdjunto(a)}
                            title={`Descargar ${a.nombre}`}
                            className="flex items-center gap-1 rounded border border-white/15 bg-white/[0.04] px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
                          >
                            <span aria-hidden>{iconoAdjunto(a.tipo)}</span>
                            <span className="max-w-[12rem] truncate">{a.nombre}</span>
                            <span className="text-white/40">
                              {fmtBytes(pesoAdjunto(a))}
                            </span>
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="border-l-2 border-white/15 pl-2.5">
                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/40">
                  {ic.proveedor ? NOMBRE_PROVEEDOR[ic.proveedor] : "IA"}
                  {/* Tokens que reportó el proveedor para ESTE globo (T11 → .md).
                      Nada si no vinieron (nunca un "0" falso). */}
                  {typeof ic.tokensEntrada === "number" &&
                    typeof ic.tokensSalida === "number" && (
                      <span
                        className="ml-2 font-normal normal-case tracking-normal text-white/30"
                        title={`Tokens de esta respuesta: ${ic.tokensEntrada} de entrada (contexto + pregunta) + ${ic.tokensSalida} de salida`}
                      >
                        {fmtTokens(ic.tokensEntrada)} → {fmtTokens(ic.tokensSalida)} tok
                      </span>
                    )}
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
          <div
            className={`relative border-t border-white/10 p-3 ${
              arrastrando ? "outline-dashed outline-2 -outline-offset-4 outline-sky-400/70" : ""
            }`}
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {arrastrando && (
              <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-md bg-neutral-950/80 text-sm text-sky-300">
                Soltá los archivos acá
              </div>
            )}
            {(adjuntos.length > 0 || avisoAdj) && (
              <div className="mb-2 space-y-1.5">
                {adjuntos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {adjuntos.map((a, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1 rounded border border-white/15 bg-white/[0.04] py-1 pl-1 pr-2 text-[11px] text-white/80"
                      >
                        {a.tipo === "imagen" ? (
                          <img
                            src={dataUrl(a)}
                            alt=""
                            className="h-5 w-5 rounded-sm object-cover"
                          />
                        ) : (
                          <span aria-hidden className="px-0.5">
                            {iconoAdjunto(a.tipo)}
                          </span>
                        )}
                        <span className="max-w-[12rem] truncate">{a.nombre}</span>
                        <span className="text-white/40">{fmtBytes(pesoAdjunto(a))}</span>
                        <button
                          type="button"
                          onClick={() => quitarAdjunto(i)}
                          aria-label={`Quitar ${a.nombre}`}
                          className="ml-0.5 text-white/40 hover:text-white"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {avisoAdj && (
                  <p className="text-[11px] text-amber-300/90">⚠ {avisoAdj}</p>
                )}
              </div>
            )}
            <textarea
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.shiftKey) return;
                e.preventDefault();
                enviar(e.ctrlKey || e.metaKey ? "branch" : "main");
              }}
              rows={2}
              placeholder={
                adjuntos.length > 0
                  ? "Escribí qué hago con el archivo (ej: “explicá”, “resumí”)…"
                  : "Seguí la conversación desde este globo…"
              }
              className="w-full resize-none rounded-md border border-white/15 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-sky-400 focus:outline-none"
            />
            <input
              ref={inputArchRef}
              type="file"
              multiple
              accept="text/*,image/png,image/jpeg,image/webp,.md,.markdown,.txt,.csv,.tsv,.json,.yaml,.yml,.toml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.kt,.c,.h,.cpp,.cs,.php,.sh,.sql,.log,.diff"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void agregarArchivos(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => inputArchRef.current?.click()}
                title="Adjuntar un archivo (texto o imagen)"
                className="rounded border border-white/15 px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
              >
                📎
              </button>
              <div className="flex items-center gap-2">
                <span className="hidden text-[11px] text-white/30 sm:inline">
                  Enter continúa · Ctrl+Enter ramifica
                </span>
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

      {verImagen && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/85 p-6"
          onClick={(e) => {
            e.stopPropagation();
            setVerImagen(null);
          }}
        >
          <img
            src={dataUrl(verImagen)}
            alt={verImagen.nombre}
            className="max-h-full max-w-full object-contain"
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setVerImagen(null);
            }}
            aria-label="Cerrar"
            className="absolute right-4 top-4 rounded px-2 py-1 text-white/70 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
