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

export type Tamano = { w: number; h: number };

type Vista = {
  expandidos: Record<string, boolean>;
  // Tamaño manual del globo (fase 3.10). Si existe, el usuario lo redimensionó a
  // mano → gana sobre el colapso automático de 3.1.
  tamanos: Record<string, Tamano>;
};

function leer(): Vista {
  if (typeof window === "undefined") return { expandidos: {}, tamanos: {} };
  try {
    const crudo = window.localStorage.getItem(VISTA_STORAGE_KEY);
    if (!crudo) return { expandidos: {}, tamanos: {} };
    const v = JSON.parse(crudo) as Partial<Vista>;
    return { expandidos: v.expandidos ?? {}, tamanos: v.tamanos ?? {} };
  } catch {
    return { expandidos: {}, tamanos: {} };
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

// Límites del redimensionado manual (px, en coords del lienzo).
export const TAMANO_MIN: Tamano = { w: 200, h: 80 };
export const TAMANO_MAX: Tamano = { w: 900, h: 1200 };
export const ANCHO_POR_DEFECTO = 260;

// `undefined` = el usuario nunca redimensionó este globo.
export function leerTamano(id: string): Tamano | undefined {
  return leer().tamanos[id];
}

export function guardarTamano(id: string, t: Tamano): void {
  const v = leer();
  v.tamanos[id] = t;
  escribir(v);
}

export function borrarTamano(id: string): void {
  const v = leer();
  if (!(id in v.tamanos)) return;
  delete v.tamanos[id];
  escribir(v);
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
