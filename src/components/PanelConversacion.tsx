"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { BranchKind } from "./Composer";
import Markdown from "./Markdown";
import { ANCHO_PANEL_MAX_FRAC, ANCHO_PANEL_MIN } from "./settings";
import { tragarClickSintetico } from "./gestos";
import {
  dataUrl,
  descargarAdjunto,
  fmtBytes,
  iconoAdjunto,
  leerArchivo,
  pesoAdjunto,
} from "@/model/adjuntos";
import {
  copiarTexto,
  descargarTexto,
  nombreArchivoRespuesta,
} from "@/model/exportar";
import { NOMBRE_PROVEEDOR } from "@/model/ia";
import type { Adjunto, Intercambio } from "@/model/intercambio";

// 1234 → "1.2k", 950 → "950". Compartido por el contador de contexto (T10) y el
// de tokens gastados (T12).
export function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// Panel de conversación (era `BranchTranscript` hasta F5-6): el camino
// raíz→globo aplanado a preguntas y respuestas, tipo chat. Vista derivada del
// árbol (no toca estado). Con Fase 5 el globo es un TRAMO, así que el camino
// abarca varios tramos ancestros + el tramo abierto, todo como una
// transcripción continua. Se abre con doble-click en un globo o el botón ⤢. El
// lado (izq/der) lo elige el usuario con ⇄ y se persiste en Settings.
//
// Si recibe `onSubmit` (no en modo compartido), es también la superficie de
// ESCRITURA (F5): mini-composer al pie — Enter agrega a la punta del tramo
// abierto, Ctrl/Cmd+Enter (o "⑂ ramificar desde acá" en un turno) ramifica.
//
// Ancho (fase 3.11): en desktop se arrastra el borde interno (`onResize` con el
// ancho ya clampeado por el padre en `width`). En móvil (`resizable === false`)
// va a pantalla completa y el header muestra un botón "🗺 Mapa" para volver.
export default function PanelConversacion({
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
  proveedorNombre,
  proveedorLeePdf = true,
  width,
  resizable = false,
  onResize,
}: {
  intercambios: Intercambio[];
  side: "left" | "right";
  onFlipSide: () => void;
  onClose: () => void;
  // `desdeId` (T16/F5-3): ramificar desde ESE intercambio, no desde la punta.
  onSubmit?: (
    text: string,
    kind: BranchKind,
    adjuntos: Adjunto[],
    desdeId?: string,
  ) => void;
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
  // Para el aviso "el PDF solo lo leen Gemini/Claude" (T16c).
  proveedorNombre?: string;
  proveedorLeePdf?: boolean;
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
  // Id del intercambio cuya respuesta se acaba de copiar → "✓ Copiado" en ESE
  // turno (los botones de copiar/guardar están en cada respuesta, no solo la
  // última — T15 + pedido de Alan 02-09).
  const [copiadaId, setCopiadaId] = useState<string | null>(null);
  // Ramificar desde un intercambio del medio (F5-3). `null` = desde la punta.
  const [ramificarDesde, setRamificarDesde] = useState<string | null>(null);
  const arrastreDepth = useRef(0);
  const inputArchRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
      tragarClickSintetico(); // si no, el click post-drag cierra el panel
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

  // Al abrir el panel / navegar a un globo EXISTENTE: mostrar el arranque de ese
  // intercambio ("Vos: …"), no el final. Si el último es una respuesta fresca en
  // curso (la mandaste desde el composer), NO — de eso se encarga el auto-scroll.
  useEffect(() => {
    if (!ultimo || (ultimo.respuesta == null && !ultimo.error)) return;
    const cont = scrollRef.current;
    const ini = inicioUltimoRef.current;
    if (!cont || !ini) return;
    cont.scrollTop = Math.max(0, ini.offsetTop - 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultimo?.id]);

  // Mientras el último globo streamea, seguir el texto. Se sigue salvo que el
  // usuario scrollee hacia arriba a leer (`pegado` = false); vuelve a seguir si
  // baja. Se re-pega al abrir / navegar / mandar (cambia `ultimo?.id`).
  const pegado = useRef(true);
  // El scroll que hacemos nosotros dispara un `scroll` event → `alScrollear`
  // veía "no está en el fondo" (el markdown recién crecido, aún sin reflow) y
  // apagaba `pegado` a mitad del stream (B9). Marca los scrolls propios.
  const autoScroll = useRef(false);
  useEffect(() => {
    pegado.current = true;
  }, [ultimo?.id]);
  useLayoutEffect(() => {
    if (!streameando || !pegado.current) return;
    const cont = scrollRef.current;
    if (!cont) return;
    autoScroll.current = true;
    cont.scrollTop = cont.scrollHeight;
    requestAnimationFrame(() => {
      autoScroll.current = false;
    });
  }, [ultimo?.respuesta, streameando]);
  const alScrollear = () => {
    if (autoScroll.current) return;
    const c = scrollRef.current;
    if (c) pegado.current = c.scrollHeight - c.scrollTop - c.clientHeight < 60;
  };

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
    onSubmit(
      t,
      kind,
      adjuntos,
      kind === "branch" ? ramificarDesde ?? undefined : undefined,
    );
    setBorrador("");
    setAdjuntos([]);
    setAvisoAdj(null);
    setRamificarDesde(null);
  };

  // La punta = el último del camino. Ramificar desde ahí es el default (no chip).
  const puntaId = ultimo?.id ?? null;
  const desdeActivo =
    ramificarDesde && ramificarDesde !== puntaId ? ramificarDesde : null;
  const preguntaDesde = desdeActivo
    ? (intercambios.find((i) => i.id === desdeActivo)?.pregunta ?? "").slice(0, 40)
    : null;

  return (
    <div
      // `data-cierra-al-click`: el swallower de `gestos.ts` se traga el click
      // sintético post-resize del borde si cae sobre este backdrop (si no,
      // cerraría el panel recién redimensionado).
      data-cierra-al-click
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
          onScroll={alScrollear}
          // Con el panel a la izquierda, la manija de resize va en el borde
          // derecho — el mismo lado que el scrollbar de la conversación. Se
          // separan con un margen en ese lado (B10).
          className={`relative flex-1 space-y-5 overflow-y-auto px-10 py-4 ${
            side === "left" ? "mr-4" : ""
          }`}
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
                    <Markdown conCopiar>{ic.respuesta}</Markdown>
                  </div>
                ) : ic.pending ? (
                  <p className="italic text-white/40">escribiendo…</p>
                ) : (
                  <p className="italic text-white/40">Respuesta pendiente</p>
                )}
                {/* Acciones por respuesta (T15 + F5-3): ramificar desde este
                    punto, copiar / guardar ESTA respuesta. En cada turno de la
                    IA, no solo el último. Links sutiles, siempre visibles. */}
                {!ic.pending && ic.respuesta && !ic.error && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    {onSubmit && (
                      <button
                        type="button"
                        onClick={() => {
                          setRamificarDesde(ic.id);
                          textareaRef.current?.focus();
                        }}
                        className={
                          ramificarDesde === ic.id
                            ? "font-medium text-sky-300"
                            : "text-white/25 hover:text-white/60"
                        }
                        title="Ramificar una pregunta nueva desde este punto (sin tocar el hilo)"
                      >
                        ⑂ ramificar desde acá
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        if (await copiarTexto(ic.respuesta ?? "")) {
                          setCopiadaId(ic.id);
                          setTimeout(
                            () =>
                              setCopiadaId((c) => (c === ic.id ? null : c)),
                            1500,
                          );
                        }
                      }}
                      className="text-white/25 hover:text-white/60"
                      title="Copiar la respuesta como texto"
                    >
                      {copiadaId === ic.id ? "✓ Copiado" : "⧉ Copiar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const { nombre, contenido, mime } =
                          nombreArchivoRespuesta(ic.respuesta ?? "");
                        descargarTexto(nombre, contenido, mime);
                      }}
                      className="text-white/25 hover:text-white/60"
                      title="Guardar la respuesta como archivo"
                    >
                      ⬇ Guardar
                    </button>
                  </div>
                )}
                {/* Rehacer / reintentar: solo la punta del camino (es la única
                    respuesta que se puede volver a pedir). */}
                {!ic.pending &&
                  i === intercambios.length - 1 &&
                  onRetry &&
                  (ic.respuesta || ic.error) && (
                    <div className="mt-1.5">
                      <button
                        type="button"
                        onClick={onRetry}
                        className="rounded border border-white/15 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                        title="Volver a pedir la respuesta"
                      >
                        ↻ {ic.error ? "Reintentar" : "Rehacer"}
                      </button>
                    </div>
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
            {desdeActivo && (
              <div className="mb-2 flex items-center gap-1.5 rounded border border-sky-400/40 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-200">
                <span aria-hidden>⑂</span>
                <span className="min-w-0 flex-1 truncate">
                  Ramificando desde: «{preguntaDesde}»
                </span>
                <button
                  type="button"
                  onClick={() => setRamificarDesde(null)}
                  aria-label="Ramificar desde la punta"
                  className="text-sky-200/70 hover:text-white"
                >
                  ✕
                </button>
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
                {!proveedorLeePdf &&
                  adjuntos.some((a) => a.tipo === "pdf") && (
                    <p className="text-[11px] text-amber-300/90">
                      ⚠ El PDF solo lo leen Gemini (gratis) o Claude
                      {proveedorNombre ? ` — con ${proveedorNombre} se va a ignorar` : ""}.
                    </p>
                  )}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.shiftKey) return;
                e.preventDefault();
                enviar(
                  e.ctrlKey || e.metaKey || desdeActivo ? "branch" : "main",
                );
              }}
              rows={2}
              placeholder={
                desdeActivo
                  ? "Escribí la pregunta de la rama nueva…"
                  : adjuntos.length > 0
                    ? "Escribí qué hago con el archivo (ej: “explicá”, “resumí”)…"
                    : "Seguí la conversación desde este globo…"
              }
              className="w-full resize-none rounded-md border border-white/15 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-sky-400 focus:outline-none"
            />
            <input
              ref={inputArchRef}
              type="file"
              multiple
              accept="text/*,image/png,image/jpeg,image/webp,application/pdf,.pdf,.md,.markdown,.txt,.csv,.tsv,.json,.yaml,.yml,.toml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.kt,.c,.h,.cpp,.cs,.php,.sh,.sql,.log,.diff"
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
                title="Adjuntar un archivo (texto, imagen o PDF)"
                className="rounded border border-white/15 px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
              >
                📎
              </button>
              <div className="flex items-center gap-2">
                <span className="hidden text-[11px] text-white/30 sm:inline">
                  {desdeActivo
                    ? "Enter ramifica desde el punto elegido"
                    : "Enter continúa · Ctrl+Enter ramifica"}
                </span>
                {!desdeActivo && (
                  <button
                    type="button"
                    onClick={() => enviar("branch")}
                    disabled={borrador.trim() === ""}
                    className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-white/90 enabled:hover:bg-white/10 disabled:opacity-40"
                  >
                    ⑂ Ramificar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => enviar(desdeActivo ? "branch" : "main")}
                  disabled={borrador.trim() === ""}
                  className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white enabled:hover:bg-sky-400 disabled:opacity-40"
                >
                  {desdeActivo ? "⑂ Ramificar" : "↓ Enviar"}
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
