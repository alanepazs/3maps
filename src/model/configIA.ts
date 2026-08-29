"use client";

import { MODELO_POR_DEFECTO, type ConfigIA } from "./ia";
import { PROVEEDORES, type Proveedor } from "./intercambio";

// La configuración de IA (proveedor + API key + modelo) vive solo en el
// navegador del usuario. Clave aparte de "3maps:settings" porque es sensible.
const CONFIG_IA_STORAGE_KEY = "3maps:ia";

// Modelos guardados en configs viejas que no sirven para el caso de uso de 3maps
// (key propia, free tier — spec §9) y se migran al default al cargar:
//  - retirados por Google → 404 "no existe el modelo"
//  - alias "-latest" que hoy resuelven a un flash paid-tier → 503 "high demand"
// Si tenés key con billing y querés el alias, lo re-escribís a mano en ⚙️.
const MODELOS_MUERTOS = new Set([
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-pro",
  // "no longer available to new users" → Google redirige a los 3.x
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
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
