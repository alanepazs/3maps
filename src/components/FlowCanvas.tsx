"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  SelectionMode,
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
import {
  agregar,
  arbolAVista,
  arbolInicial,
  buscar,
  conPosicion,
  conRama,
  crearIntercambio,
  descendientes,
  hijos,
  nuevoId,
  quitarSubarbol,
  reparentar,
  type Arbol,
  type Rama,
} from "@/model/intercambio";
import { cargarArbol, guardarArbol } from "@/model/persistencia";

// Definido a nivel de módulo (no dentro del componente): si React Flow recibe
// un objeto nodeTypes nuevo en cada render, remonta todos los nodos.
const nodeTypes: NodeTypes = { message: MessageNode };

// Comparación shallow del `data` de un nodo (pregunta/respuesta/pending/isRoot).
function datosIguales(a: Node["data"], b: Node["data"]): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return (
    ka.length === kb.length &&
    ka.every(
      (k) =>
        (a as Record<string, unknown>)[k] ===
        (b as Record<string, unknown>)[k],
    )
  );
}

function Flow() {
  // ── Fuente de la verdad ──────────────────────────────────────────────────
  // El árbol de intercambios manda. Los nodos/edges de React Flow se derivan de
  // él (`arbolAVista`); las posiciones vuelven al árbol al soltar / frenar el
  // envión (`asentar`). Ver docs/arquitectura.md.
  //
  // SSR-safe: el primer render (server + hidratación) usa SIEMPRE la semilla
  // determinística. El árbol persistido en `localStorage` se carga después del
  // montaje (`useEffect` de abajo) — leerlo durante el render rompería la
  // hidratación.
  const semilla = useMemo(() => arbolInicial(), []);
  const activoIniId = semilla.intercambios.at(-1)?.id ?? null;
  const vistaIni = useMemo(() => {
    const v = arbolAVista(semilla);
    return {
      // Marcar seleccionado el activo inicial: si no, React Flow arranca sin
      // selección y `onSelectionChange` pisa el activo con null en el montaje.
      nodes: v.nodes.map((n) =>
        n.id === activoIniId ? { ...n, selected: true } : n,
      ),
      edges: v.edges,
    };
  }, [semilla, activoIniId]);

  const [arbol, setArbol] = useState<Arbol>(semilla);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(vistaIni.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(vistaIni.edges);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(activoIniId);
  // `true` una vez que se cargó el árbol persistido: recién ahí se empieza a
  // guardar (si no, el primer effect pisaría lo guardado con la semilla).
  const [listo, setListo] = useState(false);
  // Id a seleccionar tras la próxima reconstrucción de la vista (globo recién
  // creado, o el padre tras un borrado). null = mantener la selección actual.
  const seleccionarLuegoRef = useRef<string | null>(null);
  const { getNode, getViewport, setViewport, fitView } = useReactFlow();

  // Hidratar desde localStorage después del montaje. Es el patrón recomendado
  // para estado local-first en SSR: el primer render coincide con el server
  // (semilla) y acá se cambia al árbol persistido. El setState en effect es
  // intencional y corre una sola vez.
  useEffect(() => {
    const guardado = cargarArbol();
    const ultimo = guardado.intercambios.at(-1)?.id ?? null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación local-first, corre una vez
    setArbol(guardado);
    setActiveNodeId((cur) =>
      guardado.intercambios.some((i) => i.id === cur) ? cur : ultimo,
    );
    seleccionarLuegoRef.current = ultimo;
    setListo(true);
  }, []);

  // `fitView` inicial (prop) fitea a la semilla; re-fitear al árbol cargado.
  useEffect(() => {
    if (!listo) return;
    const t = setTimeout(() => void fitView({ duration: 200 }), 0);
    return () => clearTimeout(t);
  }, [listo, fitView]);

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

  // Persistir el árbol en cada cambio (recién después de cargar lo guardado).
  useEffect(() => {
    if (listo) guardarArbol(arbol);
  }, [arbol, listo]);

  // Reconstruir la vista (nodos/edges) cuando cambia el contenido o la
  // estructura del árbol — NO en cada movimiento: `x`/`y` quedan fuera de la
  // firma, así arrastrar un globo no dispara un rebuild.
  const firma = useMemo(
    () =>
      JSON.stringify(
        arbol.intercambios.map((i) => [
          i.id,
          i.padreId,
          i.rama,
          i.proveedor,
          i.fecha,
          i.pregunta,
          i.respuesta,
          i.pending,
        ]),
      ),
    [arbol],
  );
  useEffect(() => {
    // Hasta cargar lo guardado, `nodes`/`edges` ya salen de la semilla
    // (`vistaIni`). Evita consumir `seleccionarLuegoRef` en el montaje.
    if (!listo) return;
    const vista = arbolAVista(arbol);
    const forzar = seleccionarLuegoRef.current;
    seleccionarLuegoRef.current = null;

    // Reconciliar preservando identidad: los nodos que no cambiaron mantienen
    // su objeto (y su posición viva), así React Flow no los vuelve a medir
    // (evita el parpadeo / visibility:hidden en cada alta/baja).
    setNodes((prev) => {
      const previos = new Map(prev.map((n) => [n.id, n]));
      let cambio = prev.length !== vista.nodes.length;
      const next = vista.nodes.map((fresco) => {
        const antes = previos.get(fresco.id);
        const selected =
          forzar !== null ? fresco.id === forzar : antes?.selected ?? false;
        if (!antes) {
          cambio = true;
          return { ...fresco, selected };
        }
        if (selected === antes.selected && datosIguales(antes.data, fresco.data)) {
          return antes;
        }
        cambio = true;
        return { ...antes, data: fresco.data, selected };
      });
      return cambio ? next : prev;
    });

    setEdges((prev) => {
      const previos = new Map(prev.map((e) => [e.id, e]));
      let cambio = prev.length !== vista.edges.length;
      const next = vista.edges.map((fresco) => {
        const antes = previos.get(fresco.id);
        if (
          antes &&
          antes.source === fresco.source &&
          antes.target === fresco.target &&
          antes.sourceHandle === fresco.sourceHandle
        ) {
          return antes;
        }
        cambio = true;
        return fresco;
      });
      return cambio ? next : prev;
    });
    // `firma` resume el árbol sin x/y; setNodes/setEdges son estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, listo]);

  const activeNode = buscar(arbol, activeNodeId ?? "");
  const activeNodeLabel = activeNode ? activeNode.pregunta : null;

  // Conectar handles a mano = reparentar el target (con guarda anti-ciclo).
  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target) return;
    const rama = (c.sourceHandle as Rama | null) ?? "main";
    setArbol((a) =>
      reparentar(a, c.target as string, c.source as string, rama),
    );
  }, []);

  const onSelectionChange = useCallback(
    ({ nodes: sel }: OnSelectionChangeParams) => {
      setActiveNodeId(sel[0]?.id ?? null);
    },
    [],
  );

  // Crea UN globo (intercambio) colgando del nodo activo. Sin IA: la respuesta
  // queda pendiente. "main" cuelga hacia abajo (sigue el hilo); "branch" nace
  // por la derecha (después se puede arrastrar a la izquierda).
  const handleSubmit = useCallback(
    (text: string, kind: BranchKind) => {
      if (!activeNodeId) return;
      const id = nuevoId();
      seleccionarLuegoRef.current = id;
      setArbol((a) => {
        const parent = buscar(a, activeNodeId);
        if (!parent) return a;
        const rama: Rama = kind === "main" ? "main" : "branch-right";
        const hermanos = hijos(a, parent.id).filter((h) =>
          kind === "main" ? h.rama === "main" : h.rama !== "main",
        ).length;
        const pos =
          kind === "main"
            ? { x: parent.x + hermanos * 40, y: parent.y + 240 }
            : { x: parent.x + 400, y: parent.y + hermanos * 220 };
        return agregar(
          a,
          crearIntercambio({
            id,
            padreId: parent.id,
            rama,
            pregunta: text,
            x: pos.x,
            y: pos.y,
          }),
        );
      });
      setActiveNodeId(id);
    },
    [activeNodeId],
  );

  // Al soltar / frenar el envión: escribir la posición final al árbol y, si es
  // una rama, fijar el lado (izq/der) según dónde quedó respecto del padre.
  const asentar = useCallback(
    (id: string) => {
      const n = getNode(id);
      if (!n) return;
      const { x, y } = n.position;
      setArbol((a) => {
        const ic = buscar(a, id);
        if (!ic) return a;
        const conPos = conPosicion(a, id, x, y);
        if (ic.padreId === null || ic.rama === "main") return conPos;
        const p = buscar(a, ic.padreId);
        const lado: Rama = p && x < p.x ? "branch-left" : "branch-right";
        return conRama(conPos, id, lado);
      });
    },
    [getNode],
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
  } = useNodeInertia(setNodes, asentar, settings.inertia);

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
      const nDesc = descendientes(arbol, id).length;
      if (
        nDesc > 0 &&
        !window.confirm(
          `Se van a eliminar ${nDesc + 1} globos: este y todo lo que cuelga de él. ¿Seguir?`,
        )
      ) {
        return;
      }
      const padreId = buscar(arbol, id)?.padreId ?? null;
      seleccionarLuegoRef.current = padreId;
      setArbol((a) => quitarSubarbol(a, id));
      setActiveNodeId(padreId);
    },
    [arbol, cancelInertia, cancelPanInertia],
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
          // Borrar es solo por el botón 🗑 (pasa por `deleteNode`: subárbol +
          // confirmación). El Backspace de React Flow borraría un nodo suelto
          // sin limpiar hijos ni tocar el árbol.
          deleteKeyCode={null}
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
