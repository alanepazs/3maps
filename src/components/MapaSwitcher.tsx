"use client";

import { useEffect, useRef, useState } from "react";

import type { Mapas } from "@/model/mapas";

// Selector de mapas (fase 3.5). Chip arriba a la izquierda, al lado de la
// tuerquita. Cambiar de mapa + "＋ Nuevo mapa" + renombrar / borrar el actual.
export default function MapaSwitcher({
  mapas,
  activoId,
  onCambiar,
  onNuevo,
  onBorrar,
  onRenombrar,
  onEmpezarDeCero,
  onExportar,
  onImportar,
}: {
  mapas: Mapas;
  activoId: string;
  onCambiar: (id: string) => void;
  onNuevo: () => void;
  onBorrar: () => void;
  onRenombrar: (titulo: string) => void;
  onEmpezarDeCero: () => void;
  onExportar: () => void;
  onImportar: (archivo: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (
        contenedorRef.current &&
        !contenedorRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const lista = Object.entries(mapas).sort(
    (a, b) => (a[1].creado < b[1].creado ? -1 : 1),
  );
  const activo = mapas[activoId];

  const renombrar = () => {
    const t = window.prompt("Nuevo nombre del mapa:", activo?.titulo ?? "");
    if (t && t.trim()) onRenombrar(t.trim());
  };

  return (
    <div ref={contenedorRef} className="absolute left-16 top-4 z-10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-9 max-w-[220px] items-center gap-1.5 rounded-full border border-line bg-surface/95 px-3 text-sm text-text shadow-lg backdrop-blur transition-colors hover:bg-surface-2"
        title="Cambiar de mapa"
      >
        <span className="truncate">{activo?.titulo ?? "Mapa"}</span>
        <span className="text-text-faint">▾</span>
      </button>

      {open && (
        <div className="mt-2 w-64 rounded-lg border border-line bg-surface/95 p-2 text-text shadow-xl backdrop-blur">
          <p className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-text-faint">
            Mapas
          </p>
          <ul className="max-h-64 space-y-0.5 overflow-y-auto">
            {lista.map(([id, meta]) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => {
                    onCambiar(id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                    id === activoId
                      ? "bg-sky-500/20 text-text"
                      : "text-text-muted hover:bg-surface-2"
                  }`}
                >
                  <span className="w-3 shrink-0 text-sky-400">
                    {id === activoId ? "•" : ""}
                  </span>
                  <span className="truncate">{meta.titulo}</span>
                </button>
              </li>
            ))}
          </ul>

          <hr className="my-2 border-line" />
          <button
            type="button"
            onClick={() => {
              onNuevo();
              setOpen(false);
            }}
            className="w-full rounded px-2 py-1.5 text-left text-sm text-text-muted hover:bg-surface-2"
          >
            ＋ Nuevo mapa
          </button>
          <button
            type="button"
            onClick={renombrar}
            className="w-full rounded px-2 py-1.5 text-left text-sm text-text-muted hover:bg-surface-2"
          >
            ✎ Renombrar “{activo?.titulo ?? ""}”
          </button>

          <hr className="my-2 border-line" />
          <button
            type="button"
            onClick={() => {
              onExportar();
              setOpen(false);
            }}
            className="w-full rounded px-2 py-1.5 text-left text-sm text-text-muted hover:bg-surface-2"
            title="Descarga este mapa como .zip de sus .md (con adjuntos)"
          >
            ⬇ Exportar (.zip)
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full rounded px-2 py-1.5 text-left text-sm text-text-muted hover:bg-surface-2"
            title="Abre un .zip exportado como un mapa nuevo"
          >
            ⬆ Importar (.zip)
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = ""; // permitir re-elegir el mismo archivo
              if (f) {
                onImportar(f);
                setOpen(false);
              }
            }}
          />

          <hr className="my-2 border-line" />
          <button
            type="button"
            onClick={() => {
              onBorrar();
              setOpen(false);
            }}
            className="w-full rounded px-2 py-1.5 text-left text-sm text-danger hover:bg-red-500/15"
          >
            🗑 Borrar este mapa
          </button>
          <button
            type="button"
            onClick={() => {
              onEmpezarDeCero();
              setOpen(false);
            }}
            className="w-full rounded px-2 py-1.5 text-left text-sm text-danger hover:bg-red-500/15"
            title="Borra todos los mapas (acá y en la nube) y arranca con uno vacío"
          >
            🧹 Empezar de cero
          </button>
        </div>
      )}
    </div>
  );
}
