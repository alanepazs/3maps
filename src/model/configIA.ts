"use client";

import {
  GEMINI_MODELOS_MUERTOS,
  MODELO_POR_DEFECTO,
  modeloListable,
  type ConfigIA,
} from "./ia";
import { PROVEEDORES, type Proveedor } from "./intercambio";

// La configuración de IA vive en el navegador (`localStorage["3maps:ia"]`, clave
// aparte de "3maps:settings" por ser sensible). Con sesión iniciada TAMBIÉN
// sincroniza a `sync/<uid>/config.json` (bucket privado del propio usuario) para
// tener las mismas keys/modelos en todos los dispositivos — ver `exportarConfigNube`
// / `fusionarConfigNube` y decisiones §9.
//
// Se guarda UNA key + modelo POR PROVEEDOR, más cuál está activo. Así probar
// otro proveedor y volver no obliga a re-pegar la key.
//   { activo: Proveedor, keys: { [proveedor]: { apiKey, modelo } } }
const CONFIG_IA_STORAGE_KEY = "3maps:ia";

const PROVEEDOR_POR_DEFECTO: Proveedor = "gemini";

// Modelos guardados en configs viejas que ya no sirven para una key free tier
// nueva y se migran al default al cargar. La lista vive en `ia.ts`
// (`GEMINI_MODELOS_MUERTOS`) porque también la usa `listarModelosGemini` para
// esconderlos del datalist. Ver decisiones §7b.
const MODELOS_MUERTOS = GEMINI_MODELOS_MUERTOS;

type Entrada = { apiKey: string; modelo: string };
type Almacen = {
  activo: Proveedor;
  keys: Partial<Record<Proveedor, Entrada>>;
  // uid de la cuenta que guardó estas keys. "" = nunca se logueó nadie con
  // estas keys (pegadas sin cuenta). Si otra cuenta se loguea en este navegador,
  // las keys se borran — son lo más sensible (facturación). Ver `scopeConfigIA`.
  dueño: string;
};

function esProveedor(x: unknown): x is Proveedor {
  return typeof x === "string" && (PROVEEDORES as string[]).includes(x);
}

function leer(): Almacen {
  const vacio: Almacen = { activo: PROVEEDOR_POR_DEFECTO, keys: {}, dueño: "" };
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
        dueño: "",
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
    return { activo, keys, dueño: typeof o.dueño === "string" ? o.dueño : "" };
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
      JSON.stringify({ activo: a.activo, keys, dueño: a.dueño }),
    );
  } catch {
    // ignorar: no se pudo persistir
  }
}

function modeloVigente(proveedor: Proveedor, modelo: string | undefined): string {
  // `MODELOS_MUERTOS` = Gemini retirados (§7b). `modeloListable` = STT/TTS/
  // clasificadores de los proveedores del proxy (§7e) — una config vieja apuntando
  // a `whisper-*` etc. se cura sola al cargar.
  return modelo &&
    !MODELOS_MUERTOS.has(modelo) &&
    modeloListable(proveedor, modelo)
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

// ── Sync entre dispositivos de las keys/modelos (fase 4, decisiones §9) ──────
// El almacén viaja a `sync/<uid>/config.json` (bucket privado del propio usuario,
// RLS por cuenta). `dueño` NO viaja (el path ya es el scoping).

export type ConfigNube = {
  activo: Proveedor;
  keys: Partial<Record<Proveedor, Entrada>>;
};

export function exportarConfigNube(): ConfigNube {
  const a = leer();
  const keys: ConfigNube["keys"] = {};
  for (const [p, e] of Object.entries(a.keys)) {
    if (e && e.apiKey.trim()) keys[p as Proveedor] = e;
  }
  return { activo: a.activo, keys };
}

// Fusiona la config de la nube con la local. Unión de keys; en conflicto gana la
// NUBE (es el último estado subido por cualquier dispositivo). Adopta el
// `activo` de la nube si hay key para ese proveedor. Devuelve la config activa.
export function fusionarConfigNube(nube: ConfigNube): ConfigIA {
  const a = leer();
  for (const [p, e] of Object.entries(nube.keys ?? {})) {
    if (!esProveedor(p) || !e || typeof e !== "object") continue;
    const ent = e as Partial<Entrada>;
    if (typeof ent.apiKey === "string" && ent.apiKey.trim()) {
      a.keys[p] = {
        apiKey: ent.apiKey,
        modelo: typeof ent.modelo === "string" ? ent.modelo : "",
      };
    }
  }
  if (esProveedor(nube.activo) && a.keys[nube.activo]) {
    a.activo = nube.activo;
  }
  escribir(a);
  return aConfig(a);
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

// Ata las keys de API a la cuenta logueada. Si otra cuenta se loguea en el mismo
// navegador, BORRA las keys guardadas (son lo más sensible — facturación; cada
// cuenta pone la suya). Casos:
//   - `uid` == dueño, o dueño "" (keys pegadas sin login) → adoptar, no borrar.
//   - `uid` != dueño (otra cuenta)                         → borrar todo.
//   - `uid` null (logout)                                  → no se toca nada.
// Devuelve la config activa resultante. Llamar en cada cambio de sesión.
export function scopeConfigIA(uid: string | null): ConfigIA {
  const a = leer();
  if (uid && a.dueño !== "" && a.dueño !== uid) {
    const limpio: Almacen = {
      activo: PROVEEDOR_POR_DEFECTO,
      keys: {},
      dueño: uid,
    };
    escribir(limpio);
    return aConfig(limpio);
  }
  const nuevoDueño = uid ?? a.dueño;
  if (a.dueño !== nuevoDueño) {
    a.dueño = nuevoDueño;
    escribir(a);
  }
  return aConfig(a);
}
