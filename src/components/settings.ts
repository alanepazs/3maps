"use client";

// Parámetros configurables desde la tuerquita (arriba a la izquierda del canvas).
// Acá vamos a ir sumando más opciones más adelante.
export type Settings = {
  // Multiplicador del envión al soltar un globo. 0 = sin envión, 1 = normal.
  inertia: number;
  // Cuántos intercambios recientes del camino van completos al armar el contexto
  // para la IA; los anteriores se resumen (ver src/model/contexto.ts).
  ventanaContexto: number;
};

export const DEFAULT_SETTINGS: Settings = {
  inertia: 1,
  ventanaContexto: 6,
};

export const SETTINGS_STORAGE_KEY = "3maps:settings";
