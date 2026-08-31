"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Settings } from "./settings";
import {
  despublicarArbol,
  misArbolesCompartidos,
  type ArbolCompartido,
} from "@/model/compartir";
import {
  ErrorIA,
  GEMINI_MODELOS_MUERTOS,
  GUIA_API_KEY,
  MODELOS_SUGERIDOS,
  MODELO_POR_DEFECTO,
  NOMBRE_PROVEEDOR,
  PISTA_API_KEY,
  PROVEEDORES_DISPONIBLES,
  PROVEEDORES_VIA_PROXY,
  avisoFormatoKey,
  listarModelos,
  type ConfigIA,
} from "@/model/ia";
import type { Proveedor } from "@/model/intercambio";
import { haySupabase } from "@/model/supabase";
import { useSesion } from "./useSesion";
import type { EstadoSync } from "./useSync";

type Props = {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  configIA: ConfigIA;
  // Guarda la key/modelo del proveedor activo.
  onGuardarKeyIA: (c: ConfigIA) => void;
  // Cambia el proveedor activo (trae su key guardada si tiene).
  onCambiarProveedorIA: (p: Proveedor) => void;
  // Borra solo la key del proveedor activo.
  onBorrarKeyIA: () => void;
  // Sube el árbol actual y devuelve el link. `undefined` si no hay backend
  // configurado o si se está viendo un árbol compartido (fase 2.3).
  onCompartir?: (titulo: string) => Promise<{ slug: string; url: string }>;
  // Estado del sync entre dispositivos (fase 2.4).
  estadoSync?: EstadoSync;
};

