import { useContext, useState } from "react";
import {
  Handle,
  NodeToolbar,
  Position,
  type NodeProps,
} from "@xyflow/react";

import Markdown from "./Markdown";
import { NodeActionsContext } from "./nodeActions";
import { ALTO_COLAPSADO, LIMITE_COLAPSO, guardarExpandido, leerExpandido } from "./vista";

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
  const sinHijos = Boolean(data.sinHijos);
  const pregunta = String(data.pregunta ?? "");
  const respuesta = data.respuesta ? String(data.respuesta) : null;
  const pending = Boolean(data.pending);
  const error = data.error ? String(data.error) : null;
  const { deleteNode, retryNode, openNode, readOnly } =
    useContext(NodeActionsContext);

  // Vista colapsada / expandida (fase 3.1). Preferencia por globo, no va al `.md`.
  // Mientras streamea se muestra completo; el tope aplica recién con la respuesta
  // final larga.
  const largoRespuesta = respuesta?.length ?? 0;
  const colapsable = !pending && largoRespuesta > LIMITE_COLAPSO;
  const [override, setOverride] = useState<boolean | undefined>(() =>
    leerExpandido(id),
  );
  const expandido = override ?? !colapsable;
  const mostrarColapsado = colapsable && !expandido;
  const alternarExpandido = () => {
    const nuevo = !expandido;
    setOverride(nuevo);
    guardarExpandido(id, nuevo);
  };

  return (
    <div
      className={`w-[260px] overflow-hidden rounded-md border bg-neutral-900 text-sm ${
        selected ? "border-sky-400 ring-2 ring-sky-400/40" : "border-white/20"
      }`}
    >
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
          {colapsable && (
            <button
              type="button"
              onClick={alternarExpandido}
              className="rounded border border-white/20 bg-neutral-900 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
            >
              {expandido ? "⌃ Colapsar" : "⌄ Expandir"}
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
            className={mostrarColapsado ? "overflow-hidden" : undefined}
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
          {mostrarColapsado && (
            <button
              type="button"
              onClick={alternarExpandido}
              className="nodrag absolute inset-x-0 bottom-0 flex items-end justify-center bg-gradient-to-t from-neutral-900 via-neutral-900/85 to-transparent pb-1 pt-10 text-xs text-sky-300 hover:text-sky-200"
            >
              ⌄ ver más
            </button>
          )}
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
