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

import LimiteError from "./LimiteError";
import Markdown from "./Markdown";
import { NodeActionsContext } from "./nodeActions";
import {
  ALTO_COLAPSADO,
  LIMITE_COLAPSO,
  guardarExpandido,
  leerExpandido,
} from "./vista";

// Límites y default del redimensionado manual (px, coords del lienzo).
type Tamano = { w: number; h: number };
const TAMANO_MIN: Tamano = { w: 200, h: 80 };
const TAMANO_MAX: Tamano = { w: 900, h: 1200 };
const ANCHO_POR_DEFECTO = 260;

// Un globo = un intercambio completo: la pregunta (encabezado) + la respuesta
// de la IA (cuerpo).
//
// Estados del cuerpo:
//   - pending   → "escribiendo…" + lo que va llegando (streaming)
//   - error     → recuadro rojo + botón "↻ Reintentar"
//   - respuesta → el texto
//   - nada      → "Respuesta pendiente"
//
// Handles:
//   - target (arriba)              : de dónde viene (el nodo raíz no lo tiene)
//   - source "main" (abajo)        : continuar el hilo principal, siempre vertical
//   - source "branch-right/-left"  : ramificar por un costado (se elige al arrastrar)
//
// Tamaño (fase 3.10): manija ◢ abajo a la derecha para redimensionar; el tamaño
// (`data.ancho/alto`) va al `.md` → sincroniza entre dispositivos. Redimensionar
// a mano desactiva el colapso automático de 3.1 para ese globo (doble clic en la
// manija o botón "↔ Auto" para volver al tamaño automático).
export default function MessageNode({
  id,
  data,
  selected,
  isConnectable,
}: NodeProps) {
  const isRoot = Boolean(data.isRoot);
  const sinHijos = Boolean(data.sinHijos);
  const pregunta = String(data.pregunta ?? "");
  const respuesta = data.respuesta ? String(data.respuesta) : null;
  const pending = Boolean(data.pending);
  const error = data.error ? String(data.error) : null;
  const { deleteNode, retryNode, stopNode, openNode, resizeNode, readOnly } =
    useContext(NodeActionsContext);
  const { getZoom } = useReactFlow();
  // Zoom del lienzo (re-render solo al cambiar el zoom, no al panear). Se usa
  // para contra-escalar la manija de resize: con zoom out el globo se achica en
  // pantalla y la manija quedaría sub-píxel e imposible de agarrar.
  const zoomLienzo = useStore((s) => s.transform[2]);
  const escalaManija = Math.min(4, Math.max(1, 1 / (zoomLienzo || 1)));

  // Vista colapsada / expandida (fase 3.1). Preferencia por globo, no va al `.md`.
  const largoRespuesta = respuesta?.length ?? 0;
  const colapsable = !pending && largoRespuesta > LIMITE_COLAPSO;
  const [override, setOverride] = useState<boolean | undefined>(() =>
    leerExpandido(id),
  );
  const expandido = override ?? !colapsable;

  // Tamaño manual (fase 3.10). Guardado en `data.ancho/alto` (va al `.md`). Durante
  // el arrastre se usa `drag` (estado local, fluido); al soltar → `resizeNode`.
  const anchoData = typeof data.ancho === "number" ? data.ancho : null;
  const altoData = typeof data.alto === "number" ? data.alto : null;
  const [drag, setDrag] = useState<Tamano | null>(null);
  const tamano: Tamano | undefined =
    drag ?? (anchoData && altoData ? { w: anchoData, h: altoData } : undefined);
  const rootRef = useRef<HTMLDivElement>(null);

  // Mientras streamea, el globo arranca chico (no crece con el texto, no empuja
  // el layout) y scrollea solo al fondo. El usuario puede expandirlo (override).
  const modoStream = pending && !tamano && override !== true;
  const modoColapsadoFinal = colapsable && !expandido && !tamano;
  const mostrarColapsado = modoStream || modoColapsadoFinal;
  const alternarExpandido = () => {
    const nuevo = !expandido;
    setOverride(nuevo);
    guardarExpandido(id, nuevo);
  };

  // Auto-scroll al fondo del cuerpo mientras entra texto en modo streaming.
  const cuerpoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (modoStream && cuerpoRef.current) {
      cuerpoRef.current.scrollTop = cuerpoRef.current.scrollHeight;
    }
  }, [respuesta, modoStream]);

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
      let ultimo: Tamano | undefined;
      const onMove = (ev: PointerEvent) => {
        const w = Math.min(
          TAMANO_MAX.w,
          Math.max(TAMANO_MIN.w, startW + (ev.clientX - startX) / zoom),
        );
        const h = Math.min(
          TAMANO_MAX.h,
          Math.max(TAMANO_MIN.h, startH + (ev.clientY - startY) / zoom),
        );
        ultimo = { w: Math.round(w), h: Math.round(h) };
        setDrag(ultimo);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (ultimo) resizeNode(id, ultimo.w, ultimo.h);
        setDrag(null);
        // Tragarse el `click` sintético post-drag (si no, deselecciona el globo).
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
      style={{ width: tamano?.w ?? ANCHO_POR_DEFECTO, height: tamano?.h }}
      className={`relative flex flex-col overflow-hidden rounded-md border bg-neutral-900 text-sm ${
        selected ? "border-sky-400 ring-2 ring-sky-400/40" : "border-white/20"
      }`}
    >
      {/* Mientras streamea: badge de lápiz "escribiendo" + STOP, flotando sobre
          el borde del globo (el globo tiene overflow-hidden → va en un
          NodeToolbar, que se renderiza afuera). */}
      <NodeToolbar
        isVisible={pending && !readOnly}
        position={Position.Top}
        align="start"
      >
        <div className="flex items-center gap-1 rounded-md border border-white/15 bg-neutral-900 px-1.5 py-1 shadow-lg">
          <span className="lapiz-escribiendo text-sm leading-none" aria-hidden>
            ✏️
          </span>
          <button
            type="button"
            onClick={() => stopNode(id)}
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
          {/* Volver a pedir la respuesta — para regenerar, o para recuperar una
              llamada que quedó a medias / estática (fase 3). */}
          {!readOnly && (
            <button
              type="button"
              onClick={() => retryNode(id)}
              className="rounded border border-white/20 bg-neutral-900 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
              title="Volver a pedir la respuesta"
            >
              ↻ Rehacer
            </button>
          )}
          {colapsable && !tamano && (
            <button
              type="button"
              onClick={alternarExpandido}
              className="rounded border border-white/20 bg-neutral-900 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
            >
              {expandido ? "⌃ Colapsar" : "⌄ Expandir"}
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
          {/* La raíz solo se puede borrar si ya no le cuelga nada (fase 3.6):
              borrarla con hijos dejaría todo huérfano. En árbol compartido
              (readOnly) no se borra nada. */}
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
        <Handle type="target" position={Position.Top} isConnectable={isConnectable} />
      )}

      {pregunta && (
        <div className="relative z-10 shrink-0 border-b border-white/10 bg-neutral-900 px-3 py-1.5 text-left font-medium text-white">
          {pregunta}
        </div>
      )}

      <div
        className={
          tamano
            ? "nowheel scroll-fino min-h-0 flex-1 overflow-auto pb-3"
            : "min-h-0"
        }
      >
       <LimiteError
        resetKey={respuesta}
        fallback={
          <div className="px-3 py-2 text-left">
            <p className="text-xs text-red-300">
              ⚠ No se pudo mostrar esta respuesta.
            </p>
            {!readOnly && (
              <button
                type="button"
                onClick={() => retryNode(id)}
                className="mt-2 rounded border border-white/20 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
              >
                ↻ Rehacer
              </button>
            )}
          </div>
        }
       >
        {error ? (
          <div className="px-3 py-2 text-left">
            <p className="whitespace-pre-wrap text-xs text-red-300">⚠ {error}</p>
            {respuesta && (
              <div className="mt-1.5 text-white/70">
                <Markdown>{respuesta}</Markdown>
              </div>
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={() => retryNode(id)}
                className="mt-2 rounded border border-white/20 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
              >
                ↻ Reintentar
              </button>
            )}
          </div>
        ) : (
          <div
            className={`relative px-3 py-2 text-left ${
              respuesta || pending ? "text-white/90" : "italic text-white/40"
            }`}
          >
            <div
              ref={cuerpoRef}
              className={
                modoStream
                  ? "scroll-fino nowheel overflow-y-auto"
                  : modoColapsadoFinal
                    ? "overflow-hidden"
                    : undefined
              }
              style={
                mostrarColapsado ? { maxHeight: ALTO_COLAPSADO } : undefined
              }
            >
              {respuesta != null && <Markdown>{respuesta}</Markdown>}
              {pending &&
                (respuesta ? (
                  <span className="italic text-white/40"> ▍</span>
                ) : (
                  <span className="italic text-white/40">escribiendo…</span>
                ))}
              {respuesta == null && !pending && "Respuesta pendiente"}
            </div>
            {modoColapsadoFinal && (
              <button
                type="button"
                onClick={alternarExpandido}
                className="nodrag absolute inset-x-0 bottom-0 flex items-end justify-center bg-gradient-to-t from-neutral-900 via-neutral-900/85 to-transparent pb-1 pt-10 text-xs text-sky-300 hover:text-sky-200"
              >
                ⌄ ver más
              </button>
            )}
            {modoStream && respuesta != null && (
              <button
                type="button"
                onClick={() => setOverride(true)}
                className="nodrag mt-1 text-[11px] text-sky-300 hover:text-sky-200"
              >
                ⌄ ver todo mientras escribe
              </button>
            )}
          </div>
        )}
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
          className="nodrag nowheel absolute bottom-0 right-0 z-20 h-4 w-4 cursor-nwse-resize rounded-tl bg-neutral-900"
          style={{
            transform: `scale(${escalaManija})`,
            transformOrigin: "bottom right",
            backgroundImage:
              "linear-gradient(135deg, transparent 0 45%, rgba(255,255,255,0.65) 45% 55%, transparent 55% 68%, rgba(255,255,255,0.65) 68% 78%, transparent 78%)",
          }}
        />
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
