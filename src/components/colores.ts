import type { ColorGlobo } from "@/model/intercambio";

// Hex de cada slot de la paleta del globo (B1). Los slugs viven en el modelo
// (`.md`); el color concreto es presentación → acá. Lo usan `MessageNode` (punto
// del header + swatches del toolbar) y `ToolbarGrupo` (swatches de la selección
// múltiple).
export const COLOR_GLOBO_HEX: Record<ColorGlobo, string> = {
  ambar: "#f59e0b",
  verde: "#22c55e",
  rojo: "#ef4444",
  cian: "#06b6d4",
  violeta: "#a855f7",
  rosa: "#ec4899",
};
