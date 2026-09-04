"use client";

import { NodeToolbar, Position } from "@xyflow/react";

import { COLORES_GLOBO, type ColorGlobo } from "@/model/intercambio";
import { COLOR_GLOBO_HEX } from "./colores";

// Toolbar única para varios globos seleccionados (B3). Reemplaza a las
// `NodeToolbar` por-globo (que con selección múltiple se apilarían — ver
// `MessageNode`, `variosSeleccionados`). `nodeId` = array → React Flow la
// posiciona sobre el bounding box del grupo. Acciones que tienen sentido en
// lote: eliminar todos, pintar todos.
type Props = {
  ids: string[];
  onEliminar: (ids: string[]) => void;
  onColor: (ids: string[], color: ColorGlobo | null) => void;
};

export default function ToolbarGrupo({ ids, onEliminar, onColor }: Props) {
  if (ids.length < 2) return null;
  return (
    <NodeToolbar nodeId={ids} isVisible position={Position.Top}>
      <div className="flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={() => onEliminar(ids)}
          className="rounded border border-danger/40 bg-surface px-2 py-1 text-xs text-danger hover:bg-red-500/20"
        >
          🗑 Eliminar {ids.length}
        </button>
        <div className="flex items-center gap-1 rounded border border-line-strong bg-surface px-1.5 py-1">
          {COLORES_GLOBO.map((c) => (
            <button
              key={c}
              type="button"
              title={`Pintar los ${ids.length} globos`}
              onClick={() => onColor(ids, c)}
              className="h-3.5 w-3.5 rounded-full border border-line-strong"
              style={{ backgroundColor: COLOR_GLOBO_HEX[c] }}
            />
          ))}
          <button
            type="button"
            title="Sacar el color de los seleccionados"
            onClick={() => onColor(ids, null)}
            className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-line-strong text-[9px] leading-none text-text-faint hover:text-text"
          >
            ✕
          </button>
        </div>
      </div>
    </NodeToolbar>
  );
}