// Tuerquita arriba a la izquierda. Ajustes del lienzo + configuración de la IA
// (proveedor, API key, modelo). Las API keys viven solo en este navegador —
// una por proveedor (ver configIA.ts).
export default function SettingsPanel({
  settings,
  onChange,
  configIA,
  onGuardarKeyIA,
  onCambiarProveedorIA,
  onBorrarKeyIA,
  onCompartir,
  estadoSync,
}: Props) {
  const [open, setOpen] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  // Cerrar al clickear afuera del panel o con Escape (fase 3.7). El botón ⚙️
  // está dentro del contenedor, así que su click no dispara este cierre — lo
  // maneja su propio onClick (toggle).
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
    // Captura: React Flow frena los eventos del lienzo antes de que lleguen a
    // `document` en fase de burbuja.
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Cuenta (fase 2.2): login opcional (Google o magic link).
  const {
    usuario,
    cargando: cargandoSesion,
    signInWithGoogle,
    enviarMagicLink,
    cerrarSesion,
  } = useSesion();
  const [email, setEmail] = useState("");
  const [linkEnviado, setLinkEnviado] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [enviandoLink, setEnviandoLink] = useState(false);
  const [yendoAGoogle, setYendoAGoogle] = useState(false);

  const hacerGoogle = async () => {
    if (yendoAGoogle) return;
    setYendoAGoogle(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "No se pudo entrar con Google.");
      setYendoAGoogle(false);
    }
  };

  const hacerLogin = async () => {
    if (enviandoLink || !email.trim()) return;
    setEnviandoLink(true);
    setAuthError(null);
    try {
      await enviarMagicLink(email);
      setLinkEnviado(true);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "No se pudo enviar el link.");
    } finally {
      setEnviandoLink(false);
    }
  };

  // Compartir (fase 2.3): estado del link generado.
  const [compTitulo, setCompTitulo] = useState("");
  const [compLink, setCompLink] = useState<string | null>(null);
  const [compError, setCompError] = useState<string | null>(null);
  const [compartiendo, setCompartiendo] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Mis árboles compartidos (fase 2.2b): solo con sesión. Si no hay sesión, la
  // lista no se muestra (aunque quede algo viejo en el estado).
  const [mios, setMios] = useState<ArbolCompartido[] | null>(null);
  const [despublicando, setDespublicando] = useState<string | null>(null);

  const refrescarMios = useCallback(async () => {
    setMios(await misArbolesCompartidos());
  }, []);

  // Cargar la lista al abrir el panel logueado (y al cambiar de sesión).
  useEffect(() => {
    if (!open || !usuario) return;
    let vivo = true;
    void misArbolesCompartidos().then((lista) => {
      if (vivo) setMios(lista);
    });
    return () => {
      vivo = false;
    };
  }, [open, usuario]);

  const hacerCompartir = async () => {
    if (!onCompartir || compartiendo) return;
    setCompartiendo(true);
    setCompError(null);
    setCompLink(null);
    try {
      const { url } = await onCompartir(compTitulo);
      setCompLink(url);
      void refrescarMios();
    } catch (e) {
      setCompError(e instanceof Error ? e.message : "No se pudo compartir.");
    } finally {
      setCompartiendo(false);
    }
  };

  const hacerDespublicar = async (slug: string) => {
    if (despublicando) return;
    if (!window.confirm("¿Despublicar este árbol? El link deja de funcionar.")) {
      return;
    }
    setDespublicando(slug);
    try {
      await despublicarArbol(slug);
      setMios((prev) => prev?.filter((a) => a.slug !== slug) ?? null);
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "No se pudo despublicar.",
      );
    } finally {
      setDespublicando(null);
    }
  };

  const proveedor: Proveedor = configIA.proveedor;
  const keyGuardada = configIA.apiKey;
  const modeloGuardado = configIA.modelo || MODELO_POR_DEFECTO[proveedor];
  const hayKey = keyGuardada.trim() !== "";

  // DeepSeek / GPT van por el proxy de 3maps (no habilitan CORS). Necesitan que
  // el usuario acepte el opt-in Y que la instancia tenga el proxy configurado.
  const proveedorViaProxy = PROVEEDORES_VIA_PROXY.includes(proveedor);
  const proxyDisponible = haySupabase();
  // Se puede operar con este proveedor: siempre para claude/gemini; para
  // deepseek/gpt solo con el proxy disponible y el toggle activado.
  const proveedorHabilitado =
    !proveedorViaProxy || (proxyDisponible && settings.usarProxyIA);

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
  // de proveedor, "Borrar", key guardada de otro proveedor). Patrón "ajustar
  // estado en render", no en effect.
  const [snap, setSnap] = useState({
    p: proveedor,
    k: keyGuardada,
    m: modeloGuardado,
  });
  if (snap.p !== proveedor || snap.k !== keyGuardada || snap.m !== modeloGuardado) {
    setSnap({ p: proveedor, k: keyGuardada, m: modeloGuardado });
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
    onGuardarKeyIA({
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
    // Aplica al toque. Trae la key guardada de ese proveedor (si probaste otro
    // y volvés, no hay que re-pegarla). Los borradores se re-sincronizan solos.
    onCambiarProveedorIA(p);
  };

  // El modelo guardado no está entre los que la key puede usar → avisar.
  const modeloFueraDeLista =
    modelos !== null &&
    modelos.length > 0 &&
    modeloDraft.trim() !== "" &&
    !modelos.includes(modeloDraft.trim());

  // Alias de Gemini que no anda en free tier: al guardar se usa el default. Lo
  // avisamos en vez de swappear en silencio (antes confundía: "por qué me lo
  // cambió"). Ver `GEMINI_MODELOS_MUERTOS` / decisiones §7b.
  const modeloMuerto =
    proveedor === "gemini" && GEMINI_MODELOS_MUERTOS.has(modeloDraft.trim());

  // Chips de modelos bajo el input: los reales de la key si ya se verificó, si no
  // los sugeridos del proveedor. Reemplazan al viejo <datalist> (la flecha nativa
  // de Chrome quedaba vacía cuando el input ya tenía un modelo válido).
  const modelosKey = modelos ?? [];
  const chipsSonSugeridos = modelosKey.length === 0;
  const chipsModelo = chipsSonSugeridos
    ? MODELOS_SUGERIDOS[proveedor]
    : modelosKey;

  return (
    <div ref={contenedorRef} className="absolute left-4 top-4 z-10">
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
        <div className="mt-2 max-h-[calc(100dvh-18rem)] w-72 overflow-y-auto overscroll-contain rounded-lg border border-white/15 bg-neutral-900/95 p-3 text-white shadow-xl backdrop-blur sm:max-h-[80vh]">
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
                  {PROVEEDORES_VIA_PROXY.includes(p) ? " (proxy)" : ""}
                </option>
              ))}
            </select>
          </label>

          {proveedorViaProxy && (
            <div className="mt-2 rounded border border-amber-400/30 bg-amber-400/5 p-2 text-[11px] text-white/70">
              <p>
                {NOMBRE_PROVEEDOR[proveedor]} no se puede llamar directo desde el
                navegador (no habilita CORS). 3maps lo hace a través de un{" "}
                <span className="text-white/90">proxy propio</span>: tu API key{" "}
                <span className="text-white/90">pasa por el servidor de 3maps</span>,
                que solo la reenvía — no la guarda ni la registra.
              </p>
              {!proxyDisponible ? (
                <p className="mt-1.5 text-amber-300">
                  Esta instancia de 3maps no tiene el proxy configurado. Usá
                  Gemini o Claude.
                </p>
              ) : (
                <label className="mt-1.5 flex items-start gap-1.5 text-white/80">
                  <input
                    type="checkbox"
                    checked={settings.usarProxyIA}
                    onChange={(e) =>
                      onChange({ usarProxyIA: e.target.checked })
                    }
                    className="mt-0.5 accent-sky-500"
                  />
                  <span>
                    Entiendo y quiero usar el proxy de 3maps para{" "}
                    {NOMBRE_PROVEEDOR[proveedor]}.
                  </span>
                </label>
              )}
            </div>
          )}

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

          {/* Mini-guía para gente que nunca sacó una API key. */}
          <details className="group mt-1.5 rounded border border-white/10 bg-white/5 text-xs">
            <summary className="cursor-pointer list-none px-2 py-1.5 text-white/70 marker:content-none hover:text-white">
              <span className="mr-1 inline-block transition-transform group-open:rotate-90">
                ▸
              </span>
              ¿No sabés cómo conseguir tu API key?
            </summary>
            <div className="space-y-1.5 px-2 pb-2 pt-0.5 text-white/70">
              <p>
                Es la contraseña que le da acceso a 3maps al proveedor que
                elegiste ({NOMBRE_PROVEEDOR[proveedor]}). La sacás en su web, en
                1 minuto.{" "}
                {GUIA_API_KEY[proveedor].gratis ? (
                  <span className="text-emerald-400">Este proveedor es gratis.</span>
                ) : (
                  <span className="text-amber-400">
                    Este proveedor cobra (necesita saldo). Si querés uno 100%
                    gratis, elegí <span className="text-white/90">Google Gemini</span>{" "}
                    arriba.
                  </span>
                )}
                {GUIA_API_KEY[proveedor].abierto && (
                  <>
                    {" "}
                    <span className="text-white/60">
                      Acá usás modelos open-source (Llama, Qwen, DeepSeek, GLM…),
                      no un modelo propio cerrado.
                    </span>
                  </>
                )}
              </p>
              <ol className="ml-4 list-decimal space-y-1">
                {GUIA_API_KEY[proveedor].pasos.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ol>
              <a
                href={GUIA_API_KEY[proveedor].url}
                target="_blank"
                rel="noreferrer"
                className="inline-block rounded bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-400"
              >
                Abrir la web de {NOMBRE_PROVEEDOR[proveedor]} ↗
              </a>
              <p className="text-[11px] text-white/40">
                La clave se guarda solo en este navegador (y, si iniciás sesión,
                en tu cuenta para tenerla en todos tus dispositivos). Nunca la
                compartimos.
              </p>
            </div>
          </details>

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
              className="mt-1 w-full rounded border border-white/15 bg-neutral-950 px-2 py-1.5 text-sm focus:border-sky-400 focus:outline-none"
            />
          </label>

          <button
            type="button"
            onClick={verModelos}
            disabled={!keyEfectiva || cargandoModelos || !proveedorHabilitado}
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

          {modeloMuerto ? (
            <p className="mt-1.5 text-[11px] text-amber-400">
              “{modeloDraft.trim()}” no anda en el free tier de Gemini; se va a
              usar {MODELO_POR_DEFECTO.gemini}.
            </p>
          ) : (
            modeloFueraDeLista && (
              <p className="mt-1.5 text-[11px] text-amber-400">
                Tu key no incluye “{modeloDraft.trim()}”. Elegí uno de abajo.
              </p>
            )
          )}

          {chipsModelo.length > 0 && (
            <div className="mt-1.5">
              <p className="mb-1 text-[11px] text-white/40">
                {chipsSonSugeridos
                  ? "Sugeridos (verificá tu key para ver los reales):"
                  : "Modelos de tu key (click para elegir):"}
              </p>
              <div className="flex flex-wrap gap-1">
                {chipsModelo.map((m) => (
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
                onClick={onBorrarKeyIA}
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
              placeholder="Ej: Respondé en español, conciso. Ecuaciones entre $$ … $$."
              className="mt-1.5 w-full resize-y rounded border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/90 placeholder:text-white/30 focus:border-sky-500 focus:outline-none"
            />
            <span className="mt-1 block text-[11px] text-white/40">
              Se antepone a cada pregunta. No afecta el resumen del contexto viejo.
            </span>
          </label>

          {haySupabase() && (
            <>
              <hr className="my-3 border-white/10" />
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-white/40">
                Cuenta
              </p>
              {cargandoSesion ? (
                <p className="text-[11px] text-white/40">…</p>
              ) : usuario ? (
                <div className="text-sm">
                  <p className="text-white/70">
                    Sesión iniciada como{" "}
                    <span className="text-white/90">{usuario.email}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/40">
                    {estadoSync === "sincronizando"
                      ? "☁ sincronizando…"
                      : estadoSync === "error"
                        ? "⚠ no se pudo sincronizar (se reintenta al editar)"
                        : "☁ tu árbol se sincroniza entre dispositivos"}
                  </p>
                  <button
                    type="button"
                    onClick={() => void cerrarSesion()}
                    className="mt-1.5 rounded border border-white/15 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
                  >
                    Cerrar sesión
                  </button>
                </div>
              ) : linkEnviado ? (
                <p className="text-[11px] text-white/70">
                  Te mandamos un link a <span className="text-white/90">{email}</span>.
                  Abrilo desde este dispositivo para entrar. (Revisá spam.)
                </p>
              ) : (
                <div className="text-sm">
                  <p className="mb-1.5 text-[11px] text-white/40">
                    Opcional. Con cuenta, tu árbol se sincroniza entre dispositivos
                    y podés ver / despublicar tus árboles compartidos. Sin cuenta,
                    la app funciona igual (todo local).
                  </p>
                  <button
                    type="button"
                    onClick={() => void hacerGoogle()}
                    disabled={yendoAGoogle}
                    className="w-full rounded border border-white/20 bg-white px-2 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white/90 disabled:opacity-50"
                  >
                    {yendoAGoogle ? "redirigiendo…" : "Continuar con Google"}
                  </button>
                  <p className="my-1.5 text-center text-[11px] text-white/30">
                    o con un link por mail
                  </p>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void hacerLogin();
                      }
                    }}
                    placeholder="tu@email.com"
                    autoComplete="email"
                    className="w-full rounded border border-white/15 bg-neutral-950 px-2 py-1.5 text-sm placeholder:text-white/30 focus:border-sky-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void hacerLogin()}
                    disabled={enviandoLink || !email.trim()}
                    className="mt-1.5 rounded bg-sky-500 px-3 py-1.5 text-xs font-medium text-white enabled:hover:bg-sky-400 disabled:opacity-40"
                  >
                    {enviandoLink ? "enviando…" : "Enviarme un link para entrar"}
                  </button>
                  {authError && (
                    <p className="mt-1.5 text-[11px] text-red-400">{authError}</p>
                  )}
                </div>
              )}
            </>
          )}

          {onCompartir && (
            <>
              <hr className="my-3 border-white/10" />
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-white/40">
                Compartir
              </p>
              <label className="block text-sm">
                <span className="text-white/70">Título (opcional)</span>
                <input
                  type="text"
                  value={compTitulo}
                  onChange={(e) => setCompTitulo(e.target.value)}
                  placeholder="Se usa la primera pregunta si lo dejás vacío"
                  className="mt-1 w-full rounded border border-white/15 bg-neutral-950 px-2 py-1.5 text-sm placeholder:text-white/30 focus:border-sky-400 focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={hacerCompartir}
                disabled={compartiendo}
                className="mt-2 rounded bg-sky-500 px-3 py-1.5 text-xs font-medium text-white enabled:hover:bg-sky-400 disabled:opacity-40"
              >
                {compartiendo ? "subiendo…" : "Compartir este árbol"}
              </button>
              {compError && (
                <p className="mt-1.5 text-[11px] text-red-400">{compError}</p>
              )}
              {compLink && (
                <div className="mt-2">
                  <input
                    type="text"
                    readOnly
                    value={compLink}
                    onFocus={(e) => e.currentTarget.select()}
                    className="w-full rounded border border-white/15 bg-neutral-950 px-2 py-1.5 text-[11px] text-white/80"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(compLink);
                      setCopiado(true);
                      window.setTimeout(() => setCopiado(false), 2000);
                    }}
                    className="mt-1 rounded border border-white/15 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
                  >
                    {copiado ? "✓ copiado" : "copiar link"}
                  </button>
                  <p className="mt-1 text-[11px] text-white/40">
                    Cualquiera con el link ve una copia de este árbol (solo
                    lectura). El link no caduca.
                    {!usuario &&
                      " Para poder despublicarlo, iniciá sesión antes de compartir."}
                  </p>
                </div>
              )}

              {usuario && mios !== null && (
                <div className="mt-3">
                  <p className="mb-1 text-[11px] text-white/40">
                    Mis árboles compartidos ({mios.length})
                  </p>
                  {mios.length === 0 ? (
                    <p className="text-[11px] text-white/40">
                      Todavía no compartiste ninguno con esta cuenta.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {mios.map((a) => (
                        <li
                          key={a.slug}
                          className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px]"
                        >
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            className="min-w-0 flex-1 truncate text-white/80 hover:text-white hover:underline"
                            title={a.titulo}
                          >
                            {a.titulo || a.slug}
                          </a>
                          <button
                            type="button"
                            onClick={() => void hacerDespublicar(a.slug)}
                            disabled={despublicando === a.slug}
                            className="shrink-0 rounded border border-red-400/40 px-1.5 py-0.5 text-red-300 hover:bg-red-500/20 disabled:opacity-40"
                          >
                            {despublicando === a.slug
                              ? "…"
                              : "despublicar"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
