"use client";

import { useState } from "react";

import { haySupabase } from "@/model/supabase";
import { useSesion } from "./useSesion";

// Cartelito para el usuario DESLOGUEADO: la app funciona igual sin cuenta, pero
// con cuenta los mapas se guardan en la nube y viajan entre dispositivos. Se
// puede descartar (queda en localStorage). No aparece en modo compartido.
const DESCARTADO_KEY = "3maps:nudge-login";

// Sin mismatch de hidratación: mientras `useSesion` está `cargando` (siempre en el
// primer render) el componente devuelve `null`; el lazy init de `descartado` recién
// influye una vez pasada la hidratación.
function leerDescartado(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(DESCARTADO_KEY) === "1";
  } catch {
    return false;
  }
}

export default function LoginNudge({ readOnly }: { readOnly: boolean }) {
  const { usuario, cargando, signInWithGoogle } = useSesion();
  const [descartado, setDescartado] = useState(leerDescartado);
  const [yendo, setYendo] = useState(false);

  if (readOnly || descartado || cargando || usuario || !haySupabase()) return null;

  const descartar = () => {
    setDescartado(true);
    try {
      localStorage.setItem(DESCARTADO_KEY, "1");
    } catch {
      // ignorar
    }
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full border border-line bg-surface/95 py-1.5 pl-4 pr-1.5 text-xs text-text-muted shadow-lg backdrop-blur">
        <span className="min-w-0">
          Sin cuenta la app anda igual. Con cuenta, tus mapas se guardan en la nube
          y los tenés en todos tus dispositivos.
        </span>
        <button
          type="button"
          onClick={async () => {
            if (yendo) return;
            setYendo(true);
            try {
              await signInWithGoogle();
            } catch {
              setYendo(false);
            }
          }}
          disabled={yendo}
          className="shrink-0 whitespace-nowrap rounded-full bg-sky-500 px-3 py-1.5 font-medium text-white hover:bg-sky-400 disabled:opacity-50"
        >
          {yendo ? "…" : "Iniciar sesión"}
        </button>
        <button
          type="button"
          onClick={descartar}
          aria-label="Descartar"
          className="shrink-0 rounded-full px-2 py-1 text-text-faint hover:bg-surface-2 hover:text-text"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
