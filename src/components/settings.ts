"use client";

// Parámetros configurables desde la tuerquita (arriba a la izquierda del canvas).
// Acá vamos a ir sumando más opciones más adelante.
export type Settings = {
  // Multiplicador del envión al soltar un globo. 0 = sin envión, 1 = normal.
  inertia: number;
  // Cuántos intercambios recientes del camino van completos al armar el contexto
  // para la IA; los anteriores se resumen (ver src/model/contexto.ts).
  ventanaContexto: number;
  // Instrucción de sistema opcional que se antepone a cada llamada a la IA
  // (ambos adaptadores la mandan como system / systemInstruction). "" = ninguna.
  // No se usa para el resumen del tramo viejo (ese es interno).
  systemPrompt: string;
  // De qué lado del canvas se abre el panel de transcripción de la rama.
  // Se cambia con el botón ⇄ del propio panel.
  transcriptSide: "left" | "right";
  // El usuario aceptó que su API key de DeepSeek / GPT transite el proxy de
  // 3maps (esas APIs no se pueden llamar directo desde el navegador). Opt-in.
  usarProxyIA: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  inertia: 1,
  ventanaContexto: 6,
  systemPrompt: "",
  transcriptSide: "right",
  usarProxyIA: false,
};

export const SETTINGS_STORAGE_KEY = "3maps:settings";
