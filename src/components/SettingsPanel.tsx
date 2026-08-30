"use client";

import { useState } from "react";

import type { Settings } from "./settings";
import {
  ErrorIA,
  MODELOS_SUGERIDOS,
  MODELO_POR_DEFECTO,
  NOMBRE_PROVEEDOR,
  PISTA_API_KEY,
  PROVEEDORES_DISPONIBLES,
  avisoFormatoKey,
  listarModelos,
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
  const [aplicado, setAplicado] = useState(false);

  // Modelos disponibles para esta key (se traen a pedido — el set varía por key).
  const [modelos, setModelos] = useState<string[] | null>(null);
  const [cargandoModelos, setCargandoModelos] = useState(false);
  const [errorModelos, setErrorModelos] = useState<string | null>(null);

  // Re-sincronizar los borradores cuando la config cambia desde afuera (cambio
  // de proveedor, "Borrar"). Patrón "ajustar estado en render", no en effect.
  const [snap, setSnap] = useState({ k: keyGuardada, m: modeloGuardado });
  if (snap.k !== keyGuardada || snap.m !== modeloGuardado) {
    setSnap({ k: keyGuardada, m: modeloGuardado });
    setKeyDraft(keyGuardada);
    setModeloDraft(modeloGuardado);
    setModelos(null);
    setErrorModelos(null);
  }

  const dirty =
    keyDraft.trim() !== keyGuardada.trim() ||
    modeloDraft.trim() !== modeloGuardado.trim();

  const keyEfectiva = keyDraft.trim() || keyGuardada.trim();

  // Chequeo de formato local (gratis): avisa si la key no pinta del proveedor
  // elegido. No garantiza que funcione — para eso, "ver modelos".
  const avisoFormato = avisoFormatoKey(proveedor, keyDraft);

  const verModelos = async () => {
    if (!keyEfectiva || cargandoModelos) return;
    setCargandoModelos(true);
    setErrorModelos(null);
    try {
      const lista = await listarModelos({
        proveedor,
        apiKey: keyEfectiva,
        modelo: modeloDraft.trim(),
      });
      setModelos(lista);
      if (lista.length === 0) {
        setErrorModelos("La key no devolvió modelos usables.");
      }
    } catch (e) {
      setModelos(null);
      setErrorModelos(
        e instanceof ErrorIA ? e.message : "No se pudieron traer los modelos.",
      );
    } finally {
      setCargandoModelos(false);
    }
  };

  const commit = () => {
    if (!dirty) return;
    onChangeConfigIA({
      proveedor,
      apiKey: keyDraft.trim(),
      modelo: modeloDraft.trim() || MODELO_POR_DEFECTO[proveedor],
    });
    setAplicado(true);
    window.setTimeout(() => setAplicado(false), 2000);
    // Al guardar una key, traer de una la lista de modelos que esa key puede
    // usar (varía por key) → el usuario ve las opciones y confirma que la key
    // es válida sin gastar tokens.
    if (keyDraft.trim()) void verModelos();
  };

  const cambiarProveedor = (p: Proveedor) => {
    // Aplica al toque: la key de un proveedor no sirve para otro → se limpia y
    // el modelo vuelve a su default. Los borradores se re-sincronizan solos.
    onChangeConfigIA({ proveedor: p, apiKey: "", modelo: MODELO_POR_DEFECTO[p] });
  };

  // El modelo guardado no está entre los que la key puede usar → avisar.
  const modeloFueraDeLista =
    modelos !== null &&
    modelos.length > 0 &&
    modeloDraft.trim() !== "" &&
    !modelos.includes(modeloDraft.trim());

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
              className={`mt-1 w-full rounded border bg-neutral-950 px-2 py-1.5 text-sm placeholder:text-white/30 focus:outline-none ${
                avisoFormato
                  ? "border-amber-400/60 focus:border-amber-400"
                  : "border-white/15 focus:border-sky-400"
              }`}
            />
            {avisoFormato && (
              <span className="mt-1 block text-[11px] text-amber-400">
                {avisoFormato}
              </span>
            )}
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
              {Array.from(
                new Set([...(modelos ?? []), ...MODELOS_SUGERIDOS[proveedor]]),
              ).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>

          <button
            type="button"
            onClick={verModelos}
            disabled={!keyEfectiva || cargandoModelos}
            className="mt-1.5 rounded border border-white/15 px-2 py-1 text-[11px] text-white/70 enabled:hover:bg-white/10 disabled:opacity-40"
          >
            {cargandoModelos
              ? "verificando key…"
              : "↻ verificar key y ver sus modelos"}
          </button>
          <span className="mt-1 block text-[11px] text-white/40">
            Consulta gratis (no gasta tokens): si la key es inválida, avisa acá.
          </span>

          {errorModelos && (
            <p className="mt-1.5 text-[11px] text-red-400">{errorModelos}</p>
          )}

          {modeloFueraDeLista && (
            <p className="mt-1.5 text-[11px] text-amber-400">
              Tu key no incluye “{modeloDraft.trim()}”. Elegí uno de abajo.
            </p>
          )}

          {modelos && modelos.length > 0 && (
            <div className="mt-1.5">
              <p className="mb-1 text-[11px] text-white/40">
                Modelos de tu key (click para elegir):
              </p>
              <div className="flex flex-wrap gap-1">
                {modelos.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModeloDraft(m)}
                    className={`rounded px-1.5 py-0.5 text-[11px] ${
                      m === modeloDraft.trim()
                        ? "bg-sky-500 text-white"
                        : "bg-white/10 text-white/70 hover:bg-white/20"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={commit}
              disabled={!dirty}
              className="rounded bg-sky-500 px-3 py-1.5 text-xs font-medium text-white enabled:hover:bg-sky-400 disabled:opacity-40"
            >
              {dirty ? "Guardar" : aplicado ? "✓ Aplicado" : hayKey ? "✓ Guardado" : "Guardar"}
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
              : aplicado
                ? "Config aplicada. Ya podés mandar una pregunta."
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

          <label className="mt-2 block text-sm">
            <span className="text-white/70">Instrucción de sistema (opcional)</span>
            <textarea
              value={settings.systemPrompt}
              onChange={(e) => onChange({ systemPrompt: e.target.value })}
              rows={3}
              placeholder="Ej: Respondé en español, conciso y con ejemplos."
              className="mt-1.5 w-full resize-y rounded border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/90 placeholder:text-white/30 focus:border-sky-500 focus:outline-none"
            />
            <span className="mt-1 block text-[11px] text-white/40">
              Se antepone a cada pregunta. No afecta el resumen del contexto viejo.
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
