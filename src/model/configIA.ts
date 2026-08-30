"use client";

import { MODELO_POR_DEFECTO, type ConfigIA } from "./ia";
import { PROVEEDORES, type Proveedor } from "./intercambio";

// La configuración de IA (proveedor + API key + modelo) vive solo en el
// navegador del usuario. Clave aparte de "3maps:settings" porque es sensible.
const CONFIG_IA_STORAGE_KEY = "3maps:ia";

// Modelos guardados en configs viejas que ya no existen para NADIE y se migran
// al default al cargar:
//  - retirados por Google → 404 "no existe el modelo"
//  - alias "-latest" que hoy resuelven a un flash paid-tier → 503 "high demand"
// Los 2.5-* NO están acá a propósito: siguen existiendo y una key con billing
// (o una cuenta vieja) los puede usar. Una key free tier nueva les da 404, pero
// para ese caso ya está el aviso ámbar + botón "ver modelos" + Reintentar con el
// error real de Google. Ver decisiones §7b.
const MODELOS_MUERTOS = new Set([
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-pro",
  // alias que hoy resuelven a un flash paid-tier (503 "high demand")
  "gemini-flash-latest",
  "gemini-pro-latest",
]);

export function cargarConfigIA(): ConfigIA | null {
  try {
    const raw =
      typeof window !== "undefined"
        ? localStorage.getItem(CONFIG_IA_STORAGE_KEY)
        : null;
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<ConfigIA>;
    if (!o.apiKey || !o.proveedor) return null;
    if (!(PROVEEDORES as string[]).includes(o.proveedor)) return null;
    const proveedor = o.proveedor as Proveedor;
    const modelo =
      o.modelo && !MODELOS_MUERTOS.has(o.modelo)
        ? o.modelo
        : MODELO_POR_DEFECTO[proveedor];
    return { proveedor, apiKey: o.apiKey, modelo };
  } catch {
    return null;
  }
}

export function guardarConfigIA(c: ConfigIA | null): void {
  try {
    if (c && c.apiKey.trim()) {
      localStorage.setItem(CONFIG_IA_STORAGE_KEY, JSON.stringify(c));
    } else {
      localStorage.removeItem(CONFIG_IA_STORAGE_KEY);
    }
  } catch {
    // ignorar: no se pudo persistir
  }
}
