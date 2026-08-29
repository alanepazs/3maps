"use client";

import { useState } from "react";

import type { Settings } from "./settings";
import {
  MODELOS_SUGERIDOS,
  MODELO_POR_DEFECTO,
  NOMBRE_PROVEEDOR,
  PISTA_API_KEY,
  PROVEEDORES_DISPONIBLES,
  type ConfigIA,
} from "@/model/ia";
import type { Proveedor } from "@/model/intercambio";

type Props = {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  configIA: ConfigIA | null;
  onChangeConfigIA: (c: ConfigIA | null) => void;
};

// Tuerquita arriba a la izquierda. Ajustes del lienzo + configuración de la IA
// (proveedor, API key, modelo). La API key vive solo en este navegador.
export default function SettingsPanel({
  settings,
  onChange,
  configIA,
  onChangeConfigIA,
}: Props) {
  const [open, setOpen] = useState(false);

  // Los campos se manejan directo desde la prop `configIA` (sin estado local):
  // cada cambio persiste al toque. Simple y sin closures viejos.
  const proveedor: Proveedor = configIA?.proveedor ?? "claude";
  const apiKey = configIA?.apiKey ?? "";
  const modelo = configIA?.modelo ?? MODELO_POR_DEFECTO[proveedor];

  const hayKey = apiKey.trim() !== "";

  const guardar = (parche: {
    apiKey?: string;
    modelo?: string;
    proveedor?: Proveedor;
  }) => {
    // Al cambiar de proveedor: resetear el modelo a su default y limpiar la key
    // (la de un proveedor no sirve para otro). Siempre pasamos el objeto
    // completo; persistir o no lo decide configIA.ts (no guarda sin API key).
    const cambioProveedor =
      parche.proveedor !== undefined && parche.proveedor !== proveedor;
    onChangeConfigIA({
      proveedor: parche.proveedor ?? proveedor,
      apiKey: cambioProveedor ? "" : (parche.apiKey ?? apiKey),
      modelo: cambioProveedor
        ? MODELO_POR_DEFECTO[parche.proveedor as Proveedor]
        : (parche.modelo ?? modelo),
    });
  };

  return (
    <div className="absolute left-4 top-4 z-10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Ajustes"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-neutral-900/95 text-lg shadow-lg backdrop-blur transition-colors hover:bg-white/10"
      >
        ⚙️
      </button>

      {open && (
        <div className="mt-2 max-h-[80vh] w-72 overflow-y-auto rounded-lg border border-white/15 bg-neutral-900/95 p-3 text-white shadow-xl backdrop-blur">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-white/40">
            Lienzo
          </p>

          <label className="block text-sm">
            <span className="flex items-center justify-between">
              <span>Envión al soltar</span>
              <span className="text-white/50">
                {settings.inertia <= 0
                  ? "off"
                  : `${settings.inertia.toFixed(2)}×`}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.25}
              value={settings.inertia}
              onChange={(e) => onChange({ inertia: Number(e.target.value) })}
              className="mt-2 w-full accent-sky-500"
            />
          </label>

          <hr className="my-3 border-white/10" />
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-white/40">
            IA
          </p>

          <label className="block text-sm">
            <span className="text-white/70">Proveedor</span>
            <select
              value={proveedor}
              onChange={(e) => guardar({ proveedor: e.target.value as Proveedor })}
              className="mt-1 w-full rounded border border-white/15 bg-neutral-950 px-2 py-1.5 text-sm"
            >
              {PROVEEDORES_DISPONIBLES.map((p) => (
                <option key={p} value={p}>
                  {NOMBRE_PROVEEDOR[p]}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-2 block text-sm">
            <span className="text-white/70">API key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => guardar({ apiKey: e.target.value })}
              placeholder={PISTA_API_KEY[proveedor]}
              autoComplete="off"
              spellCheck={false}
              className="mt-1 w-full rounded border border-white/15 bg-neutral-950 px-2 py-1.5 text-sm placeholder:text-white/30 focus:border-sky-400 focus:outline-none"
            />
            <span className="mt-1 block text-[11px] text-white/40">
              {hayKey
                ? "Guardada en este navegador. Se manda directo al proveedor."
                : "Solo se guarda en este navegador; nunca a un servidor de 3maps."}
            </span>
          </label>

          <label className="mt-2 block text-sm">
            <span className="text-white/70">Modelo</span>
            <input
              type="text"
              value={modelo}
              onChange={(e) => guardar({ modelo: e.target.value })}
              list="modelos-ia"
              className="mt-1 w-full rounded border border-white/15 bg-neutral-950 px-2 py-1.5 text-sm focus:border-sky-400 focus:outline-none"
            />
            <datalist id="modelos-ia">
              {MODELOS_SUGERIDOS[proveedor].map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>

          <label className="mt-2 block text-sm">
            <span className="flex items-center justify-between">
              <span className="text-white/70">Ventana de contexto</span>
              <span className="text-white/50">
                {settings.ventanaContexto} interc.
              </span>
            </span>
            <input
              type="range"
              min={2}
              max={20}
              step={1}
              value={settings.ventanaContexto}
              onChange={(e) =>
                onChange({ ventanaContexto: Number(e.target.value) })
              }
              className="mt-2 w-full accent-sky-500"
            />
            <span className="mt-1 block text-[11px] text-white/40">
              Los más recientes van completos; los anteriores se resumen.
            </span>
          </label>

          {hayKey && (
            <button
              type="button"
              onClick={() => onChangeConfigIA(null)}
              className="mt-3 rounded border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
            >
              Borrar API key
            </button>
          )}
        </div>
      )}
    </div>
  );
}
