"use client";

// Cartel fijo arriba cuando se está viendo un árbol compartido (`?compartir=`).
// El árbol se ve pero NO se guarda en este navegador hasta que el usuario
// aprieta "Guardar en mi 3maps". Ver decisiones §F2-5.
export default function SharedBanner({
  titulo,
  onGuardar,
  onSalir,
}: {
  titulo: string;
  onGuardar: () => void;
  onSalir: () => void;
}) {
  return (
    <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-center gap-3 border-b border-sky-500/30 bg-sky-500/15 px-4 py-2 text-sm text-text backdrop-blur">
      <span className="min-w-0 truncate">
        <span className="text-text-muted">Árbol compartido:</span>{" "}
        <span className="font-medium">{titulo || "sin título"}</span>
        <span className="ml-2 text-text-faint">— no se guarda acá.</span>
      </span>
      <button
        type="button"
        onClick={onGuardar}
        className="shrink-0 rounded bg-sky-500 px-3 py-1 text-xs font-medium text-white hover:bg-sky-400"
      >
        Guardar en mi 3maps
      </button>
      <button
        type="button"
        onClick={onSalir}
        className="shrink-0 rounded border border-line-strong px-3 py-1 text-xs text-text-muted hover:bg-surface-2"
      >
        Salir
      </button>
    </div>
  );
}
