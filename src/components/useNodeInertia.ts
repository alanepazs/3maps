"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Node } from "@xyflow/react";

// Envión / inercia al soltar un globo, tipo nodos de Obsidian Canvas: si lo
// soltás con un "flick" (velocidad), sigue de largo un poco y frena solo.
// Si lo dejás con cuidado (sin velocidad), no pasa nada.
//
// Aplica tanto a arrastrar un globo suelto como a arrastrar una selección
// (varios globos a la vez).

// px/ms — velocidad mínima al soltar para que haya envión
const FLICK_THRESHOLD = 0.35;
// px/ms — techo de velocidad, para que un flick muy fuerte no lo dispare lejos
const MAX_SPEED = 2;
// fracción de la velocidad que queda después de 1 segundo (más chico = frena antes)
const DECAY_PER_SEC = 0.004;
// px/ms — por debajo de esto se considera frenado
const STOP_SPEED = 0.03;
// ms — tope de dt por frame (pestaña en 2º plano / preview dormido)
const MAX_FRAME_MS = 40;
// mínimo de muestras de movimiento para considerar que hubo un "flick" real
// (un click o un drag instantáneo no acumulan suficientes)
const MIN_SAMPLES = 3;

type Sample = {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  count: number;
};

type SetNodes = (updater: (nds: Node[]) => Node[]) => void;

// `strength` es el multiplicador configurable del envión (0 = desactivado,
// 1 = normal). Escala el impulso inicial del glide.
export function useNodeInertia(
  setNodes: SetNodes,
  onSettle: (nodeId: string) => void,
  strength: number,
) {
  const sampleRef = useRef<Sample | null>(null);
  const rafRef = useRef<number | null>(null);

  const cancelInertia = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => cancelInertia, [cancelInertia]);

  // Registra la posición de un globo representativo para estimar la velocidad
  // (todos los de una selección se mueven con el mismo delta).
  const track = useCallback((node: Node) => {
    const now = performance.now();
    const prev = sampleRef.current;
    if (!prev) {
      sampleRef.current = {
        t: now,
        x: node.position.x,
        y: node.position.y,
        vx: 0,
        vy: 0,
        count: 0,
      };
      return;
    }
    const dt = now - prev.t;
    if (dt <= 0) return;
    const rawVx = (node.position.x - prev.x) / dt;
    const rawVy = (node.position.y - prev.y) / dt;
    // suavizado exponencial: que el envión no dependa de un solo frame
    sampleRef.current = {
      t: now,
      x: node.position.x,
      y: node.position.y,
      vx: prev.vx * 0.4 + rawVx * 0.6,
      vy: prev.vy * 0.4 + rawVy * 0.6,
      count: prev.count + 1,
    };
  }, []);

  const beginDrag = useCallback(() => {
    cancelInertia();
    sampleRef.current = null;
  }, [cancelInertia]);

  // Lanza el glide para el conjunto de ids con la velocidad medida.
  const glide = useCallback(
    (ids: string[]) => {
      const sample = sampleRef.current;
      sampleRef.current = null;

      let vx = sample?.vx ?? 0;
      let vy = sample?.vy ?? 0;
      const speed = Math.hypot(vx, vy);

      if (
        strength <= 0 ||
        !sample ||
        sample.count < MIN_SAMPLES ||
        speed <= FLICK_THRESHOLD ||
        !Number.isFinite(speed)
      ) {
        ids.forEach(onSettle);
        return;
      }

      vx *= strength;
      vy *= strength;
      const boosted = Math.hypot(vx, vy);
      if (boosted > MAX_SPEED) {
        const k = MAX_SPEED / boosted;
        vx *= k;
        vy *= k;
      }

      const moving = new Set(ids);
      let lastT = performance.now();

      const step = () => {
        const now = performance.now();
        const dt = Math.min(now - lastT, MAX_FRAME_MS);
        lastT = now;

        const decay = Math.pow(DECAY_PER_SEC, dt / 1000);
        vx *= decay;
        vy *= decay;

        if (Math.hypot(vx, vy) < STOP_SPEED) {
          rafRef.current = null;
          ids.forEach(onSettle);
          return;
        }

        setNodes((nds) =>
          nds.map((n) =>
            moving.has(n.id)
              ? {
                  ...n,
                  position: { x: n.position.x + vx * dt, y: n.position.y + vy * dt },
                }
              : n,
          ),
        );
        rafRef.current = requestAnimationFrame(step);
      };

      rafRef.current = requestAnimationFrame(step);
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
