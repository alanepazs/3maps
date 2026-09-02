"use client";

import { createContext } from "react";

import type { ColorGlobo } from "@/model/intercambio";

// Acciones sobre un nodo que los nodos custom necesitan llamar hacia arriba
// (el estado del árbol vive en FlowCanvas). Se pasa por contexto para no tener
// que meter callbacks dentro de `data` de cada nodo.
export type NodeActions = {
  // Elimina el nodo y todo lo que cuelga de él (sus descendientes).
  deleteNode: (id: string) => void;
  // Vuelve a pedirle la respuesta a la IA para este intercambio.
  retryNode: (id: string) => void;
  // Corta la llamada IA en vuelo de este globo; lo que llegó queda como
  // respuesta final (no `pending`, no `error`).
  stopNode: (id: string) => void;
  // Abre el panel de transcripción de la rama (raíz→este nodo).
  openNode: (id: string) => void;
  // Guarda el tamaño manual del globo (va al `.md` → sincroniza). null = auto.
  resizeNode: (id: string, ancho: number | null, alto: number | null) => void;
  // Color del globo (B1). Va al `.md` de la cabeza → sincroniza. null = sin color.
  colorNode: (id: string, color: ColorGlobo | null) => void;
  // `true` cuando se ve un árbol compartido: se esconden eliminar / reintentar.
  readOnly: boolean;
  // Crecimiento del globo por mensaje (Fase 5, F5-4). Sin tamaño manual, el alto
  // del tramo = ALTO_BASE_GLOBO + min(n * crecimientoPx, crecimientoTope).
  crecimientoPx: number;
  crecimientoTope: number;
};

export const NodeActionsContext = createContext<NodeActions>({
  deleteNode: () => {},
  retryNode: () => {},
  stopNode: () => {},
  openNode: () => {},
  resizeNode: () => {},
  colorNode: () => {},
  readOnly: false,
  crecimientoPx: 9,
  crecimientoTope: 320,
});
