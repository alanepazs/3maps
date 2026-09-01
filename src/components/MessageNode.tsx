import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Handle,
  NodeToolbar,
  Position,
  useReactFlow,
  useStore,
  type NodeProps,
} from "@xyflow/react";

import { tragarClickSintetico } from "./gestos";
import LimiteError from "./LimiteError";
import Markdown from "./Markdown";
import { NodeActionsContext } from "./nodeActions";
import { ALTO_BASE_GLOBO } from "./settings";
import type { Intercambio } from "@/model/intercambio";

// Límites y default del redimensionado manual (px, coords del lienzo).
type Tamano = { w: number; h: number };
const TAMANO_MIN: Tamano = { w: 200, h: 80 };
const TAMANO_MAX: Tamano = { w: 900, h: 1200 };
const ANCHO_POR_DEFECTO = 260;

// Un globo = un TRAMO de la conversación (Fase 5): una cadena de intercambios
// unidos por `rama: "main"`. `data.intercambios` es el tramo en orden. El
// intercambio sigue siendo la unidad de datos; el globo es la unidad visual.
//
// El globo es un OVERVIEW: muestra la transcripción del tramo (scrolleable). La
// lectura/escritura completa (raíz→acá) va en el panel lateral.
//
// Handles (el nodo raíz no tiene ninguno de entrada):
//   - target "t-top"               : entra el tronco (`main`), vertical
//   - target "t-left" / "t-right"  : entra una rama, por el costado opuesto
//   - source "main" (abajo)        : continuación / rama por abajo
//   - source "branch-right/-left"  : ramificar por un costado
export default function MessageNode({
  id,
  data,
  selected,
  isConnectable,
}: NodeProps) {
  const intercambios = (
    Array.isArray(data.intercambios) ? data.intercambios : []
  ) as Intercambio[];
  const n = intercambios.length;
  const ultimo: Intercambio | undefined = intercambios[n - 1];
  const puntaId = ultimo?.id ?? id;

  const isRoot = Boolean(data.isRoot);
  const sinHijos = Boolean(data.sinHijos);
  const adjuntosN = typeof data.adjuntosN === "number" ? data.adjuntosN : 0;
  const rev = String(data.rev ?? "");
  const pending = Boolean(ultimo?.pending); // la punta del tramo está streameando

  const {
    deleteNode,
    retryNode,
    stopNode,
    openNode,
    resizeNode,
    readOnly,
    crecimientoPx,
    crecimientoTope,
  } = useContext(NodeActionsContext);
  const { getZoom } = useReactFlow();
  // Zoom del lienzo (re-render solo al cambiar el zoom, no al panear) para
  // contra-escalar la manija de resize (con zoom out quedaría sub-píxel).
  const zoomLienzo = useStore((s) => s.transform[2]);
  const escalaManija = Math.min(4, Math.max(1, 1 / (zoomLienzo || 1)));

  // Tamaño manual (fase 3.10) — guardado en la CABEZA del tramo (`data.ancho/alto`
  // → `.md`). `id` (prop) = id de la cabeza.
  const anchoData = typeof data.ancho === "number" ? data.ancho : null;
  const altoData = typeof data.alto === "number" ? data.alto : null;
  const [drag, setDrag] = useState<Tamano | null>(null);
  const tamano: Tamano | undefined =
    drag ?? (anchoData && altoData ? { w: anchoData, h: altoData } : undefined);
  const rootRef = useRef<HTMLDivElement>(null);
  const cuerpoRef = useRef<HTMLDivElement>(null);

  // Fase 5 (F5-4): sin tamaño manual, el globo tiene un alto FIJO que crece unos
  // px por mensaje (para verlo de lejos). El cuerpo scrollea adentro. Ya no hay
  // "expandir/colapsar" — para leer todo se abre el panel.
  const altoTramo =
    ALTO_BASE_GLOBO + Math.min(n * crecimientoPx, crecimientoTope);

  // Auto-scroll al fondo mientras la punta streamea. Se sigue el texto salvo que
  // el usuario scrollee hacia arriba a leer (`pegado` = false); vuelve a seguir
  // si baja de nuevo. Se re-pega al arrancar una respuesta nueva (`puntaId`).
  const pegado = useRef(true);
  useEffect(() => {
    pegado.current = true;
  }, [puntaId]);
  useEffect(() => {
    if (!pending) return;
    const el = cuerpoRef.current;
    if (el && pegado.current) el.scrollTop = el.scrollHeight;
  }, [rev, pending]);
  const alScrollear = () => {
    const el = cuerpoRef.current;
    if (el) pegado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const onResizeStart = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const zoom = getZoom() || 1;
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = rect.width / zoom;
      const startH = rect.height / zoom;
      let ultimoT: Tamano | undefined;
      const onMove = (ev: PointerEvent) => {
        const w = Math.min(
          TAMANO_MAX.w,
          Math.max(TAMANO_MIN.w, startW + (ev.clientX - startX) / zoom),
        );
        const h = Math.min(
          TAMANO_MAX.h,
          Math.max(TAMANO_MIN.h, startH + (ev.clientY - startY) / zoom),
        );
        ultimoT = { w: Math.round(w), h: Math.round(h) };
        setDrag(ultimoT);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (ultimoT) resizeNode(id, ultimoT.w, ultimoT.h);
        setDrag(null);
        tragarClickSintetico();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [getZoom, id, resizeNode],
  );

  const resetTamano = useCallback(() => {
    setDrag(null);
    resizeNode(id, null, null);
  }, [id, resizeNode]);

  return (
    <div
      ref={rootRef}
      style={{
        width: tamano?.w ?? ANCHO_POR_DEFECTO,
        height: tamano?.h ?? altoTramo,
      }}
      className={`relative flex flex-col overflow-hidden rounded-md border bg-neutral-900 text-sm ${
        selected ? "border-sky-400 ring-2 ring-sky-400/40" : "border-white/20"
      }`}
    >
      {/* Mientras la punta streamea: badge de lápiz + STOP, flotando a la
          izquierda (el globo tiene overflow-hidden → NodeToolbar se renderiza afuera). */}
      <NodeToolbar isVisible={pending && !readOnly} position={Position.Left}>
        <div className="flex items-center gap-1 rounded-md border border-white/15 bg-neutral-900 px-1.5 py-1 shadow-lg">
          <span className="lapiz-escribiendo text-sm leading-none" aria-hidden>
            ✏️
          </span>
          <button
            type="button"
            onClick={() => stopNode(puntaId)}
            title="Detener la respuesta"
            aria-label="Detener la respuesta"
            className="flex h-5 w-5 items-center justify-center rounded border border-white/20 text-[10px] text-white/80 hover:bg-white/10"
          >
            <span className="block h-2 w-2 bg-current" />
          </button>
        </div>
      </NodeToolbar>

      <NodeToolbar isVisible={selected} position={Position.Top} align="end">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => openNode(id)}
            className="rounded border border-white/20 bg-neutral-900 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
          >
            ⤢ Abrir
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={() => retryNode(puntaId)}
              className="rounded border border-white/20 bg-neutral-900 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
              title="Volver a pedir la última respuesta"
            >
              ↻ Rehacer
            </button>
          )}
          {tamano && (
            <button
              type="button"
              onClick={resetTamano}
              className="rounded border border-white/20 bg-neutral-900 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
              title="Volver al tamaño automático"
            >
              ↔ Auto
            </button>
          )}
          {!readOnly && (!isRoot || sinHijos) && (
            <button
              type="button"
              onClick={() => deleteNode(id)}
              className="rounded border border-red-400/40 bg-neutral-900 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20"
            >
              🗑 Eliminar
            </button>
          )}
        </div>
      </NodeToolbar>

      {!isRoot && (
        <>
          <Handle
            type="target"
            id="t-top"
            position={Position.Top}
            isConnectable={isConnectable}
          />
          <Handle
            type="target"
            id="t-left"
            position={Position.Left}
            isConnectable={isConnectable}
          />
          <Handle
            type="target"
            id="t-right"
            position={Position.Right}
            isConnectable={isConnectable}
          />
        </>
      )}

      <div className="relative z-10 flex shrink-0 items-center gap-1.5 border-b border-white/10 bg-neutral-900 px-3 py-1 text-left text-[11px] font-medium text-white/55">
        {adjuntosN > 0 && (
          <span
            className="rounded bg-white/10 px-1 font-normal text-white/50"
            title={`${adjuntosN} archivo${adjuntosN > 1 ? "s" : ""} adjunto${adjuntosN > 1 ? "s" : ""}`}
          >
            📎 {adjuntosN}
          </span>
        )}
        <span>
          {n} {n === 1 ? "mensaje" : "mensajes"}
        </span>
      </div>

      <div
        ref={cuerpoRef}
        onScroll={alScrollear}
        className="nowheel scroll-fino min-h-0 flex-1 overflow-y-auto pb-2"
      >
        <LimiteError
          resetKey={rev}
          fallback={
            <div className="px-3 py-2 text-left">
              <p className="text-xs text-red-300">
                ⚠ No se pudo mostrar esta conversación.
              </p>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => retryNode(puntaId)}
                  className="mt-2 rounded border border-white/20 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                >
                  ↻ Rehacer
                </button>
              )}
            </div>
          }
        >
          {intercambios.map((ic) => (
            <div
              key={ic.id}
              className="border-b border-white/5 px-3 py-1.5 text-left last:border-0"
            >
              {ic.pregunta && (
                <p className="whitespace-pre-wrap text-xs font-semibold text-white/90">
                  {ic.pregunta}
                </p>
              )}
              <div className="mt-0.5 text-white/70">
                {ic.error ? (
                  <p className="whitespace-pre-wrap text-xs text-red-300">
                    ⚠ {ic.error}
                  </p>
                ) : ic.respuesta != null ? (
                  <>
                    <Markdown>{ic.respuesta}</Markdown>
                    {ic.pending && (
                      <span className="italic text-white/40"> ▍</span>
                    )}
                  </>
                ) : ic.pending ? (
                  <span className="text-xs italic text-white/40">escribiendo…</span>
                ) : (
                  <span className="text-xs italic text-white/40">
                    respuesta pendiente
                  </span>
                )}
              </div>
            </div>
          ))}
        </LimiteError>
      </div>

      {!readOnly && (
        <div
          onPointerDown={onResizeStart}
          onDoubleClick={resetTamano}
          title={
            tamano
              ? "Arrastrá para redimensionar · doble clic para volver al tamaño automático"
              : "Arrastrá para redimensionar"
          }
          // Zona de agarre generosa (transparente) para que el cursor cambie a
          // tiempo al acercarse a la esquina; la manija visible va adentro.
          className="nodrag nowheel absolute bottom-0 right-0 z-20 flex h-7 w-7 cursor-nwse-resize items-end justify-end"
          style={{ transform: `scale(${escalaManija})`, transformOrigin: "bottom right" }}
        >
          <span
            className="h-4 w-4 rounded-tl bg-neutral-900"
            style={{
              backgroundImage:
                "linear-gradient(135deg, transparent 0 45%, rgba(255,255,255,0.65) 45% 55%, transparent 55% 68%, rgba(255,255,255,0.65) 68% 78%, transparent 78%)",
            }}
          />
        </div>
      )}

      <Handle
        type="source"
        id="main"
        position={Position.Bottom}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        id="branch-right"
        position={Position.Right}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        id="branch-left"
        position={Position.Left}
        isConnectable={isConnectable}
      />
    </div>
  );
}
