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
  // Ancho del panel de transcripción, por tipo de dispositivo (fase 3.11).
  // Bucket por ancho de viewport: < 768 = "mobile" (ahí el panel va a pantalla
  // completa y no se redimensiona). En "desktop" se ajusta arrastrando el borde
  // interno del panel; se clampa a [320, 75% del viewport].
  transcriptWidth: { mobile: number; desktop: number };
  // El usuario aceptó que su API key de DeepSeek / GPT transite el proxy de
  // 3maps (esas APIs no se pueden llamar directo desde el navegador). Opt-in.
  usarProxyIA: boolean;
  // El usuario escondió la barra de escribir (se desliza hacia abajo; queda un
  // botón "✎ Escribir" para traerla). Fase 3.13.
  composerOculto: boolean;
  // Cuánto crece el globo (tramo) por mensaje, para que se vea de lejos cuánto
  // conversaste ahí (Fase 5). Alto = ALTO_BASE + min(n * px, tope). px = 0 → no
  // crece. En px de canvas.
  crecimientoPxPorMensaje: number; // 0-24
  crecimientoTope: number; // máximo que crece por encima del base
  // Grosor de las flechas conectoras (B4). Se aplica como `--xy-edge-stroke-width`
  // sobre el contenedor del canvas (lo hereda `.react-flow__edge-path`). 1-5.
  grosorLineas: number;
  // Fuente y tamaño del texto de toda la app (B5). `fuenteTexto` → familia
  // (`FUENTES_TEXTO` en SettingsPanel); `escalaTexto` multiplica el `font-size`
  // del `<html>` → escala todo lo que usa `rem`. 0.8–1.3.
  fuenteTexto: "sistema" | "geist" | "serif" | "mono";
  escalaTexto: number;
};

export const ANCHO_PANEL_DEFECTO = 460;
export const ANCHO_PANEL_MIN = 320;
// Fracción máxima del viewport que puede ocupar el panel en desktop.
export const ANCHO_PANEL_MAX_FRAC = 0.75;

// Alto del globo (tramo) sin crecimiento: header + un cachito de cuerpo.
export const ALTO_BASE_GLOBO = 108;

export const DEFAULT_SETTINGS: Settings = {
  inertia: 1,
  ventanaContexto: 6,
  systemPrompt: "",
  transcriptSide: "right",
  transcriptWidth: { mobile: ANCHO_PANEL_DEFECTO, desktop: ANCHO_PANEL_DEFECTO },
  usarProxyIA: false,
  composerOculto: false,
  crecimientoPxPorMensaje: 9,
  crecimientoTope: 320,
  grosorLineas: 1.5,
  fuenteTexto: "sistema",
  escalaTexto: 1,
};

// Familias CSS por opción de `Settings.fuenteTexto` (B5). "sistema" = el stack
// actual (Arial). Las var `--font-*` las define `app/layout.tsx` (next/font).
export const FUENTES_TEXTO: Record<Settings["fuenteTexto"], string> = {
  sistema: "Arial, Helvetica, sans-serif",
  geist: "var(--font-geist-sans), system-ui, sans-serif",
  serif: "var(--font-lora), Georgia, serif",
  mono: "var(--font-geist-mono), ui-monospace, monospace",
};

export const ESCALA_TEXTO_MIN = 0.8;
export const ESCALA_TEXTO_MAX = 1.3;

export const SETTINGS_STORAGE_KEY = "3maps:settings";
