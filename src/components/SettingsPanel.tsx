"use client";

import { useState } from "react";

import type { Settings } from "./settings";

type Props = {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
};

// Tuerquita arriba a la izquierda. Por ahora solo ajusta el envión; el panel
// está pensado para ir sumando más parámetros.
export default function SettingsPanel({ settings, onChange }: Props) {
  const [open, setOpen] = useState(false);

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
        <div className="mt-2 w-64 rounded-lg border border-white/15 bg-neutral-900/95 p-3 text-white shadow-xl backdrop-blur">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-white/40">
            Ajustes
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
        </div>
      )}
    </div>
  );
}
