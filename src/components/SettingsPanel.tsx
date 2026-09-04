"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ESCALA_TEXTO_MAX,
  ESCALA_TEXTO_MIN,
  type Settings,
} from "./settings";
import {
  despublicarArbol,
  misArbolesCompartidos,
  type ArbolCompartido,
} from "@/model/compartir";
import {
  ErrorIA,
  GEMINI_MODELOS_MUERTOS,
  GUIA_API_KEY,
  INFO_MODELO_WEBLLM,
  MODELOS_WEBLLM,
  MODELO_POR_DEFECTO,
  MODELO_WEBLLM_POR_NIVEL,
  NOMBRE_PROVEEDOR,
  OLLAMA_SENTINEL,
  OLLAMA_URL,
  PISTA_API_KEY,
  PROVEEDORES_DISPONIBLES,
  PROVEEDORES_VIA_PROXY,
  WEBLLM_SENTINEL,
  avisoFormatoKey,
  proveedorDeLaKey,
  proveedorSinKey,
  listarModelos,
  type ConfigIA,
} from "@/model/ia";
import { hayWebGPU, nivelEquipoWebLLM } from "@/model/webllm";
import {
  PROMPTS_PRESET,
  leerPromptsMios,
  guardarPromptMio,
  borrarPromptMio,
} from "@/model/prompts";
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
  // Pestaña activa del panel. No persiste (preferencia de sesión).
  const [tab, setTab] = useState<"lienzo" | "ia">("lienzo");
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
  // Ollama (localhost) y WebLLM (in-browser) corren sin auth: no hay API key.
  // `configIA` guarda un sentinel para que la entrada persista (el almacén tira
  // las sin key). Ver decisiones §7f.
  const esOllama = proveedor === "ollama";
  const esWebllm = proveedor === "webllm";
  const esLocal = proveedorSinKey(proveedor);
  const sentinelLocal = esWebllm ? WEBLLM_SENTINEL : OLLAMA_SENTINEL;
  const keyGuardada = configIA.apiKey;
  const modeloGuardado = configIA.modelo || MODELO_POR_DEFECTO[proveedor];
  const hayKey = !esLocal && keyGuardada.trim() !== "";

  // WebLLM necesita WebGPU (Chrome/Edge escritorio). `hayWebGPU()` es SSR-safe
  // (chequea `typeof navigator`); el panel de ⚙️ no está en el paint inicial, así
  // que el initializer lazy corre en cliente sin mismatch de hidratación.
  const [hayGpu] = useState(() => hayWebGPU());

  // Recomendación "mejor esfuerzo" de modelo WebLLM según el equipo detectado.
  // `null` mientras detecta o si falló → se cae al `recomendado` estático (3B).
  const [recomEquipo, setRecomEquipo] = useState<
    { id: string; motivo: string } | null
  >(null);
  useEffect(() => {
    if (!esWebllm || !hayGpu) return;
    let vivo = true;
    void nivelEquipoWebLLM()
      .then((r) => {
        if (vivo) {
          setRecomEquipo({ id: MODELO_WEBLLM_POR_NIVEL[r.nivel], motivo: r.motivo });
        }
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [esWebllm, hayGpu]);

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
  const [modelos, setModelos] = useState<string[] | null>(
    proveedor === "webllm" ? MODELOS_WEBLLM : null,
  );
  const [cargandoModelos, setCargandoModelos] = useState(false);
  const [errorModelos, setErrorModelos] = useState<string | null>(null);
  // Filtro de texto para la lista de chips (OpenRouter devuelve ~300 modelos).
  const [filtroModelo, setFiltroModelo] = useState("");

  // Re-sincronizar los borradores cuando la config cambia desde afuera (cambio
  // de proveedor, "Borrar", key guardada de otro proveedor). Patrón "ajustar
  // estado en render", no en effect.
  const [snap, setSnap] = useState({
    p: proveedor,
    k: keyGuardada,
    m: modeloGuardado,
  });
  // Key que hay que conservar cruzando un cambio de proveedor (auto-switch: pegaste
  // una key de otro proveedor y aceptaste cambiar → no perderla en el re-sync).
  const [keyTrasCambio, setKeyTrasCambio] = useState<string | null>(null);
  if (snap.p !== proveedor || snap.k !== keyGuardada || snap.m !== modeloGuardado) {
    setSnap({ p: proveedor, k: keyGuardada, m: modeloGuardado });
    setKeyDraft(keyTrasCambio ?? keyGuardada);
    if (keyTrasCambio !== null) setKeyTrasCambio(null);
    setModeloDraft(modeloGuardado);
    // WebLLM: la lista es fija y conocida → mostrarla de una (sin "ver modelos").
    setModelos(proveedor === "webllm" ? MODELOS_WEBLLM : null);
    setErrorModelos(null);
    setFiltroModelo("");
  }

  const dirty = esLocal
    ? modeloDraft.trim() !== modeloGuardado.trim() || keyGuardada.trim() === ""
    : keyDraft.trim() !== keyGuardada.trim() ||
      modeloDraft.trim() !== modeloGuardado.trim();

  const keyEfectiva = esLocal
    ? sentinelLocal
    : keyDraft.trim() || keyGuardada.trim();

  // Chequeo de formato local (gratis): avisa si la key no pinta del proveedor
  // elegido. No garantiza que funcione — para eso, "ver modelos".
  const avisoFormato = avisoFormatoKey(proveedor, keyDraft);

  // La key pegada es INEQUÍVOCAMENTE de otro proveedor → ofrecer cambiar.
  const provDeLaKey = proveedorDeLaKey(keyDraft);
  const sugerirCambio =
    provDeLaKey !== null && provDeLaKey !== proveedor ? provDeLaKey : null;

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
      apiKey: esLocal ? sentinelLocal : keyDraft.trim(),
      modelo: modeloDraft.trim() || MODELO_POR_DEFECTO[proveedor],
    });
    setAplicado(true);
    window.setTimeout(() => setAplicado(false), 2000);
    // Al guardar una key, traer de una la lista de modelos que esa key puede
    // usar (varía por key) → el usuario ve las opciones y confirma que la key
    // es válida sin gastar tokens.
    if (esLocal || keyDraft.trim()) void verModelos();
  };

  const cambiarProveedor = (p: Proveedor, conservarKey?: string) => {
    // Aplica al toque. Trae la key guardada de ese proveedor (si probaste otro
    // y volvés, no hay que re-pegarla). Los borradores se re-sincronizan solos.
    // `conservarKey`: la del auto-switch (pegaste una key de `p` estando en otro).
    if (conservarKey) setKeyTrasCambio(conservarKey);
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

  // Chips de modelos bajo el input: SOLO los que la key puede usar de verdad
  // (`listarModelos` tras "verificar"). Nunca modelos adivinados — evita ofrecer
  // uno que la key no tiene (reemplazó al viejo <datalist> y a MODELOS_SUGERIDOS).
  const modelosKey = modelos ?? [];
  const f = filtroModelo.trim().toLowerCase();
  // Se muestran TODOS los modelos de la key (sin tope). El filtro y el <details>
  // plegable hacen manejable una lista larga (OpenRouter ≈ 300).
  const chipsModelo = f
    ? modelosKey.filter((m) => m.toLowerCase().includes(f))
    : modelosKey;
  const mostrarFiltro = modelosKey.length > 12;

  // ── Prompts de sistema: presets + guardados + cargar archivo ──────────────
  const [promptsMios, setPromptsMios] = useState(() => leerPromptsMios());
  // Nombre del prompt guardado que está cargado ahora (para ofrecer borrarlo).
  const promptMioActual =
    promptsMios.find((p) => p.texto === settings.systemPrompt)?.nombre ?? null;

  const cargarPromptSel = (v: string) => {
    if (v.startsWith("P:")) {
      const p = PROMPTS_PRESET.find((x) => x.nombre === v.slice(2));
      if (p) onChange({ systemPrompt: p.texto });
    } else if (v.startsWith("M:")) {
      const p = promptsMios.find((x) => x.nombre === v.slice(2));
      if (p) onChange({ systemPrompt: p.texto });
    }
  };
  const guardarPromptActual = () => {
    const t = settings.systemPrompt.trim();
    if (!t) return;
    const nombre = window.prompt("Nombre para este prompt:", promptMioActual ?? "");
    if (nombre?.trim()) setPromptsMios(guardarPromptMio(nombre, t));
  };
  const borrarPromptActual = () => {
    if (promptMioActual) setPromptsMios(borrarPromptMio(promptMioActual));
  };
  const cargarPromptArchivo = (file: File | undefined) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () =>
      onChange({ systemPrompt: String(r.result ?? "").slice(0, 8000) });
    r.readAsText(file);
  };

  const bloqueSystemPrompt = (
    <label className="block text-sm">
      <span className="text-text-muted">Instrucción de sistema (opcional)</span>
      <textarea
        value={settings.systemPrompt}
        onChange={(e) => onChange({ systemPrompt: e.target.value })}
        rows={3}
        placeholder="Ej: Respondé en español, conciso. Ecuaciones entre $$ … $$."
        className="mt-1.5 w-full resize-y rounded border border-line bg-surface-2 px-2 py-1 text-xs text-text placeholder:text-text-faint focus:border-sky-500 focus:outline-none"
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
        <select
          value=""
          onChange={(e) => {
            cargarPromptSel(e.target.value);
            e.currentTarget.value = "";
          }}
          className="rounded border border-line bg-bg px-1.5 py-1 text-text-muted focus:border-sky-400 focus:outline-none"
        >
          <option value="">Cargar un prompt…</option>
          <optgroup label="De 3maps">
            {PROMPTS_PRESET.map((p) => (
              <option key={p.nombre} value={`P:${p.nombre}`}>
                {p.nombre}
              </option>
            ))}
          </optgroup>
          {promptsMios.length > 0 && (
            <optgroup label="Míos">
              {promptsMios.map((p) => (
                <option key={p.nombre} value={`M:${p.nombre}`}>
                  {p.nombre}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button
          type="button"
          onClick={guardarPromptActual}
          disabled={!settings.systemPrompt.trim()}
          className="rounded border border-line px-1.5 py-1 text-text-muted enabled:hover:bg-surface-2 disabled:opacity-40"
        >
          💾 Guardar
        </button>
        <label className="cursor-pointer rounded border border-line px-1.5 py-1 text-text-muted hover:bg-surface-2">
          📁 Archivo
          <input
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            className="hidden"
            onChange={(e) => cargarPromptArchivo(e.target.files?.[0])}
          />
        </label>
        {promptMioActual && (
          <button
            type="button"
            onClick={borrarPromptActual}
            className="rounded border border-danger/40 px-1.5 py-1 text-danger hover:bg-red-500/20"
          >
            🗑 “{promptMioActual}”
          </button>
        )}
      </div>
      <span className="mt-1 block text-[11px] text-text-faint">
        Se antepone a cada pregunta. No afecta el resumen del contexto viejo. Los
        prompts guardados quedan en este navegador.
      </span>
    </label>
  );

  const bloqueCompartir = onCompartir ? (
    <>
      <hr className="my-3 border-line" />
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-faint">
        Compartir
      </p>
      <label className="block text-sm">
        <span className="text-text-muted">Título (opcional)</span>
        <input
          type="text"
          value={compTitulo}
          onChange={(e) => setCompTitulo(e.target.value)}
          placeholder="Se usa la primera pregunta si lo dejás vacío"
          className="mt-1 w-full rounded border border-line bg-bg px-2 py-1.5 text-sm placeholder:text-text-faint focus:border-sky-400 focus:outline-none"
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
        <p className="mt-1.5 text-[11px] text-danger">{compError}</p>
      )}
      {compLink && (
        <div className="mt-2">
          <input
            type="text"
            readOnly
            value={compLink}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded border border-line bg-bg px-2 py-1.5 text-[11px] text-text-muted"
          />
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(compLink);
              setCopiado(true);
              window.setTimeout(() => setCopiado(false), 2000);
            }}
            className="mt-1 rounded border border-line px-2 py-1 text-[11px] text-text-muted hover:bg-surface-2"
          >
            {copiado ? "✓ copiado" : "copiar link"}
          </button>
          <p className="mt-1 text-[11px] text-text-faint">
            Cualquiera con el link ve una copia de este árbol (solo lectura). El
            link no caduca.
            {!usuario &&
              " Para poder despublicarlo, iniciá sesión antes de compartir."}
          </p>
        </div>
      )}
      {usuario && mios !== null && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] text-text-faint">
            Mis árboles compartidos ({mios.length})
          </p>
          {mios.length === 0 ? (
            <p className="text-[11px] text-text-faint">
              Todavía no compartiste ninguno con esta cuenta.
            </p>
          ) : (
            <ul className="space-y-1">
              {mios.map((a) => (
                <li
                  key={a.slug}
                  className="flex items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1 text-[11px]"
                >
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate text-text-muted hover:text-text hover:underline"
                    title={a.titulo}
                  >
                    {a.titulo || a.slug}
                  </a>
                  <button
                    type="button"
                    onClick={() => void hacerDespublicar(a.slug)}
                    disabled={despublicando === a.slug}
                    className="shrink-0 rounded border border-danger/40 px-1.5 py-0.5 text-danger hover:bg-red-500/20 disabled:opacity-40"
                  >
                    {despublicando === a.slug ? "…" : "despublicar"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  ) : null;

  // Toggle rápido de tema (botón al lado de la ⚙️). Alterna claro↔oscuro; para
  // "según el sistema" está el select adentro del panel. Base: cualquier valor
  // que no sea "claro" (oscuro o sistema) → el botón lleva a "claro".
  const temaClaro = settings.tema === "claro";
  const alternarTema = () =>
    onChange({ tema: temaClaro ? "oscuro" : "claro" });

  return (
    <div ref={contenedorRef} className="absolute left-4 top-4 z-10">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Ajustes"
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface/95 text-lg shadow-lg backdrop-blur transition-colors hover:bg-surface-2"
        >
          ⚙️
        </button>
        <button
          type="button"
          onClick={alternarTema}
          aria-label={temaClaro ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
          title={temaClaro ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface/95 text-base shadow-lg backdrop-blur transition-colors hover:bg-surface-2"
        >
          {temaClaro ? "🌙" : "☀️"}
        </button>
      </div>

      {open && (
        <div className="mt-2 max-h-[calc(100dvh-18rem)] w-72 overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface/95 p-3 text-text shadow-xl backdrop-blur sm:max-h-[80vh]">
          {/* Pestañas: "Lienzo" (comportamiento del mapa) / "IA" (conectividad). */}
          <div className="mb-3 flex gap-1 rounded bg-surface-2 p-0.5 text-xs">
            {(["lienzo", "ia"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 rounded px-2 py-1 font-medium ${
                  tab === t
                    ? "bg-surface text-text"
                    : "text-text-faint hover:text-text-muted"
                }`}
              >
                {t === "ia" ? "IA" : "Lienzo"}
              </button>
            ))}
          </div>

          {tab === "lienzo" && (
            <>
              <label className="block text-sm">
                <span className="flex items-center justify-between">
                  <span>Envión al soltar</span>
                  <span className="text-text-faint">
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

              <label className="mt-3 block text-sm">
                <span className="flex items-center justify-between">
                  <span className="text-text-muted">Ventana de contexto</span>
                  <span className="text-text-faint">
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
                <span className="mt-1 block text-[11px] text-text-faint">
                  Los más recientes van completos; los anteriores se resumen.
                </span>
              </label>

              <label className="mt-3 block text-sm">
                <span className="flex items-center justify-between">
                  <span className="text-text-muted">Crecimiento del globo</span>
                  <span className="text-text-faint">
                    {settings.crecimientoPxPorMensaje <= 0
                      ? "no crece"
                      : `+${settings.crecimientoPxPorMensaje}px / mensaje`}
                  </span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={24}
                  step={1}
                  value={settings.crecimientoPxPorMensaje}
                  onChange={(e) =>
                    onChange({
                      crecimientoPxPorMensaje: Number(e.target.value),
                    })
                  }
                  className="mt-2 w-full accent-sky-500"
                />
                <span className="mt-1 block text-[11px] text-text-faint">
                  El globo se hace más alto según cuántos mensajes tenga la
                  conversación — para verlo de lejos. Máx +{settings.crecimientoTope}px.
                </span>
              </label>

              {settings.crecimientoPxPorMensaje > 0 && (
                <label className="mt-3 block text-sm">
                  <span className="flex items-center justify-between">
                    <span className="text-text-muted">Tope de crecimiento</span>
                    <span className="text-text-faint">
                      +{settings.crecimientoTope}px
                    </span>
                  </span>
                  <input
                    type="range"
                    min={80}
                    max={600}
                    step={40}
                    value={settings.crecimientoTope}
                    onChange={(e) =>
                      onChange({ crecimientoTope: Number(e.target.value) })
                    }
                    className="mt-2 w-full accent-sky-500"
                  />
                </label>
              )}

              <label className="mt-3 block text-sm">
                <span className="flex items-center justify-between">
                  <span className="text-text-muted">Grosor de las líneas</span>
                  <span className="text-text-faint">
                    {(settings.grosorLineas ?? 1.5).toFixed(1)} px
                  </span>
                </span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={0.5}
                  value={settings.grosorLineas ?? 1.5}
                  onChange={(e) =>
                    onChange({ grosorLineas: Number(e.target.value) })
                  }
                  className="mt-2 w-full accent-sky-500"
                />
                <span className="mt-1 block text-[11px] text-text-faint">
                  Las flechas que conectan los globos.
                </span>
              </label>

              <label className="mt-3 block text-sm">
                <span className="text-text-muted">Tema</span>
                <select
                  value={settings.tema ?? "oscuro"}
                  onChange={(e) =>
                    onChange({ tema: e.target.value as Settings["tema"] })
                  }
                  className="mt-1.5 w-full rounded border border-line bg-bg px-2 py-1 text-sm text-text-muted focus:border-sky-400 focus:outline-none"
                >
                  <option value="oscuro">Oscuro</option>
                  <option value="claro">Claro</option>
                  <option value="sistema">Según el sistema</option>
                </select>
              </label>

              <label className="mt-3 block text-sm">
                <span className="text-text-muted">Fuente</span>
                <select
                  value={settings.fuenteTexto ?? "sistema"}
                  onChange={(e) =>
                    onChange({
                      fuenteTexto: e.target
                        .value as Settings["fuenteTexto"],
                    })
                  }
                  className="mt-1.5 w-full rounded border border-line bg-bg px-2 py-1 text-sm text-text-muted focus:border-sky-400 focus:outline-none"
                >
                  <option value="sistema">Sistema (Arial)</option>
                  <option value="geist">Geist (sans)</option>
                  <option value="serif">Lora (serif)</option>
                  <option value="mono">Mono</option>
                </select>
              </label>

              <label className="mt-3 block text-sm">
                <span className="flex items-center justify-between">
                  <span className="text-text-muted">Tamaño del texto</span>
                  <span className="text-text-faint">
                    {Math.round((settings.escalaTexto ?? 1) * 100)}%
                  </span>
                </span>
                <input
                  type="range"
                  min={ESCALA_TEXTO_MIN}
                  max={ESCALA_TEXTO_MAX}
                  step={0.05}
                  value={settings.escalaTexto ?? 1}
                  onChange={(e) =>
                    onChange({ escalaTexto: Number(e.target.value) })
                  }
                  className="mt-2 w-full accent-sky-500"
                />
                <span className="mt-1 block text-[11px] text-text-faint">
                  Afecta a toda la app.
                </span>
              </label>

              <label className="mt-3 flex items-center justify-between gap-2 text-sm">
                <span>
                  <span className="text-text-muted">Zoom de lupa al pasar el mouse</span>
                  <span className="mt-0.5 block text-[11px] text-text-faint">
                    El globo se agranda mientras lo apuntás, para leerlo.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.hoverZoom ?? false}
                  onChange={(e) => onChange({ hoverZoom: e.target.checked })}
                  className="h-4 w-4 shrink-0 accent-sky-500"
                />
              </label>

              {bloqueCompartir}
            </>
          )}

          {tab === "ia" && (
           <>
          <label className="block text-sm">
            <span className="text-text-muted">Proveedor</span>
            <select
              value={proveedor}
              onChange={(e) => cambiarProveedor(e.target.value as Proveedor)}
              className="mt-1 w-full rounded border border-line bg-bg px-2 py-1.5 text-sm"
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
            <div className="mt-2 rounded border border-warn/30 bg-warn/10 p-2 text-[11px] text-text-muted">
              {!proxyDisponible ? (
                <p className="text-warn">
                  {NOMBRE_PROVEEDOR[proveedor]} necesita el proxy de 3maps y esta
                  instancia no lo tiene configurado. Usá Gemini o Claude.
                </p>
              ) : (
                <label className="flex items-start gap-1.5">
                  <input
                    type="checkbox"
                    checked={settings.usarProxyIA}
                    onChange={(e) =>
                      onChange({ usarProxyIA: e.target.checked })
                    }
                    className="mt-0.5 accent-sky-500"
                  />
                  <span>
                    Usar el proxy de 3maps para {NOMBRE_PROVEEDOR[proveedor]} (tu
                    key pasa por el servidor de 3maps).
                  </span>
                </label>
              )}
              <details className="group mt-1">
                <summary className="cursor-pointer list-none text-text-faint marker:content-none hover:text-text-muted">
                  <span className="mr-1 inline-block transition-transform group-open:rotate-90">
                    ▸
                  </span>
                  ¿por qué pasa por un proxy?
                </summary>
                <p className="mt-1 text-text-muted">
                  {NOMBRE_PROVEEDOR[proveedor]} no habilita CORS, así que el
                  navegador no puede llamarlo directo. El edge function{" "}
                  <span className="text-text-muted">ia-proxy</span> solo reenvía la
                  request con tu key — no la guarda ni la registra (stateless).
                </p>
              </details>
            </div>
          )}

          {esWebllm ? (
            !hayGpu ? (
              <p className="mt-2 rounded border border-warn/30 bg-warn/10 p-2 text-[11px] text-warn">
                Tu navegador no expone WebGPU: necesitás Chrome/Edge de escritorio
                con una GPU. No anda en móvil.
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-text-faint">
                Corre en tu navegador (WebGPU) — sin key, sin costo. Detalle abajo.
              </p>
            )
          ) : esOllama ? (
            <div className="mt-2 rounded border border-line bg-surface-2 p-2 text-[11px] text-text-muted">
              El modelo corre en <span className="text-text">tu máquina</span>,
              no gasta tokens. Requiere el server de Ollama escuchando en{" "}
              <span className="text-text">{OLLAMA_URL}</span> y un modelo bajado
              (<span className="text-text">ollama pull qwen2.5vl:7b</span>).
              No hay API key. Anda en Chrome/Edge de escritorio;{" "}
              <span className="text-warn">
                Safari y el celular no llegan a tu localhost
              </span>
              .
            </div>
          ) : (
            <label className="mt-2 block text-sm">
              <span className="text-text-muted">API key</span>
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
                className={`mt-1 w-full rounded border bg-bg px-2 py-1.5 text-sm placeholder:text-text-faint focus:outline-none ${
                  avisoFormato
                    ? "border-warn/60 focus:border-warn"
                    : "border-line focus:border-sky-400"
                }`}
              />
              {sugerirCambio ? (
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-warn">
                  Esta key parece de {NOMBRE_PROVEEDOR[sugerirCambio]}.
                  <button
                    type="button"
                    onClick={() =>
                      cambiarProveedor(sugerirCambio, keyDraft.trim())
                    }
                    className="rounded border border-warn/50 px-1.5 py-0.5 font-medium text-warn hover:bg-warn/10"
                  >
                    Cambiar a {NOMBRE_PROVEEDOR[sugerirCambio]}
                  </button>
                </span>
              ) : avisoFormato ? (
                <span className="mt-1 block text-[11px] text-warn">
                  {avisoFormato}
                </span>
              ) : null}
            </label>
          )}

          {/* Mini-guía para gente que nunca sacó una API key. */}
          <details className="group mt-1.5 rounded border border-line bg-surface-2 text-xs">
            <summary className="cursor-pointer list-none px-2 py-1.5 text-text-muted marker:content-none hover:text-text">
              <span className="mr-1 inline-block transition-transform group-open:rotate-90">
                ▸
              </span>
              {esWebllm
                ? "¿Qué es el modelo local del navegador?"
                : esOllama
                  ? "¿Cómo pongo a andar Ollama?"
                  : "¿No sabés cómo conseguir tu API key?"}
            </summary>
            <div className="space-y-1.5 px-2 pb-2 pt-0.5 text-text-muted">
              <p>
                {esWebllm ? (
                  <span>
                    Un modelo de IA que corre en tu navegador con WebGPU, gratis.
                    No instalás nada; se descarga la 1ª vez y queda cacheado.{" "}
                  </span>
                ) : esOllama ? (
                  <span>
                    Un modelo local, gratis, corriendo en tu compu. Instalás Ollama
                    una vez y bajás el modelo.{" "}
                  </span>
                ) : (
                  <>
                    Es la contraseña que le da acceso a 3maps al proveedor que
                    elegiste ({NOMBRE_PROVEEDOR[proveedor]}). La sacás en su web, en
                    1 minuto.{" "}
                  </>
                )}
                {GUIA_API_KEY[proveedor].gratis ? (
                  <span className="text-ok">Este proveedor es gratis.</span>
                ) : (
                  <span className="text-warn">
                    Este proveedor cobra (necesita saldo). Si querés uno 100%
                    gratis, elegí <span className="text-text">Google Gemini</span>{" "}
                    arriba.
                  </span>
                )}
                {GUIA_API_KEY[proveedor].abierto && (
                  <>
                    {" "}
                    <span className="text-text-muted">
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
                {esWebllm
                  ? "Sobre WebLLM ↗"
                  : esOllama
                    ? "Descargar Ollama ↗"
                    : `Abrir la web de ${NOMBRE_PROVEEDOR[proveedor]} ↗`}
              </a>
              {!esLocal && (
                <p className="text-[11px] text-text-faint">
                  La clave se guarda solo en este navegador (y, si iniciás sesión,
                  en tu cuenta para tenerla en todos tus dispositivos). Nunca la
                  compartimos.
                </p>
              )}
            </div>
          </details>

          <label className="mt-2 block text-sm">
            <span className="text-text-muted">Modelo</span>
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
              className="mt-1 w-full rounded border border-line bg-bg px-2 py-1.5 text-sm focus:border-sky-400 focus:outline-none"
            />
          </label>

          {!esWebllm && (
            <>
              <button
                type="button"
                onClick={verModelos}
                disabled={!keyEfectiva || cargandoModelos || !proveedorHabilitado}
                className="mt-1.5 rounded border border-line px-2 py-1 text-[11px] text-text-muted enabled:hover:bg-surface-2 disabled:opacity-40"
              >
                {cargandoModelos
                  ? esOllama
                    ? "consultando Ollama…"
                    : "verificando key…"
                  : esOllama
                    ? "↻ ver modelos que bajaste"
                    : "↻ verificar key y ver sus modelos"}
              </button>
              <span className="mt-1 block text-[11px] text-text-faint">
                {esOllama
                  ? "Lista lo que devuelve `ollama list` en tu máquina."
                  : "Consulta gratis (no gasta tokens): si la key es inválida, avisa acá."}
              </span>
            </>
          )}

          {errorModelos && (
            <p className="mt-1.5 text-[11px] text-danger">{errorModelos}</p>
          )}

          {modeloMuerto ? (
            <p className="mt-1.5 text-[11px] text-warn">
              “{modeloDraft.trim()}” no anda en el free tier de Gemini; se va a
              usar {MODELO_POR_DEFECTO.gemini}.
            </p>
          ) : (
            modeloFueraDeLista && (
              <p className="mt-1.5 text-[11px] text-warn">
                Tu key no incluye “{modeloDraft.trim()}”. Elegí uno de abajo.
              </p>
            )
          )}

          {esWebllm && modelosKey.length > 0 && (
            <div className="mt-1.5 space-y-1">
              <p className="text-[11px] text-text-faint">
                Elegí según tu máquina (se baja 1 vez):
              </p>
              {recomEquipo && INFO_MODELO_WEBLLM[recomEquipo.id] && (
                <p className="text-[11px] text-ok">
                  Para tu equipo:{" "}
                  <span className="font-medium">
                    {INFO_MODELO_WEBLLM[recomEquipo.id].nombre}
                  </span>{" "}
                  <span className="text-text-faint">— {recomEquipo.motivo}</span>
                </p>
              )}
              {modelosKey.map((m) => {
                const info = INFO_MODELO_WEBLLM[m];
                const sel = m === modeloDraft.trim();
                // Badge dinámico si detectamos el equipo; si no, el estático (3B).
                const paraTuEquipo = recomEquipo?.id === m;
                const badge = paraTuEquipo
                  ? "✓ para tu equipo"
                  : !recomEquipo && info?.recomendado
                    ? "recomendado"
                    : null;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModeloDraft(m)}
                    className={`block w-full rounded border px-2 py-1.5 text-left text-[11px] ${
                      sel
                        ? "border-sky-500 bg-sky-500/15 text-text"
                        : "border-line bg-surface-2 text-text-muted hover:bg-line"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium text-text">
                        {info?.nombre ?? m}
                      </span>
                      {info && (
                        <span className="text-text-faint">· ~{info.gb} GB</span>
                      )}
                      {badge && (
                        <span className="rounded bg-ok/15 px-1 text-[10px] text-ok">
                          {badge}
                        </span>
                      )}
                    </span>
                    {info && (
                      <span className="mt-0.5 block text-text-faint">{info.nota}</span>
                    )}
                  </button>
                );
              })}
              <p className="text-[10px] text-text-faint">
                En gráfica integrada andan lentos; el 7B pide una GPU con VRAM
                libre. Sin internet no puede &ldquo;buscar&rdquo; datos.
              </p>
            </div>
          )}

          {!esWebllm &&
            modelosKey.length > 0 &&
            (() => {
              const chips = (
                <>
                  <div className="scroll-fino flex max-h-52 flex-wrap gap-1 overflow-y-auto">
                    {chipsModelo.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setModeloDraft(m)}
                        className={`rounded px-1.5 py-0.5 text-[11px] ${
                          m === modeloDraft.trim()
                            ? "bg-sky-500 text-white"
                            : "bg-surface-2 text-text-muted hover:bg-line"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  {chipsModelo.length === 0 && (
                    <p className="text-[11px] text-text-faint">
                      Ningún modelo coincide con “{filtroModelo.trim()}”.
                    </p>
                  )}
                </>
              );
              // Lista corta → chips inline. Lista larga (OpenRouter, HF) →
              // <details> plegado + filtro adentro, para no tapar el panel.
              return mostrarFiltro ? (
                <details className="group mt-1.5 rounded border border-line bg-surface-2 text-xs">
                  <summary className="cursor-pointer list-none px-2 py-1.5 text-text-muted marker:content-none hover:text-text">
                    <span className="mr-1 inline-block transition-transform group-open:rotate-90">
                      ▸
                    </span>
                    Elegir de tus {modelosKey.length} modelos
                  </summary>
                  <div className="space-y-1 px-2 pb-2 pt-0.5">
                    <input
                      type="text"
                      value={filtroModelo}
                      onChange={(e) => setFiltroModelo(e.target.value)}
                      placeholder="filtrar…"
                      className="w-full rounded border border-line bg-bg px-2 py-1 text-[11px] placeholder:text-text-faint focus:border-sky-400 focus:outline-none"
                    />
                    {chips}
                  </div>
                </details>
              ) : (
                <div className="mt-1.5">
                  <p className="mb-1 text-[11px] text-text-faint">
                    Modelos de tu key (click para elegir):
                  </p>
                  {chips}
                </div>
              );
            })()}

          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={commit}
              disabled={!dirty || (esWebllm && !hayGpu)}
              className="rounded bg-sky-500 px-3 py-1.5 text-xs font-medium text-white enabled:hover:bg-sky-400 disabled:opacity-40"
            >
              {dirty
                ? "Guardar"
                : aplicado
                  ? "✓ Aplicado"
                  : hayKey || (esLocal && keyGuardada.trim() !== "")
                    ? "✓ Guardado"
                    : "Guardar"}
            </button>
            {hayKey && (
              <button
                type="button"
                onClick={onBorrarKeyIA}
                className="text-xs text-text-faint hover:text-text-muted"
              >
                Borrar key
              </button>
            )}
          </div>
          <span className="mt-1.5 block text-[11px] text-text-faint">
            {dirty
              ? "Cambios sin guardar."
              : aplicado
                ? "Config aplicada. Ya podés mandar una pregunta."
                : esWebllm
                  ? "El modelo corre en esta pestaña — nada sale de tu compu."
                  : esOllama
                    ? `Se llama directo a ${OLLAMA_URL} — nada sale de tu red.`
                    : hayKey
                      ? "Guardada en este navegador. Se manda directo al proveedor."
                      : "La key se guarda solo en este navegador; nunca a un servidor de 3maps."}
          </span>

          {haySupabase() && (
            <>
              <hr className="my-3 border-line" />
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-faint">
                Cuenta
              </p>
              {cargandoSesion ? (
                <p className="text-[11px] text-text-faint">…</p>
              ) : usuario ? (
                <div className="text-sm">
                  <p className="text-text-muted">
                    Sesión iniciada como{" "}
                    <span className="text-text">{usuario.email}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-text-faint">
                    {estadoSync === "sincronizando"
                      ? "☁ sincronizando…"
                      : estadoSync === "error"
                        ? "⚠ no se pudo sincronizar (se reintenta al editar)"
                        : "☁ tu árbol se sincroniza entre dispositivos"}
                  </p>
                  <button
                    type="button"
                    onClick={() => void cerrarSesion()}
                    className="mt-1.5 rounded border border-line px-2 py-1 text-[11px] text-text-muted hover:bg-surface-2"
                  >
                    Cerrar sesión
                  </button>
                </div>
              ) : linkEnviado ? (
                <p className="text-[11px] text-text-muted">
                  Te mandamos un link a <span className="text-text">{email}</span>.
                  Abrilo desde este dispositivo para entrar. (Revisá spam.)
                </p>
              ) : (
                <div className="text-sm">
                  <p className="mb-1.5 text-[11px] text-text-faint">
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
                  <p className="my-1.5 text-center text-[11px] text-text-faint">
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
                    className="w-full rounded border border-line bg-bg px-2 py-1.5 text-sm placeholder:text-text-faint focus:border-sky-400 focus:outline-none"
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
                    <p className="mt-1.5 text-[11px] text-danger">{authError}</p>
                  )}
                </div>
              )}
            </>
          )}

          <hr className="my-3 border-line" />
          {bloqueSystemPrompt}
          </>
          )}
        </div>
      )}
    </div>
  );
}
