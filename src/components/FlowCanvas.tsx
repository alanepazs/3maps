"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  SelectionMode,
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
import SettingsPanel from "./SettingsPanel";
import { NodeActionsContext } from "./nodeActions";
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  type Settings,
} from "./settings";
import { useNodeInertia } from "./useNodeInertia";
import { usePanInertia } from "./usePanInertia";

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
  const { getNode, getViewport, setViewport } = useReactFlow();

  // Ajustes configurables (tuerquita). En el server no hay localStorage, así
  // que se usan los defaults; en el cliente se leen los guardados. No hay
  // mismatch de hidratación porque el panel arranca cerrado y nada del render
  // inicial depende de estos valores.
  const [settings, setSettings] = useState<Settings>(() => {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      return raw
        ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
        : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignorar: no se pudo persistir
      }
      return next;
    });
  }, []);

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

  // Cuando un globo queda quieto (al soltarlo, o al frenar el envión): si es
  // una rama, reconectar la flecha al costado (izquierda/derecha) del padre
  // según dónde quedó.
  const finalizeBranchSide = useCallback(
    (nodeId: string) => {
      setEdges((eds) =>
        eds.map((e) => {
          if (e.target !== nodeId) return e;
          if (!BRANCH_HANDLES.includes(e.sourceHandle as never)) return e;
          const child = getNode(nodeId);
          const parent = getNode(e.source);
          if (!child || !parent) return e;
          const side =
            child.position.x < parent.position.x ? "branch-left" : "branch-right";
          return e.sourceHandle === side ? e : { ...e, sourceHandle: side };
        }),
      );
    },
    [getNode, setEdges],
  );

  // Envión / inercia al soltar, tipo Obsidian Canvas.
  const {
    onNodeDragStart: nodeInertiaDragStart,
    onNodeDrag,
    onNodeDragStop,
    onSelectionDragStart,
    onSelectionDrag,
    onSelectionDragStop,
    cancelInertia,
  } = useNodeInertia(setNodes, finalizeBranchSide, settings.inertia);

  // Envión también al mover el plano del fondo con la manito.
  const { onMoveStart, onMove, onMoveEnd, cancelPanInertia } = usePanInertia(
    setViewport,
    getViewport,
    settings.inertia,
  );

  const onNodeDragStart = useCallback(() => {
    cancelPanInertia();
    nodeInertiaDragStart();
  }, [cancelPanInertia, nodeInertiaDragStart]);

  // Modo de interacción:
  //   - por defecto: manito → arrastrar el fondo hace pan (con envión).
  //   - con la barra espaciadora apretada: puntero → arrastrar el fondo hace un
  //     recuadro de selección (varios globos).
  //   - en ambos modos, arrastrar un globo lo mueve.
  const [spaceHeld, setSpaceHeld] = useState(false);
  useEffect(() => {
    const isEditable = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !isEditable(e.target)) {
        e.preventDefault(); // que no scrollee la página
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    const onBlur = () => setSpaceHeld(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Elimina un nodo y todos sus descendientes. Deja como activo al padre.
  const deleteNode = useCallback(
    (id: string) => {
      cancelInertia();
      cancelPanInertia();
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
    [cancelInertia, cancelPanInertia, edges, setNodes, setEdges],
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
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onSelectionDragStart={onSelectionDragStart}
          onSelectionDrag={onSelectionDrag}
          onSelectionDragStop={onSelectionDragStop}
          onMoveStart={onMoveStart}
          onMove={onMove}
          onMoveEnd={onMoveEnd}
          onNodeClick={() => cancelInertia()}
          onSelectionChange={onSelectionChange}
          panOnDrag={!spaceHeld}
          selectionOnDrag={spaceHeld}
          selectionMode={SelectionMode.Partial}
          selectionKeyCode={null}
          panActivationKeyCode={null}
          nodeDragThreshold={3}
          colorMode="dark"
          fitView
        >
          <Background />
          <Controls />
          <MiniMap position="top-right" pannable zoomable />
        </ReactFlow>
        <SettingsPanel settings={settings} onChange={updateSettings} />
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
