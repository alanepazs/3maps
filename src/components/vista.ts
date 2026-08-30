"use client";

// Preferencias de VISTA por globo (colapsado / expandido). NO van al `.md` ni
// al árbol: son cómo el usuario mira este navegador, no parte del contenido.
// Se guardan aparte de Settings porque son por-id y efímeras (fase 3.1).
//
// TODO (fase 3.5): cuando haya varios mapas, la clave pasa a ser por mapa
// (`3maps:vista:<mapId>`).

const VISTA_STORAGE_KEY = "3maps:vista";

// Arriba de este largo de respuesta, el globo arranca colapsado.
export const LIMITE_COLAPSO = 400;
// Alto máximo del cuerpo cuando está colapsado (px).
export const ALTO_COLAPSADO = 220;

type Vista = { expandidos: Record<string, boolean> };

function leer(): Vista {
  if (typeof window === "undefined") return { expandidos: {} };
  try {
    const crudo = window.localStorage.getItem(VISTA_STORAGE_KEY);
    if (!crudo) return { expandidos: {} };
    const v = JSON.parse(crudo) as Partial<Vista>;
    return { expandidos: v.expandidos ?? {} };
  } catch {
    return { expandidos: {} };
  }
}

// `undefined` = el usuario nunca tocó este globo → vale el default por largo.
export function leerExpandido(id: string): boolean | undefined {
  return leer().expandidos[id];
}

export function guardarExpandido(id: string, valor: boolean): void {
  if (typeof window === "undefined") return;
  const v = leer();
  v.expandidos[id] = valor;
  try {
    window.localStorage.setItem(VISTA_STORAGE_KEY, JSON.stringify(v));
  } catch {
    // storage lleno / bloqueado: la preferencia no persiste, no es grave.
  }
}
