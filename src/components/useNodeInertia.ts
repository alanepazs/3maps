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

// `strength` es el multiplicador configurable del envión (0 = desactivado).
// `onSettle` recibe la posición FINAL autoritativa (la del drop + lo que sumó
// el envión) — no depender de `getNode`, que puede ir un frame atrasado y
// persistir una posición vieja (bug: "la flecha no respeta el cambio").
export function useNodeInertia(
  setNodes: SetNodes,
  onSettle: (nodeId: string, pos: Pos) => void,
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
    (items: { id: string; pos: Pos }[]) => {
      const v = launchVelocity(sampleRef.current, strength, MAX_SPEED);
      sampleRef.current = null;
      if (!v) {
        items.forEach((it) => onSettle(it.id, it.pos));
        return;
      }
      const moving = new Set(items.map((it) => it.id));
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
          items.forEach((it) => onSettle(it.id, acc.get(it.id) ?? it.pos));
        },
      );
    },
    [setNodes, onSettle, strength],
  );

  const onNodeDragStart = beginDrag;
  const onNodeDrag = useCallback((_evt: unknown, node: Node) => track(node), [track]);
  const onNodeDragStop = useCallback(
    (_evt: unknown, node: Node) =>
      glide([{ id: node.id, pos: { x: node.position.x, y: node.position.y } }]),
    [glide],
  );

  const onSelectionDragStart = beginDrag;
  const onSelectionDrag = useCallback(
    (_evt: unknown, nodes: Node[]) => {
      if (nodes[0]) track(nodes[0]);
    },
    [track],
  );
  const onSelectionDragStop = useCallback(
    (_evt: unknown, nodes: Node[]) =>
      glide(
        nodes.map((n) => ({
          id: n.id,
          pos: { x: n.position.x, y: n.position.y },
        })),
      ),
    [glide],
  );

  return {
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    onSelectionDragStart,
    onSelectionDrag,
    onSelectionDragStop,
    cancelInertia,
  };
}
