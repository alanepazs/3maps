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
    <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-center gap-3 border-b border-white/15 bg-sky-950/90 px-4 py-2 text-sm text-white backdrop-blur">
      <span className="min-w-0 truncate">
        <span className="text-white/60">Árbol compartido:</span>{" "}
        <span className="font-medium">{titulo || "sin título"}</span>
        <span className="ml-2 text-white/50">— no se guarda acá.</span>
      </span>
      <button
        type="button"
        onClick={onGuardar}
        className="shrink-0 rounded bg-sky-500 px-3 py-1 text-xs font-medium hover:bg-sky-400"
      >
        Guardar en mi 3maps
      </button>
      <button
        type="button"
        onClick={onSalir}
        className="shrink-0 rounded border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
      >
        Salir
      </button>
    </div>
  );
}
