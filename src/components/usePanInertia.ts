"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Viewport } from "@xyflow/react";

import {
  launchVelocity,
  runGlide,
  sampleVelocity,
  type VelSample,
} from "./inertia";

// Envión / inercia al soltar el plano del fondo movido con la manito (pan).

// px/ms — techo de velocidad para el envión del pan (más generoso que el de un
// globo: al panear se suele "tirar" el lienzo más lejos)
const MAX_SPEED = 4;
// si el zoom cambia más que esto entre muestras, es un gesto de zoom, no de pan
const ZOOM_EPSILON = 0.0005;

type SetViewport = (vp: Viewport) => void;
type GetViewport = () => Viewport;

export function usePanInertia(
  setViewport: SetViewport,
  getViewport: GetViewport,
  strength: number,
) {
  const sampleRef = useRef<VelSample | null>(null);
  const zoomRef = useRef(1);
  const wasZoomRef = useRef(false);
  const stopRef = useRef<(() => void) | null>(null);
  const glidingRef = useRef(false);
  // Cada frame del glide llama a setViewport(), y React Flow lo traduce a un
  // d3-zoom.transform() programático que dispara start/move/end de forma
  // SÍNCRONA. Sin este flag, ese "start" reentrante haría cancelPanInertia() y
  // el envión se cortaría en el primer frame.
  const applyingRef = useRef(false);

  const cancelPanInertia = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    glidingRef.current = false;
  }, []);

  useEffect(() => cancelPanInertia, [cancelPanInertia]);

  const onMoveStart = useCallback(() => {
    if (applyingRef.current) return; // evento reentrante del propio glide
    cancelPanInertia();
    sampleRef.current = null;
    wasZoomRef.current = false;
    zoomRef.current = getViewport().zoom;
  }, [cancelPanInertia, getViewport]);

  const onMove = useCallback((_evt: unknown, vp: Viewport) => {
    if (glidingRef.current || applyingRef.current) return;
    if (Math.abs(vp.zoom - zoomRef.current) > ZOOM_EPSILON) {
      wasZoomRef.current = true;
    }
    zoomRef.current = vp.zoom;
    sampleRef.current = sampleVelocity(sampleRef.current, vp.x, vp.y);
  }, []);

  const onMoveEnd = useCallback(() => {
    if (glidingRef.current) return;

    const wasZoom = wasZoomRef.current;
    const v = wasZoom
      ? null
      : launchVelocity(sampleRef.current, strength, MAX_SPEED);
    sampleRef.current = null;
    wasZoomRef.current = false;
    if (!v) return;

    glidingRef.current = true;
    stopRef.current = runGlide(
      v.vx,
      v.vy,
      (dx, dy) => {
        const vp = getViewport();
        applyingRef.current = true;
        setViewport({ x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom });
        applyingRef.current = false;
      },
      () => {
        glidingRef.current = false;
        stopRef.current = null;
      },
    );
  }, [getViewport, setViewport, strength]);

  return { onMoveStart, onMove, onMoveEnd, cancelPanInertia };
}
