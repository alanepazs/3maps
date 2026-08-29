"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
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

// Nodos de prueba. Todavía sin lógica de IA ni de guardado en .md.
//
// Un globo = un intercambio (pregunta + respuesta). El hilo principal baja
// en vertical (tronco); las ramas salen por un costado y se pueden pasar de
// derecha a izquierda arrastrándolas.
const initialNodes: Node[] = [
  {
    id: "1",
    type: "message",
    position: { x: 250, y: 0 },
    data: {
      pregunta: "¿Por dónde arranco a estudiar el tema?",
      respuesta: "Arrancá por los fundamentos y después subí de nivel.",
      isRoot: true,
    },
  },
  {
    id: "2",
    type: "message",
    position: { x: 250, y: 220 },
    data: {
      pregunta: "¿Y cómo divido eso en semanas?",
      respuesta: "Semana 1 fundamentos, semana 2 práctica, semana 3 un proyecto.",
    },
    selected: true,
  },
  {
    id: "3",
    type: "message",
    position: { x: 640, y: 60 },
    data: {
      pregunta: "Pará — ¿qué contás como 'fundamentos' exactamente?",
      respuesta: "Los conceptos base sin los que lo demás no se entiende.",
    },
  },
];

const initialEdges: Edge[] = [
  { id: "e1-2", source: "1", sourceHandle: "main", target: "2" },
  { id: "e1-3", source: "1", sourceHandle: "branch-right", target: "3" },
];

const BRANCH_HANDLES = ["branch-left", "branch-right"] as const;

function Flow() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [activeNodeId, setActiveNodeId] = useState<string | null>("2");
  const { getNode } = useReactFlow();

  // Contador de ids para los nodos nuevos (los de prueba van del 1 al 3).
  const nextId = useRef(4);

  const activeNode = nodes.find((n) => n.id === activeNodeId) ?? null;
  const activeNodeLabel = activeNode
    ? String(activeNode.data.pregunta ?? "")
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

  // Crea UN globo (intercambio) colgando del nodo activo. Sin IA: la respuesta
  // queda pendiente. "main" cuelga hacia abajo (sigue el hilo); "branch" nace
  // por la derecha (después se puede arrastrar a la izquierda).
  const handleSubmit = useCallback(
    (text: string, kind: BranchKind) => {
      const parent = nodes.find((n) => n.id === activeNodeId);
      if (!parent) return;

      const id = String(nextId.current++);
      const sourceHandle = kind === "main" ? "main" : "branch-right";
      const siblings = edges.filter((e) => {
        if (e.source !== parent.id) return false;
        return kind === "main"
          ? e.sourceHandle === "main"
          : e.sourceHandle === "branch-left" || e.sourceHandle === "branch-right";
      }).length;

      const position =
        kind === "main"
          ? { x: parent.position.x + siblings * 40, y: parent.position.y + 240 }
          : {
              x: parent.position.x + 400,
              y: parent.position.y + siblings * 220,
            };

      const newNode: Node = {
        id,
        type: "message",
        position,
        data: { pregunta: text, respuesta: null, pending: true },
        selected: true,
      };

      setNodes((nds) => [
        ...nds.map((n) => ({ ...n, selected: false })),
        newNode,
      ]);
      setEdges((eds) => [
        ...eds,
        { id: `e${parent.id}-${id}`, source: parent.id, sourceHandle, target: id },
      ]);
      setActiveNodeId(id);
    },
    [activeNodeId, nodes, edges, setNodes, setEdges],
  );

  // Al soltar un globo arrastrado: si es una rama, reconectar la flecha al
  // costado (izquierda/derecha) del padre según dónde quedó el globo.
  const onNodeDragStop = useCallback(
    (_evt: unknown, node: Node) => {
      setEdges((eds) =>
        eds.map((e) => {
          if (e.target !== node.id) return e;
          if (!BRANCH_HANDLES.includes(e.sourceHandle as never)) return e;
          const parent = getNode(e.source);
          if (!parent) return e;
          const side =
            node.position.x < parent.position.x ? "branch-left" : "branch-right";
          return e.sourceHandle === side ? e : { ...e, sourceHandle: side };
        }),
      );
    },
    [getNode, setEdges],
  );

  // Elimina un nodo y todos sus descendientes. Deja como activo al padre.
  const deleteNode = useCallback(
    (id: string) => {
      const toRemove = new Set<string>([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const e of edges) {
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

      const parentId = edges.find((e) => e.target === id)?.source ?? null;

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
          onNodeDragStop={onNodeDragStop}
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

export default function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
