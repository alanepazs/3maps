import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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

import { COLOR_GLOBO_HEX } from "./colores";
import { arrastrarConCaptura } from "./gestos";
import LimiteError from "./LimiteError";
import Markdown from "./Markdown";
import { NodeActionsContext } from "./nodeActions";
import { ALTO_BASE_GLOBO } from "./settings";
import {
  COLORES_GLOBO,
  type ColorGlobo,
  type Intercambio,
} from "@/model/intercambio";

const esColorGlobo = (v: unknown): v is ColorGlobo =>
  typeof v === "string" && (COLORES_GLOBO as readonly string[]).includes(v);

// Límites y default del redimensionado manual (px, coords del lienzo).
type Tamano = { w: number; h: number };
const TAMANO_MIN: Tamano = { w: 200, h: 80 };
const TAMANO_MAX: Tamano = { w: 900, h: 1200 };
const ANCHO_POR_DEFECTO = 260;

// Cuerpo scrolleable del tramo — la transcripción. Memoizado por `rev` (firma
// corta del tramo, incluye largo de cada respuesta / pending / error) + `readOnly`.
// `rev` estable = mismo contenido → no se re-renderiza al mover el globo, panear,
// cambiar el zoom, etc. Sin esto react-markdown re-parseaba todo el tramo por
// frame durante el drag (B8: ~5 fps).
const CuerpoTramo = memo(
  function CuerpoTramo({
    intercambios,
    rev,
    readOnly,
    onRehacer,
  }: {
    intercambios: Intercambio[];
    rev: string;
    readOnly: boolean;
    onRehacer: () => void;
  }) {
    return (
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
                onClick={onRehacer}
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
                  {ic.pending && <span className="italic text-white/40"> ▍</span>}
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
    );
  },
  (a, b) => a.rev === b.rev && a.readOnly === b.readOnly,
);

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
  const color: ColorGlobo | null = esColorGlobo(data.color) ? data.color : null;

  const {
    deleteNode,
    retryNode,
    stopNode,
    openNode,
    resizeNode,
    colorNode,
    readOnly,
    crecimientoPx,
    crecimientoTope,
  } = useContext(NodeActionsContext);
  const { getZoom } = useReactFlow();
  // Zoom del lienzo (re-render solo al cambiar el zoom, no al panear) para
  // contra-escalar la manija de resize (con zoom out quedaría sub-píxel).
  const zoomLienzo = useStore((s) => s.transform[2]);
  const escalaManija = Math.min(4, Math.max(1, 1 / (zoomLienzo || 1)));

  // ¿Hay más de un globo seleccionado? Con selección múltiple, cada globo NO
  // muestra su toolbar (se apilarían) — la maneja la toolbar compartida de
  // `FlowCanvas`. Re-render solo cuando el booleano cambia.
  const variosSeleccionados = useStore((s) => {
    let n = 0;
    for (const nodo of s.nodes) {
      if (nodo.selected && ++n > 1) return true;
    }
    return false;
  });

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
  // El scroll que hacemos nosotros dispara un evento `scroll` → `alScrollear`
  // veía "no está en el fondo" (el markdown recién crecido) y apagaba `pegado`
  // a mitad del stream (B9). Marca los scrolls propios para ignorarlos.
  const autoScroll = useRef(false);
  useEffect(() => {
    pegado.current = true;
  }, [puntaId]);
  useLayoutEffect(() => {
    if (!pending || !pegado.current) return;
    const el = cuerpoRef.current;
    if (!el) return;
    autoScroll.current = true;
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => {
      autoScroll.current = false;
    });
  }, [rev, pending]);
  const alScrollear = () => {
    if (autoScroll.current) return;
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
      arrastrarConCaptura(
        e,
        (ev) => {
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
        },
        () => {
          if (ultimoT) resizeNode(id, ultimoT.w, ultimoT.h);
          setDrag(null);
        },
      );
    },
    [getZoom, id, resizeNode],
  );

  const resetTamano = useCallback(() => {
    setDrag(null);
    resizeNode(id, null, null);
  }, [id, resizeNode]);

  // Estable mientras `rev` no cambie (`puntaId` sale del último id del tramo,
  // que va en `rev`) → `CuerpoTramo` puede memoizar por `rev`/`readOnly` (B8).
  const rehacerPunta = useCallback(
    () => retryNode(puntaId),
    [retryNode, puntaId],
  );

  return (
    <div
      ref={rootRef}
      style={{
        width: tamano?.w ?? ANCHO_POR_DEFECTO,
        height: tamano?.h ?? altoTramo,
      }}
      className="relative text-sm"
    >
      {/* Mientras la punta streamea: badge de lápiz + STOP, flotando a la
          izquierda (la tarjeta tiene overflow-hidden → NodeToolbar se renderiza afuera). */}
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

      <NodeToolbar
        isVisible={selected && !variosSeleccionados}
        position={Position.Top}
        align="end"
      >
        <div className="flex flex-col items-end gap-1.5">
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
          {/* Paleta de color del globo (B1). Click en el color actual lo saca. */}
          {!readOnly && (
            <div className="flex items-center gap-1 rounded border border-white/20 bg-neutral-900 px-1.5 py-1">
              {COLORES_GLOBO.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => colorNode(id, color === c ? null : c)}
                  title={color === c ? "Sacar el color" : `Marcar de ${c}`}
                  aria-label={`Color ${c}`}
                  aria-pressed={color === c}
                  className={`h-3.5 w-3.5 rounded-full transition-transform ${
                    color === c
                      ? "ring-2 ring-white ring-offset-1 ring-offset-neutral-900"
                      : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: COLOR_GLOBO_HEX[c] }}
                />
              ))}
              <button
                type="button"
                onClick={() => colorNode(id, null)}
                title="Sin color"
                aria-label="Sin color"
                className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/25 text-[9px] leading-none text-white/45 hover:text-white/90"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </NodeToolbar>

      {/* La tarjeta visible: se clippea a sí misma (rounded + overflow). La
          manija de resize y las NodeToolbar viven FUERA de este clip. */}
      <div
        className={`absolute inset-0 flex flex-col overflow-hidden rounded-md border bg-neutral-900 ${
          selected ? "border-sky-400 ring-2 ring-sky-400/40" : "border-white/20"
        }`}
      >
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
          {/* Color del globo (B1): punto en la esquina sup-derecha del header. */}
          {color && (
            <span
              aria-hidden
              className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full ring-1 ring-black/40"
              style={{ backgroundColor: COLOR_GLOBO_HEX[color] }}
            />
          )}
        </div>

        <div
          ref={cuerpoRef}
          onScroll={alScrollear}
          className="nowheel scroll-fino min-h-0 flex-1 overflow-y-auto pb-2"
        >
          <CuerpoTramo
            intercambios={intercambios}
            rev={rev}
            readOnly={readOnly}
            onRehacer={rehacerPunta}
          />
        </div>

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

      {/* Manija ◢ — FUERA de la tarjeta clippeada, y colgando unos px por fuera
          de la esquina para que el cursor `nwse-resize` agarre justo en el borde
          visible. Antes vivía dentro del `overflow-hidden` + `rounded-md` de la
          tarjeta → el borde y la esquina redondeada dejaban una banda de ~2-6px
          con cursor de pan ("manito") antes de llegar a la manija. */}
      {!readOnly && (
        <div
          onPointerDown={onResizeStart}
          onDoubleClick={resetTamano}
          onClick={(e) => e.stopPropagation()}
          title={
            tamano
              ? "Arrastrá para redimensionar · doble clic para volver al tamaño automático"
              : "Arrastrá para redimensionar"
          }
          // Zona de agarre generosa (transparente) para que el cursor cambie a
          // tiempo al acercarse a la esquina; la manija visible va adentro.
          className="nodrag nowheel absolute -bottom-1 -right-1 z-20 flex h-7 w-7 cursor-nwse-resize items-end justify-end"
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
    </div>
  );
}
