"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type OnSelectionChangeParams,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import MessageNode from "./MessageNode";
import Composer, { type BranchKind } from "./Composer";
import { NodeActionsContext } from "./nodeActions";

// Definido a nivel de módulo (no dentro del componente): si React Flow recibe
// un objeto nodeTypes nuevo en cada render, remonta todos los nodos.
const nodeTypes: NodeTypes = { message: MessageNode };

// Nodos de prueba. Todavía sin lógica de IA ni de guardado en .md:
// esto es solo el esqueleto visual del canvas (fase 1, paso 1).
//
// La idea que se quiere dejar clara: el hilo principal baja en vertical
// (tronco) y las ramas salen por el costado, para que ramificar no se lea
// como interrumpir la conversación principal.
const initialNodes: Node[] = [
  {
    id: "1",
    type: "message",
    position: { x: 250, y: 0 },
    data: { label: "Raíz — pregunta inicial", isRoot: true },
  },
  {
    id: "2",
    type: "message",
    position: { x: 250, y: 140 },
    data: { label: "Respuesta de la IA" },
  },
  {
    id: "3",
    type: "message",
    position: { x: 250, y: 300 },
    data: { label: "Siguiente pregunta (hilo principal)" },
    selected: true,
  },
  {
    id: "4",
    type: "message",
    position: { x: 620, y: 190 },
    data: { label: "Rama — sub-pregunta desde la respuesta" },
  },
];

const initialEdges: Edge[] = [
  { id: "e1-2", source: "1", sourceHandle: "main", target: "2" },
  { id: "e2-3", source: "2", sourceHandle: "main", target: "3" },
  { id: "e2-4", source: "2", sourceHandle: "branch", target: "4" },
];

export default function FlowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [activeNodeId, setActiveNodeId] = useState<string | null>("3");

  // Contador de ids para los nodos nuevos (los de prueba van del 1 al 4).
  const nextId = useRef(5);

  const activeNode = nodes.find((n) => n.id === activeNodeId) ?? null;
  const activeNodeLabel = activeNode
    ? String(activeNode.data.label ?? "")
    : null;

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const onSelectionChange = useCallback(
    ({ nodes: selected }: OnSelectionChangeParams) => {
      setActiveNodeId(selected[0]?.id ?? null);
    },
    [],
  );

  // Crea el nodo de pregunta (rol "user") colgando del nodo activo + un nodo
  // placeholder de respuesta (rol "ia") colgando de la pregunta. Todavía sin
  // llamada real a la IA: el nodo "ia" queda como "respuesta pendiente".
  // "main" cuelga hacia abajo (sigue el hilo); "branch" cuelga al costado.
  const handleSubmit = useCallback(
    (text: string, kind: BranchKind) => {
      const parent = nodes.find((n) => n.id === activeNodeId);
      if (!parent) return;

      const userId = String(nextId.current++);
      const iaId = String(nextId.current++);
      const siblings = edges.filter(
        (e) => e.source === parent.id && e.sourceHandle === kind,
      ).length;

      const userPos =
        kind === "main"
          ? { x: parent.position.x + siblings * 40, y: parent.position.y + 160 }
          : {
              x: parent.position.x + 380,
              y: parent.position.y + 40 + siblings * 220,
            };
      const iaPos = { x: userPos.x, y: userPos.y + 140 };

      const userNode: Node = {
        id: userId,
        type: "message",
        position: userPos,
        data: { label: text, rol: "user" },
      };
      const iaNode: Node = {
        id: iaId,
        type: "message",
        position: iaPos,
        data: {
          label: "Respuesta pendiente (IA no conectada)",
          rol: "ia",
          pending: true,
        },
        selected: true,
      };

      setNodes((nds) => [
        ...nds.map((n) => ({ ...n, selected: false })),
        userNode,
        iaNode,
      ]);
      setEdges((eds) => [
        ...eds,
        { id: `e${parent.id}-${userId}`, source: parent.id, sourceHandle: kind, target: userId },
        { id: `e${userId}-${iaId}`, source: userId, sourceHandle: "main", target: iaId },
      ]);
      // El nodo activo pasa a ser la respuesta de la IA: desde ahí se sigue
      // la conversación (o se ramifica).
      setActiveNodeId(iaId);
    },
    [activeNodeId, nodes, edges, setNodes, setEdges],
  );

  // Elimina un nodo y todos sus descendientes. Deja como activo al padre del
  // nodo borrado (marcándolo como seleccionado, así también se resalta).
  const deleteNode = useCallback(
    (id: string) => {
      const allEdges = edges;

      const toRemove = new Set<string>([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const e of allEdges) {
          if (toRemove.has(e.source) && !toRemove.has(e.target)) {
            toRemove.add(e.target);
            changed = true;
          }
        }
      }

      if (
        toRemove.size > 1 &&
        !window.confirm(
          `Se van a eliminar ${toRemove.size} globos: este y todo lo que cuelga de él. ¿Seguir?`,
        )
      ) {
        return;
      }

      const parentId = allEdges.find((e) => e.target === id)?.source ?? null;

      setNodes((nds) =>
        nds
          .filter((n) => !toRemove.has(n.id))
          .map((n) => ({ ...n, selected: n.id === parentId })),
      );
      setEdges((eds) =>
        eds.filter((e) => !toRemove.has(e.source) && !toRemove.has(e.target)),
      );
      setActiveNodeId(parentId);
    },
    [edges, setNodes, setEdges],
  );

  const nodeActions = useMemo(() => ({ deleteNode }), [deleteNode]);

  return (
    <NodeActionsContext.Provider value={nodeActions}>
      <div className="relative h-full w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={onSelectionChange}
          colorMode="dark"
          fitView
        >
          <Background />
          <Controls />
          <MiniMap position="top-right" pannable zoomable />
        </ReactFlow>
        <Composer activeNodeLabel={activeNodeLabel} onSubmit={handleSubmit} />
      </div>
    </NodeActionsContext.Provider>
  );
}
