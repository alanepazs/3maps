"use client";

import { createContext } from "react";

// Acciones sobre un nodo que los nodos custom necesitan llamar hacia arriba
// (el estado del árbol vive en FlowCanvas). Se pasa por contexto para no tener
// que meter callbacks dentro de `data` de cada nodo.
export type NodeActions = {
  // Elimina el nodo y todo lo que cuelga de él (sus descendientes).
  deleteNode: (id: string) => void;
};

export const NodeActionsContext = createContext<NodeActions>({
  deleteNode: () => {},
});
