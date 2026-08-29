"use client";

import { MODELO_POR_DEFECTO, type ConfigIA } from "./ia";
import { PROVEEDORES, type Proveedor } from "./intercambio";

// La configuración de IA (proveedor + API key + modelo) vive solo en el
// navegador del usuario. Clave aparte de "3maps:settings" porque es sensible.
const CONFIG_IA_STORAGE_KEY = "3maps:ia";

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
    return {
      proveedor,
      apiKey: o.apiKey,
      modelo: o.modelo || MODELO_POR_DEFECTO[proveedor],
    };
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
