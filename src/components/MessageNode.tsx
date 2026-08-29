import { useContext } from "react";
import {
  Handle,
  NodeToolbar,
  Position,
  type NodeProps,
} from "@xyflow/react";

import Markdown from "./Markdown";
import { NodeActionsContext } from "./nodeActions";

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
export default function MessageNode({
  id,
  data,
  selected,
  isConnectable,
}: NodeProps) {
  const isRoot = Boolean(data.isRoot);
  const pregunta = String(data.pregunta ?? "");
  const respuesta = data.respuesta ? String(data.respuesta) : null;
  const pending = Boolean(data.pending);
  const error = data.error ? String(data.error) : null;
  const { deleteNode, retryNode } = useContext(NodeActionsContext);

  return (
    <div
      className={`w-[260px] overflow-hidden rounded-md border bg-neutral-900 text-sm ${
        selected ? "border-sky-400 ring-2 ring-sky-400/40" : "border-white/20"
      }`}
    >
      {/* El nodo raíz no se puede eliminar: borrarlo dejaría todo huérfano. */}
      {!isRoot && (
        <NodeToolbar isVisible={selected} position={Position.Top} align="end">
          <button
            type="button"
            onClick={() => deleteNode(id)}
            className="rounded border border-red-400/40 bg-neutral-900 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20"
          >
            🗑 Eliminar
          </button>
        </NodeToolbar>
      )}

      {!isRoot && (
        <Handle type="target" position={Position.Top} isConnectable={isConnectable} />
      )}

      {pregunta && (
        <div className="border-b border-white/10 px-3 py-1.5 text-left font-medium text-white">
          {pregunta}
        </div>
      )}

      {error ? (
        <div className="px-3 py-2 text-left">
          <p className="whitespace-pre-wrap text-xs text-red-300">⚠ {error}</p>
          {respuesta && (
            <div className="mt-1.5 text-white/70">
              <Markdown>{respuesta}</Markdown>
            </div>
          )}
          <button
            type="button"
            onClick={() => retryNode(id)}
            className="mt-2 rounded border border-white/20 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
          >
            ↻ Reintentar
          </button>
        </div>
      ) : (
        <div
          className={`px-3 py-2 text-left ${
            respuesta || pending ? "text-white/90" : "italic text-white/40"
          }`}
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
