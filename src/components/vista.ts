"use client";

// Preferencia de VISTA por globo: colapsado / expandido (fase 3.1). NO va al
// `.md` ni sincroniza — es cómo mirás ESTE navegador. (El tamaño manual del
// globo SÍ va al `.md` desde 31-08-2026 — ver `Intercambio.ancho/alto`.)

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

function escribir(v: Vista): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VISTA_STORAGE_KEY, JSON.stringify(v));
  } catch {
    // storage lleno / bloqueado: la preferencia no persiste, no es grave.
  }
}

// `undefined` = el usuario nunca tocó este globo → vale el default por largo.
export function leerExpandido(id: string): boolean | undefined {
  return leer().expandidos[id];
}

export function guardarExpandido(id: string, valor: boolean): void {
  const v = leer();
  v.expandidos[id] = valor;
  escribir(v);
}
