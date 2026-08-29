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

  const proveedor: Proveedor = configIA?.proveedor ?? "claude";
  const keyGuardada = configIA?.apiKey ?? "";
  const modeloGuardado = configIA?.modelo ?? MODELO_POR_DEFECTO[proveedor];
  const hayKey = keyGuardada.trim() !== "";

  // API key y modelo son borradores: se editan libres y recién se persisten con
  // el botón "Guardar" (o Enter). El proveedor sí aplica al toque.
  const [keyDraft, setKeyDraft] = useState(keyGuardada);
  const [modeloDraft, setModeloDraft] = useState(modeloGuardado);

  // Re-sincronizar los borradores cuando la config cambia desde afuera (cambio
  // de proveedor, "Borrar"). Patrón "ajustar estado en render", no en effect.
  const [snap, setSnap] = useState({ k: keyGuardada, m: modeloGuardado });
  if (snap.k !== keyGuardada || snap.m !== modeloGuardado) {
    setSnap({ k: keyGuardada, m: modeloGuardado });
    setKeyDraft(keyGuardada);
    setModeloDraft(modeloGuardado);
  }

  const dirty =
    keyDraft.trim() !== keyGuardada.trim() ||
    modeloDraft.trim() !== modeloGuardado.trim();

  const commit = () => {
    if (!dirty) return;
    onChangeConfigIA({
      proveedor,
      apiKey: keyDraft.trim(),
      modelo: modeloDraft.trim() || MODELO_POR_DEFECTO[proveedor],
    });
  };

  const cambiarProveedor = (p: Proveedor) => {
    // Aplica al toque: la key de un proveedor no sirve para otro → se limpia y
    // el modelo vuelve a su default. Los borradores se re-sincronizan solos.
    onChangeConfigIA({ proveedor: p, apiKey: "", modelo: MODELO_POR_DEFECTO[p] });
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
              onChange={(e) => cambiarProveedor(e.target.value as Proveedor)}
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
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                }
              }}
              placeholder={PISTA_API_KEY[proveedor]}
              autoComplete="off"
              spellCheck={false}
              className="mt-1 w-full rounded border border-white/15 bg-neutral-950 px-2 py-1.5 text-sm placeholder:text-white/30 focus:border-sky-400 focus:outline-none"
            />
          </label>

          <label className="mt-2 block text-sm">
            <span className="text-white/70">Modelo</span>
            <input
              type="text"
              value={modeloDraft}
              onChange={(e) => setModeloDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                }
              }}
              list="modelos-ia"
              className="mt-1 w-full rounded border border-white/15 bg-neutral-950 px-2 py-1.5 text-sm focus:border-sky-400 focus:outline-none"
            />
            <datalist id="modelos-ia">
              {MODELOS_SUGERIDOS[proveedor].map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>

          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={commit}
              disabled={!dirty}
              className="rounded bg-sky-500 px-3 py-1.5 text-xs font-medium text-white enabled:hover:bg-sky-400 disabled:opacity-40"
            >
              {dirty ? "Guardar" : hayKey ? "✓ Guardado" : "Guardar"}
            </button>
            {hayKey && (
              <button
                type="button"
                onClick={() => onChangeConfigIA(null)}
                className="text-xs text-white/50 hover:text-white/80"
              >
                Borrar key
              </button>
            )}
          </div>
          <span className="mt-1.5 block text-[11px] text-white/40">
            {dirty
              ? "Cambios sin guardar."
              : hayKey
                ? "Guardada en este navegador. Se manda directo al proveedor."
                : "La key se guarda solo en este navegador; nunca a un servidor de 3maps."}
          </span>

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
        </div>
      )}
    </div>
  );
}
