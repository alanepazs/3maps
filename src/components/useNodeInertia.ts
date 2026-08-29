"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Node } from "@xyflow/react";

// Envión / inercia al soltar un globo, tipo nodos de Obsidian Canvas: si lo
// soltás con un "flick" (velocidad), sigue de largo un poco y frena solo.
// Si lo dejás con cuidado (sin velocidad), no pasa nada.

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

type Sample = { t: number; x: number; y: number; vx: number; vy: number };

type SetNodes = (updater: (nds: Node[]) => Node[]) => void;

export function useNodeInertia(setNodes: SetNodes, onSettle: (nodeId: string) => void) {
  const sampleRef = useRef<Sample | null>(null);
  const rafRef = useRef<number | null>(null);

  const cancelInertia = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => cancelInertia, [cancelInertia]);

  const onNodeDragStart = useCallback(() => {
    cancelInertia();
    sampleRef.current = null;
  }, [cancelInertia]);

  const onNodeDrag = useCallback((_evt: unknown, node: Node) => {
    const now = performance.now();
    const prev = sampleRef.current;
    if (!prev) {
      sampleRef.current = { t: now, x: node.position.x, y: node.position.y, vx: 0, vy: 0 };
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
    };
  }, []);

  const onNodeDragStop = useCallback(
    (_evt: unknown, node: Node) => {
      const sample = sampleRef.current;
      sampleRef.current = null;

      let vx = sample?.vx ?? 0;
      let vy = sample?.vy ?? 0;
      const speed = Math.hypot(vx, vy);

      if (speed <= FLICK_THRESHOLD) {
        onSettle(node.id);
        return;
      }
      if (speed > MAX_SPEED) {
        const k = MAX_SPEED / speed;
        vx *= k;
        vy *= k;
      }

      const id = node.id;
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
          onSettle(id);
          return;
        }

        setNodes((nds) =>
          nds.map((n) =>
            n.id === id
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
    [setNodes, onSettle],
  );

  return { onNodeDragStart, onNodeDrag, onNodeDragStop, cancelInertia };
}
