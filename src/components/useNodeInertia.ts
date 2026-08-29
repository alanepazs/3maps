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

// `strength` es el multiplicador configurable del envión (0 = desactivado).
export function useNodeInertia(
  setNodes: SetNodes,
  onSettle: (nodeId: string) => void,
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
    (ids: string[]) => {
      const v = launchVelocity(sampleRef.current, strength, MAX_SPEED);
      sampleRef.current = null;
      if (!v) {
        ids.forEach(onSettle);
        return;
      }
      const moving = new Set(ids);
      stopRef.current = runGlide(
        v.vx,
        v.vy,
        (dx, dy) =>
          setNodes((nds) =>
            nds.map((n) =>
              moving.has(n.id)
                ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
                : n,
            ),
          ),
        () => {
          stopRef.current = null;
          ids.forEach(onSettle);
        },
      );
    },
    [setNodes, onSettle, strength],
  );

  const onNodeDragStart = beginDrag;
  const onNodeDrag = useCallback((_evt: unknown, node: Node) => track(node), [track]);
  const onNodeDragStop = useCallback(
    (_evt: unknown, node: Node) => glide([node.id]),
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
    (_evt: unknown, nodes: Node[]) => glide(nodes.map((n) => n.id)),
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
