"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Node } from "@xyflow/react";

import {
  launchVelocity,
  runGlide,
  sampleVelocity,
  type VelSample,
} from "./inertia";

// Envión / inercia al soltar un globo (o una selección), tipo Obsidian Canvas.

// px/ms — techo de velocidad para el envión de un globo
const MAX_SPEED = 2;

type SetNodes = (updater: (nds: Node[]) => Node[]) => void;
type Pos = { x: number; y: number };
type Item = { id: string; pos: Pos };

// `strength` es el multiplicador configurable del envión (0 = desactivado).
// `onSettle` recibe la posición FINAL autoritativa de CADA globo (la del drop +
// lo que sumó el envión) — no depender de `getNode`, que puede ir un frame
// atrasado y persistir una posición vieja (bug: "la flecha no respeta el
// cambio"). Recibe siempre una lista: un globo suelto es `[globo]`, una
// selección son todos (los arma `FlowCanvas`, ver `onNodeDragStop` abajo). Sin
// `onSelectionDrag*`: un único handler cubre globo suelto y grupo (B3).
export function useNodeInertia(
  setNodes: SetNodes,
  onSettle: (items: Item[]) => void,
  strength: number,
) {
  const sampleRef = useRef<VelSample | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const cancelInertia = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
  }, []);

  useEffect(() => cancelInertia, [cancelInertia]);

  const beginDrag = useCallback(() => {
    cancelInertia();
    sampleRef.current = null;
  }, [cancelInertia]);

  const track = useCallback((node: Node) => {
    sampleRef.current = sampleVelocity(
      sampleRef.current,
      node.position.x,
      node.position.y,
    );
  }, []);

  const glide = useCallback(
    (items: Item[]) => {
      const v = launchVelocity(sampleRef.current, strength, MAX_SPEED);
      sampleRef.current = null;
      if (!v || items.length === 0) {
        onSettle(items);
        return;
      }
      const moving = new Set(items.map((it) => it.id));
      // Una sola velocidad para TODO el grupo: en un drag de selección los globos
      // se mueven rígidos, así que la del que trackeamos es la de todos.
      // Posición final = la del drop + lo que vaya sumando el envión, acumulado
      // acá (no leído de `getNode`).
      const acc = new Map(items.map((it) => [it.id, { ...it.pos }]));
      stopRef.current = runGlide(
        v.vx,
        v.vy,
        (dx, dy) => {
          for (const p of acc.values()) {
            p.x += dx;
            p.y += dy;
          }
          setNodes((nds) =>
            nds.map((n) =>
              moving.has(n.id)
                ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
                : n,
            ),
          );
        },
        () => {
          stopRef.current = null;
          onSettle(items.map((it) => ({ id: it.id, pos: acc.get(it.id) ?? it.pos })));
        },
      );
    },
    [setNodes, onSettle, strength],
  );

  const onNodeDragStart = beginDrag;
  const onNodeDrag = useCallback((_evt: unknown, node: Node) => track(node), [track]);

  // `nodes` = todos los globos a glidear. Lo arma `FlowCanvas` a partir de SU
  // selección (`getNodes().filter(selected)`), no del arg de React Flow: RF a
  // veces pasa un solo nodo aunque haya varios seleccionados (según agarres un
  // globo o el recuadro, y por `selectNodesOnDrag`) → antes solo 1 tenía
  // envión (B3). Una sola velocidad para todos (en una selección van rígidos).
  const onNodeDragStop = useCallback(
    (_evt: unknown, node: Node, nodes?: Node[]) => {
      const arrastrados = nodes && nodes.length > 0 ? nodes : [node];
      glide(
        arrastrados.map((n) => ({
          id: n.id,
          pos: { x: n.position.x, y: n.position.y },
        })),
      );
    },
    [glide],
  );

  return {
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    cancelInertia,
  };
}
