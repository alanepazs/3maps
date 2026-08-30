"use client";

import { MODELO_POR_DEFECTO, type ConfigIA } from "./ia";
import { PROVEEDORES, type Proveedor } from "./intercambio";

// La configuración de IA vive solo en el navegador del usuario (nunca a un
// servidor de 3maps — invariante CLAUDE.md). Clave aparte de "3maps:settings"
// porque es sensible.
//
// Se guarda UNA key + modelo POR PROVEEDOR, más cuál está activo. Así probar
// otro proveedor y volver no obliga a re-pegar la key.
//   { activo: Proveedor, keys: { [proveedor]: { apiKey, modelo } } }
const CONFIG_IA_STORAGE_KEY = "3maps:ia";

const PROVEEDOR_POR_DEFECTO: Proveedor = "gemini";

// Modelos guardados en configs viejas que ya no existen para NADIE y se migran
// al default al cargar:
//  - retirados por Google → 404 "no existe el modelo"
//  - alias "-latest" que hoy resuelven a un flash paid-tier → 503 "high demand"
// Los 2.5-* NO están acá a propósito: siguen existiendo y una key con billing
// (o una cuenta vieja) los puede usar. Ver decisiones §7b.
const MODELOS_MUERTOS = new Set([
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-pro",
  "gemini-flash-latest",
  "gemini-pro-latest",
]);

type Entrada = { apiKey: string; modelo: string };
type Almacen = {
  activo: Proveedor;
  keys: Partial<Record<Proveedor, Entrada>>;
};

function esProveedor(x: unknown): x is Proveedor {
  return typeof x === "string" && (PROVEEDORES as string[]).includes(x);
}

function leer(): Almacen {
  const vacio: Almacen = { activo: PROVEEDOR_POR_DEFECTO, keys: {} };
  try {
    const raw =
      typeof window !== "undefined"
        ? localStorage.getItem(CONFIG_IA_STORAGE_KEY)
        : null;
    if (!raw) return vacio;
    const o = JSON.parse(raw) as Record<string, unknown>;

    // Formato viejo: { proveedor, apiKey, modelo } → migrar a { activo, keys }.
    if (esProveedor(o.proveedor) && typeof o.apiKey === "string") {
      const p = o.proveedor;
      return {
        activo: p,
        keys: {
          [p]: {
            apiKey: o.apiKey,
            modelo: typeof o.modelo === "string" ? o.modelo : "",
          },
        },
      };
    }

    // Formato nuevo.
    const activo = esProveedor(o.activo) ? o.activo : PROVEEDOR_POR_DEFECTO;
    const keys: Almacen["keys"] = {};
    const src = (o.keys ?? {}) as Record<string, unknown>;
    for (const [p, v] of Object.entries(src)) {
      if (!esProveedor(p) || !v || typeof v !== "object") continue;
      const e = v as Record<string, unknown>;
      if (typeof e.apiKey === "string" && e.apiKey.trim()) {
        keys[p] = {
          apiKey: e.apiKey,
          modelo: typeof e.modelo === "string" ? e.modelo : "",
        };
      }
    }
    return { activo, keys };
  } catch {
    return vacio;
  }
}

function escribir(a: Almacen): void {
  try {
    const keys: Almacen["keys"] = {};
    for (const [p, e] of Object.entries(a.keys)) {
      if (e && e.apiKey.trim()) keys[p as Proveedor] = e;
    }
    localStorage.setItem(
      CONFIG_IA_STORAGE_KEY,
      JSON.stringify({ activo: a.activo, keys }),
    );
  } catch {
    // ignorar: no se pudo persistir
  }
}

function modeloVigente(proveedor: Proveedor, modelo: string | undefined): string {
  return modelo && !MODELOS_MUERTOS.has(modelo)
    ? modelo
    : MODELO_POR_DEFECTO[proveedor];
}

function aConfig(a: Almacen): ConfigIA {
  const e = a.keys[a.activo];
  return {
    proveedor: a.activo,
    apiKey: e?.apiKey ?? "",
    modelo: modeloVigente(a.activo, e?.modelo),
  };
}

// La config ACTIVA (la que usa `llamarIA`). `apiKey` puede ser "" si no hay key
// guardada para el proveedor activo — quien llama debe chequearlo.
export function cargarConfigIA(): ConfigIA {
  return aConfig(leer());
}

// Guarda la key/modelo del proveedor de `c` y lo deja como activo. Si `apiKey`
// viene vacía, NO borra la entrada de ese proveedor (usar `borrarKeyProveedor`);
// solo actualiza el proveedor activo.
export function guardarConfigIA(c: ConfigIA): void {
  const a = leer();
  a.activo = c.proveedor;
  if (c.apiKey.trim()) {
    a.keys[c.proveedor] = { apiKey: c.apiKey.trim(), modelo: c.modelo };
  }
  escribir(a);
}

// Cambia solo el proveedor activo (sin tocar keys) y devuelve su config guardada.
export function cambiarProveedorActivo(p: Proveedor): ConfigIA {
  const a = leer();
  a.activo = p;
  escribir(a);
  return aConfig(a);
}

// Borra la key de UN proveedor (no las de los otros).
export function borrarKeyProveedor(p: Proveedor): ConfigIA {
  const a = leer();
  delete a.keys[p];
  escribir(a);
  return aConfig(a);
}

// La key/modelo guardados de un proveedor cualquiera (para prellenar la tuerca).
export function configGuardadaDe(p: Proveedor): Entrada | null {
  return leer().keys[p] ?? null;
}
