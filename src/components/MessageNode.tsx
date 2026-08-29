import { useContext } from "react";
import {
  Handle,
  NodeToolbar,
  Position,
  type NodeProps,
} from "@xyflow/react";

import { NodeActionsContext } from "./nodeActions";

// Nodo de mensaje del árbol. Todavía sin diseño real: solo lo mínimo
// para dejar clara la mecánica de handles y el estado "activo".
//
//   - target  (arriba)          : de dónde viene este mensaje
//                                 (el nodo raíz no lo tiene: no tiene padre)
//   - source  "main"  (abajo)    : continuar el hilo principal hacia abajo
//   - source  "branch" (costado) : ramificar una sub-pregunta sin desviar el tronco
export default function MessageNode({
  id,
  data,
  selected,
  isConnectable,
}: NodeProps) {
  const isRoot = Boolean(data.isRoot);
  const pending = Boolean(data.pending);
  const { deleteNode } = useContext(NodeActionsContext);

  return (
    <div
      className={`min-w-[160px] max-w-[260px] rounded-md border bg-neutral-900 px-4 py-2 text-center text-sm transition-colors ${
        pending ? "italic text-white/40" : "text-white"
      } ${selected ? "border-sky-400 ring-2 ring-sky-400/40" : "border-white/20"}`}
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
      {String(data.label ?? "")}
      <Handle
        type="source"
        id="main"
        position={Position.Bottom}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        id="branch"
        position={Position.Right}
        isConnectable={isConnectable}
      />
    </div>
  );
}
