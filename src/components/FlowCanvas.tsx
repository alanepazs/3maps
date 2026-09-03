"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  ControlButton,
  MiniMap,
  SelectionMode,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type OnSelectionChangeParams,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import MessageNode from "./MessageNode";
import Composer, { type BranchKind } from "./Composer";
import SettingsPanel from "./SettingsPanel";
import { useSync } from "./useSync";
import PanelConversacion from "./PanelConversacion";
import ToolbarGrupo from "./ToolbarGrupo";
import LoginNudge from "./LoginNudge";
import SharedBanner from "./SharedBanner";
import { NodeActionsContext } from "./nodeActions";
import {
  ANCHO_PANEL_DEFECTO,
  ANCHO_PANEL_MAX_FRAC,
  ANCHO_PANEL_MIN,
  DEFAULT_SETTINGS,
  ESCALA_TEXTO_MAX,
  ESCALA_TEXTO_MIN,
  FUENTES_TEXTO,
  SETTINGS_STORAGE_KEY,
  type Settings,
} from "./settings";
import { useNodeInertia } from "./useNodeInertia";
import { usePanInertia } from "./usePanInertia";
import {
  agregar,
  arbolAVista,
  arbolInicial,
  buscar,
  cabezaDeTramo,
  caminoRaizA,
  conColor,
  conError,
  conPosicion,
  conRama,
  conRespuesta,
  conTamano,
  crearIntercambio,
  descendientes,
  hijos,
  nuevoId,
  quitarSubarbol,
  reparentar,
  tramoDesde,
  type Adjunto,
  type Arbol,
  type ColorGlobo,
  type Intercambio,
  type Proveedor,
  type Rama,
} from "@/model/intercambio";
import { cargarArbol, guardarArbol } from "@/model/persistencia";
import {
  calcularLayout,
  resolverSuperposiciones,
  ubicarNuevoGlobo,
} from "@/model/layout";
import {
  borrarMapa,
  crearMapa,
  fusionarMapasNube,
  guardarMapas,
  asegurarUnMapa,
  leerMapas,
  nombreMapaLibre,
  nuevoMapaId,
  podarMapasBorrados,
  renombrarMapa,
  setMapaActivo,
  type Mapas,
} from "@/model/mapas";
import {
  bajarConfigNube,
  bajarIndiceMapasNube,
  borrarMapaNube,
  empezarDeCeroNube,
  epochAplicado,
  marcarEpoch,
  subirConfigNube,
  subirIndiceMapasNube,
} from "@/model/sync";
import { useSesion } from "./useSesion";
import MapaSwitcher from "./MapaSwitcher";
import {
  armarContexto,
  estimarTokens,
  intercambiosRelevantes,
  tramoAResumir,
} from "@/model/contexto";
import {
  llamarIA,
  resumir,
  MODELO_POR_DEFECTO,
  NOMBRE_PROVEEDOR,
  type ConfigIA,
} from "@/model/ia";
import {
  borrarKeyProveedor,
  cambiarProveedorActivo,
  exportarConfigNube,
  fusionarConfigNube,
  cargarConfigIA,
  guardarConfigIA,
  scopeConfigIA,
} from "@/model/configIA";
import { haySupabase } from "@/model/supabase";
import { rutaAsset } from "@/model/assets";
import {
  cargarArbolCompartido,
  compartirArbol,
  limpiarSlugDeLaUrl,
  slugDeLaUrl,
} from "@/model/compartir";

// Definido a nivel de módulo (no dentro del componente): si React Flow recibe
// un objeto nodeTypes nuevo en cada render, remonta todos los nodos.
const nodeTypes: NodeTypes = { message: MessageNode };

// La cabeza del tramo del último intercambio (para seleccionar/activar un nodo
// al cargar / cambiar de mapa — los nodos son tramos, no intercambios).
function cabezaUltimo(a: Arbol): string | null {
  const u = a.intercambios.at(-1)?.id;
  return u ? cabezaDeTramo(a, u) : null;
}

// Comparación shallow del `data` de un nodo. `intercambios` es un array que
// `arbolAVista` recrea en cada llamada → se ignora acá y se confía en `data.rev`
// (una firma corta del tramo). Si `rev` coincide, el nodo no cambió.
function datosIguales(a: Node["data"], b: Node["data"]): boolean {
  const ka = Object.keys(a).filter((k) => k !== "intercambios");
  const kb = Object.keys(b).filter((k) => k !== "intercambios");
  return (
    ka.length === kb.length &&
    ka.every(
      (k) =>
        (a as Record<string, unknown>)[k] ===
        (b as Record<string, unknown>)[k],
    )
  );
}

function Flow() {
  // ── Fuente de la verdad ──────────────────────────────────────────────────
  // El árbol de intercambios manda. Los nodos/edges de React Flow se derivan de
  // él (`arbolAVista`); las posiciones vuelven al árbol al soltar / frenar el
  // envión (`asentar`). Ver docs/arquitectura.md.
  //
  // SSR-safe: el primer render (server + hidratación) usa SIEMPRE la semilla
  // determinística. El árbol persistido en `localStorage` se carga después del
  // montaje (`useEffect` de abajo) — leerlo durante el render rompería la
  // hidratación.
  const semilla = useMemo(() => arbolInicial(), []);
  const activoIniId = cabezaUltimo(semilla);
  const vistaIni = useMemo(() => {
    const v = arbolAVista(semilla);
    return {
      // Marcar seleccionado el activo inicial: si no, React Flow arranca sin
      // selección y `onSelectionChange` pisa el activo con null en el montaje.
      nodes: v.nodes.map((n) =>
        n.id === activoIniId ? { ...n, selected: true } : n,
      ),
      edges: v.edges,
    };
  }, [semilla, activoIniId]);

  const [arbol, setArbol] = useState<Arbol>(semilla);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(vistaIni.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(vistaIni.edges);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(activoIniId);

  // Mapa activo (fase 3.5). Cada mapa es un árbol independiente. El registro
  // (`3maps:mapas`) y la migración del formato viejo viven en `mapas.ts`. Igual
  // que el árbol: valores neutros en SSR + 1er render, se pueblan al hidratar.
  const [mapaId, setMapaId] = useState<string>("principal");
  const [mapas, setMapas] = useState<Mapas>({});
  const { usuario } = useSesion();
  // `true` una vez que se cargó el árbol persistido: recién ahí se empieza a
  // guardar (si no, el primer effect pisaría lo guardado con la semilla).
  const [listo, setListo] = useState(false);

  // Modo "árbol compartido": si la URL trae `?compartir=<slug>` se carga ese
  // árbol y NO se toca `localStorage` hasta que el usuario guarde una copia.
  // Ver decisiones §F2-5.
  const slugInicial = useMemo(() => slugDeLaUrl(), []);
  const [compartido, setCompartido] = useState<{ titulo: string } | null>(null);
  const readOnly = compartido !== null;
  // Id a seleccionar tras la próxima reconstrucción de la vista (globo recién
  // creado, o el padre tras un borrado). null = mantener la selección actual.
  const seleccionarLuegoRef = useRef<string | null>(null);
  const { getNode, getNodes, getViewport, setViewport, setCenter, fitView } =
    useReactFlow();

  // Ancho de la ventana (para el bucket móvil/desktop del panel lateral — fase
  // 3.11 — y el encuadre del mapa — fase 3.13).
  const [anchoVentana, setAnchoVentana] = useState(1280);
  useEffect(() => {
    const upd = () => setAnchoVentana(window.innerWidth);
    upd();
    window.addEventListener("resize", upd);
    return () => window.removeEventListener("resize", upd);
  }, []);
  const esMobile = anchoVentana < 768;

  // Encuadre del mapa (fase 3.13): en el celu `fitView` quedaba muy adentro (se
  // veía 1 globo). Más padding y un tope de zoom bajo → se ven varios globos a
  // los costados. `minZoom` bajo deja alejarse más a mano con un árbol grande.
  const fitOpts = useMemo(
    () => ({
      padding: 0.18,
      minZoom: 0.15,
      maxZoom: esMobile ? 0.7 : 1.2,
    }),
    [esMobile],
  );

  // Centrar la cámara en un globo recién creado — la cámara "sigue" al hijo
  // hacia abajo aunque estuvieras leyendo el principio de un padre largo.
  // Punto ≈ centro del globo (ancho fijo 260, alto aprox. 120). Mantiene el zoom.
  const centrarEnGlobo = useCallback(
    (x: number, y: number) => {
      setCenter(x + 130, y + 120, {
        zoom: getViewport().zoom,
        duration: 400,
      });
    },
    [setCenter, getViewport],
  );

  // Hidratar después del montaje. Patrón recomendado para local-first en SSR: el
  // primer render coincide con el server (semilla) y acá se cambia al árbol
  // real. Si la URL trae `?compartir=<slug>`, se baja ese árbol de Supabase en
  // vez de leer localStorage (y si el link está roto, se cae al local).
  useEffect(() => {
    // Poblar el registro de mapas (corre la migración del formato viejo, y
    // garantiza ≥1 mapa si quedó vacío) — recién acá, no en el render.
    const { mapas: mapasIni, activo: idActivo } = asegurarUnMapa();
    setMapaId(idActivo);
    setMapas(mapasIni);

    if (slugInicial) {
      let cancelado = false;
      void cargarArbolCompartido(slugInicial).then((res) => {
        if (cancelado) return;
        if (res) {
          const ultimo = cabezaUltimo(res.arbol);
          setArbol(res.arbol);
          setActiveNodeId(ultimo);
          seleccionarLuegoRef.current = ultimo;
          setCompartido({ titulo: res.titulo });
        } else {
          limpiarSlugDeLaUrl();
          const guardado = cargarArbol(idActivo);
          const ultimo = cabezaUltimo(guardado);
          setArbol(guardado);
          setActiveNodeId(ultimo);
          seleccionarLuegoRef.current = ultimo;
        }
        setListo(true);
      });
      return () => {
        cancelado = true;
      };
    }

    const guardado = cargarArbol(idActivo);
    const ultimo = cabezaUltimo(guardado);
    setArbol(guardado);
    setActiveNodeId((cur) =>
      guardado.intercambios.some((i) => i.id === cur) ? cur : ultimo,
    );
    seleccionarLuegoRef.current = ultimo;
    setListo(true);
    // Solo corre al montar (o al cambiar el slug de compartir). Cambiar de mapa
    // en vivo va por `cambiarMapa`, no por acá.
  }, [slugInicial]);

  // `fitView` inicial (prop) fitea a la semilla; re-fitear al árbol cargado.
  // Con 0 nodos, `fitView` es un no-op de React Flow.
  useEffect(() => {
    if (!listo) return;
    const t = setTimeout(() => void fitView({ ...fitOpts, duration: 200 }), 0);
    return () => clearTimeout(t);
  }, [listo, fitView, fitOpts]);

  // Ajustes configurables (tuerquita). En el server no hay localStorage, así
  // que se usan los defaults; en el cliente se leen los guardados.
  const [settings, setSettings] = useState<Settings>(() => {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      return raw
        ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
        : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignorar: no se pudo persistir
      }
      return next;
    });
  }, []);

  // Para lo que se dibuja en el PRIMER render (atributos del contenedor, prop
  // `oculto` del Composer): usar los defaults hasta montar. Así el HTML del
  // server (que no ve localStorage) y el primer render del cliente coinciden;
  // si hay ajustes guardados no-default se aplican en el 2º render. Sin esto:
  // mismatch de hidratación ("data-chat"/`--xy-edge-stroke-width`, React 19 no
  // lo patchea). Los `useEffect` sí usan `settings` directo (corren post-montaje).
  const [hidratado, setHidratado] = useState(false);
  useEffect(() => setHidratado(true), []);
  const sVista = hidratado ? settings : DEFAULT_SETTINGS;

  // Settings que se aplican al `<html>` de forma imperativa post-montaje (sin
  // mismatch de hidratación — el SSR usa los defaults y esto ajusta al valor
  // guardado). No se limpia al desmontar: FlowCanvas vive toda la sesión.
  // - B5: fuente (`--fuente-3maps`, lo lee `body`) + tamaño (escala el
  //   `font-size` → todo lo `rem`).
  // - B7: `data-hoverzoom` → gatea la regla del zoom de lupa en globals.css
  //   (`:root[data-hoverzoom="on"] .react-flow__node:hover …`).
  useEffect(() => {
    const el = document.documentElement;
    const esc = Math.min(
      ESCALA_TEXTO_MAX,
      Math.max(ESCALA_TEXTO_MIN, settings.escalaTexto ?? 1),
    );
    el.style.fontSize = esc === 1 ? "" : `${(esc * 100).toFixed(1)}%`;
    el.style.setProperty(
      "--fuente-3maps",
      FUENTES_TEXTO[settings.fuenteTexto] ?? FUENTES_TEXTO.sistema,
    );
    el.dataset.hoverzoom = settings.hoverZoom ? "on" : "off";
  }, [settings.escalaTexto, settings.fuenteTexto, settings.hoverZoom]);

  // Configuración de la IA (proveedor activo + su API key + modelo). Solo en
  // este navegador. `configIA.ts` guarda una key POR PROVEEDOR, así que cambiar
  // de proveedor y volver no pierde la key. Lazy init igual que `settings`.
  const [configIA, setConfigIA] = useState<ConfigIA>(() =>
    typeof window === "undefined"
      ? { proveedor: "gemini", apiKey: "", modelo: MODELO_POR_DEFECTO.gemini }
      : cargarConfigIA(),
  );
  // Con sesión, la config de IA sincroniza a `sync/<uid>/config.json`.
  const subirConfigIA = useCallback(() => {
    const uid = usuario?.id;
    if (uid) void subirConfigNube(uid, exportarConfigNube());
  }, [usuario]);
  // Guarda la key/modelo del proveedor activo.
  const guardarKeyIA = useCallback(
    (c: ConfigIA) => {
      setConfigIA(c);
      guardarConfigIA(c);
      subirConfigIA();
    },
    [subirConfigIA],
  );
  // Cambia el proveedor activo y trae su key guardada (si tiene).
  const cambiarProveedorIA = useCallback(
    (p: Proveedor) => {
      setConfigIA(cambiarProveedorActivo(p));
      subirConfigIA();
    },
    [subirConfigIA],
  );
  // Borra solo la key del proveedor activo.
  const borrarKeyIA = useCallback(() => {
    setConfigIA((cur) => borrarKeyProveedor(cur.proveedor));
    subirConfigIA();
  }, [subirConfigIA]);

  // Al cambiar de sesión: (1) `scopeConfigIA` — si se loguea OTRA cuenta en este
  // navegador, borra las keys locales (facturación; cada cuenta la suya); la
  // cuenta "sin dueño" (keys sin login) las adopta al primer login; el logout no
  // toca nada. (2) con sesión, bajar la config de la nube y fusionar (unión de
  // keys, gana la nube en conflicto) → las mismas keys en todos los dispositivos.
  useEffect(() => {
    const uid = usuario?.id ?? null;
    setConfigIA(scopeConfigIA(uid));
    if (!uid) return;
    let vivo = true;
    void bajarConfigNube(uid).then((nube) => {
      if (!vivo || !nube) {
        // Nada en la nube todavía → subir lo local como estado inicial.
        if (vivo) void subirConfigNube(uid, exportarConfigNube());
        return;
      }
      setConfigIA(fusionarConfigNube(nube));
      void subirConfigNube(uid, exportarConfigNube());
    });
    return () => {
      vivo = false;
    };
  }, [usuario]);

  // Llamadas a la IA en curso, por id de nodo (para poder cancelarlas).
  const enVueloRef = useRef<Map<string, AbortController>>(new Map());
  // Resúmenes del tramo viejo del contexto, cacheados por los ids del tramo.
  const resumenCacheRef = useRef<Map<string, string>>(new Map());
  // Espejo del árbol / mapa actual para leerlos dentro de callbacks async.
  const arbolRef = useRef(arbol);
  const mapaIdRef = useRef(mapaId);
  useEffect(() => {
    arbolRef.current = arbol;
    mapaIdRef.current = mapaId;
  }, [arbol, mapaId]);

  // Persistir el árbol del mapa activo en cada cambio (recién después de cargar
  // lo guardado). En modo compartido no se toca localStorage — el árbol es de otro.
  useEffect(() => {
    if (listo && !readOnly) guardarArbol(arbol, mapaId);
  }, [arbol, listo, readOnly, mapaId]);

  // Reconstruir la vista (nodos/edges) cuando cambia el contenido o la
  // estructura del árbol — NO en cada movimiento: `x`/`y` quedan fuera de la
  // firma, así arrastrar un globo no dispara un rebuild.
  const firma = useMemo(
    () =>
      JSON.stringify(
        arbol.intercambios.map((i) => [
          i.id,
          i.padreId,
          i.rama,
          i.proveedor,
          i.fecha,
          i.pregunta,
          i.respuesta,
          i.pending,
          i.error,
          i.ancho,
          i.alto,
          i.color,
        ]),
      ),
    [arbol],
  );
  useEffect(() => {
    // Hasta cargar lo guardado, `nodes`/`edges` ya salen de la semilla
    // (`vistaIni`). Evita consumir `seleccionarLuegoRef` en el montaje.
    if (!listo) return;
    const vista = arbolAVista(arbol);
    const forzar = seleccionarLuegoRef.current;
    seleccionarLuegoRef.current = null;

    // Reconciliar preservando identidad: los nodos que no cambiaron mantienen
    // su objeto (y su posición viva), así React Flow no los vuelve a medir
    // (evita el parpadeo / visibility:hidden en cada alta/baja).
    setNodes((prev) => {
      const previos = new Map(prev.map((n) => [n.id, n]));
      let cambio = prev.length !== vista.nodes.length;
      const next = vista.nodes.map((fresco) => {
        const antes = previos.get(fresco.id);
        const selected =
          forzar !== null ? fresco.id === forzar : antes?.selected ?? false;
        if (!antes) {
          cambio = true;
          return { ...fresco, selected };
        }
        if (selected === antes.selected && datosIguales(antes.data, fresco.data)) {
          return antes;
        }
        cambio = true;
        return { ...antes, data: fresco.data, selected };
      });
      return cambio ? next : prev;
    });

    setEdges((prev) => {
      const previos = new Map(prev.map((e) => [e.id, e]));
      let cambio = prev.length !== vista.edges.length;
      const next = vista.edges.map((fresco) => {
        const antes = previos.get(fresco.id);
        if (
          antes &&
          antes.source === fresco.source &&
          antes.target === fresco.target &&
          antes.sourceHandle === fresco.sourceHandle &&
          antes.targetHandle === fresco.targetHandle
        ) {
          return antes;
        }
        cambio = true;
        return fresco;
      });
      return cambio ? next : prev;
    });
    // `firma` resume el árbol sin x/y; setNodes/setEdges son estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, listo]);

  const activeNode = buscar(arbol, activeNodeId ?? "");
  const activeNodeLabel = activeNode ? activeNode.pregunta : null;

  // Conectar handles a mano = reparentar el target (con guarda anti-ciclo).
  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target) return;
    const rama = (c.sourceHandle as Rama | null) ?? "main";
    setArbol((a) =>
      reparentar(a, c.target as string, c.source as string, rama),
    );
  }, []);

  const onSelectionChange = useCallback(
    ({ nodes: sel }: OnSelectionChangeParams) => {
      setActiveNodeId(sel[0]?.id ?? null);
    },
    [],
  );

  // Empuja hacia abajo SOLO los globos que quedaron pisando a otro (respuesta más
  // alta que el estimado, o posiciones traídas de otra pantalla). Debounce 500ms
  // para no thrashear si llegan varias respuestas juntas. Ver layout.ts.
  const solapesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolverSolapes = useCallback(() => {
    if (solapesTimer.current) clearTimeout(solapesTimer.current);
    solapesTimer.current = setTimeout(() => {
      const pos = resolverSuperposiciones(arbolRef.current, (id) => {
        const n = getNode(id);
        return { w: n?.measured?.width ?? 260, h: n?.measured?.height ?? 150 };
      });
      if (!pos) return;
      setNodes((nds) =>
        nds.map((n) => {
          const p = pos.get(n.id);
          return p ? { ...n, position: { x: p.x, y: p.y } } : n;
        }),
      );
      setArbol((a) => ({
        intercambios: a.intercambios.map((i) => {
          const p = pos.get(i.id);
          return p && (p.x !== i.x || p.y !== i.y) ? { ...i, x: p.x, y: p.y } : i;
        }),
      }));
    }, 500);
  }, [getNode, setNodes]);

  // Pide la respuesta a la IA para `nodeId` y la va escribiendo en el árbol
  // (streaming). `arbolBase` tiene que contener ya el nodo con su pregunta.
  const responder = useCallback(
    async (nodeId: string, arbolBase: Arbol) => {
      // Cancelar cualquier llamada previa para este mismo nodo.
      enVueloRef.current.get(nodeId)?.abort();

      if (!configIA.apiKey.trim()) {
        setArbol((a) =>
          conError(a, nodeId, "Cargá tu API key en ⚙️ para que la IA responda."),
        );
        return;
      }

      const ctrl = new AbortController();
      enVueloRef.current.set(nodeId, ctrl);
      setArbol((a) =>
        conRespuesta(conError(a, nodeId, null), nodeId, {
          respuesta: null,
          pending: true,
          // Un reintento arranca sin el conteo de tokens de la respuesta vieja.
          tokensEntrada: null,
          tokensSalida: null,
        }),
      );

      // Watchdog. Corta si la llamada se queda "estática" — si no, el globo queda
      // `pending` para siempre. Por FASES (antes un solo INACTIVIDAD_MS que se
      // comía el tiempo de `resumir()` y mataba la respuesta antes de arrancar,
      // sobre todo con 2 ramificaciones a la vez → el proveedor free se satura):
      //   - resumir/armado: solo el tope duro TOTAL_MS.
      //   - respuesta esperando el 1er token: gracia larga PRIMER_BYTE_MS (un
      //     free tier saturado tarda en empezar).
      //   - respuesta ya en curso: INACTIVIDAD_MS entre chunks.
      const INACTIVIDAD_MS = 45_000;
      const PRIMER_BYTE_MS = 90_000;
      const TOTAL_MS = 240_000;
      const inicio = Date.now();
      let ultimaActividad = Date.now();
      let esperandoRespuesta = false; // ya se llamó a `llamarIA`
      let recibioAlgo = false; // llegó ≥1 chunk
      let cortadoPorTimeout = false;
      // Lo último que llegó, sin throttle — para conservarlo si el usuario corta.
      let ultimoAcumulado = "";
      const watchdog = window.setInterval(() => {
        const ahora = Date.now();
        if (ahora - inicio > TOTAL_MS) {
          cortadoPorTimeout = true;
          ctrl.abort();
          return;
        }
        if (esperandoRespuesta) {
          const limite = recibioAlgo ? INACTIVIDAD_MS : PRIMER_BYTE_MS;
          if (ahora - ultimaActividad > limite) {
            cortadoPorTimeout = true;
            ctrl.abort();
          }
        }
      }, 3_000);

      try {
        const ventana = settings.ventanaContexto;
        // El contexto se arma tratando a `nodeId` como pendiente: si es un
        // reintento, se descarta la respuesta parcial que hubiera quedado.
        const base = conRespuesta(arbolBase, nodeId, {
          respuesta: null,
          pending: true,
        });

        // Resumen del tramo viejo (spec §5). Si falla, se manda completo.
        const viejos = tramoAResumir(base, nodeId, { ventana });
        let resumen: string | null = null;
        let resumenUso: { entrada: number; salida: number } | null = null;
        let resumenDesdeCache = true;
        let resumenNuevos = 0; // cuántos intercambios entraron a esta llamada (B2)
        if (viejos.length > 0) {
          const idsViejos = viejos.map((i) => i.id);
          const clave = idsViejos.join("|");
          resumen = resumenCacheRef.current.get(clave) ?? null;
          if (!resumen) {
            resumenDesdeCache = false;
            // Resumen INCREMENTAL (B2): buscar el prefijo cacheado más largo del
            // tramo viejo (la ventana se corre de a 1, así que el set viejo
            // crece agregando al final). Si hay, resumir solo la cola nueva
            // sobre ese resumen → la entrada de esta llamada oculta no crece
            // sin tope en una rama larga.
            let resumenPrevio: string | undefined;
            let desde = 0;
            for (let k = idsViejos.length - 1; k >= 1; k--) {
              const c = resumenCacheRef.current.get(
                idsViejos.slice(0, k).join("|"),
              );
              if (c) {
                resumenPrevio = c;
                desde = k;
                break;
              }
            }
            const aResumir = viejos.slice(desde);
            resumenNuevos = aResumir.length;
            // Tope propio para la llamada oculta: si tarda demasiado (proveedor
            // saturado), se sigue SIN resumen (el tramo viejo va completo) en
            // vez de hacer esperar al usuario. `ctrl.signal` la cancela igual
            // ante STOP / TOTAL_MS.
            const RESUMEN_MS = 50_000;
            try {
              const rs = await resumir(configIA, aResumir, {
                usarProxy: settings.usarProxyIA,
                resumenPrevio,
                signal: AbortSignal.any([
                  ctrl.signal,
                  AbortSignal.timeout(RESUMEN_MS),
                ]),
              });
              resumen = rs.texto;
              resumenUso = rs.uso;
              resumenCacheRef.current.set(clave, resumen);
            } catch {
              resumen = null; // sin resumen: `armarContexto` manda el tramo entero
            }
          }
          ultimaActividad = Date.now(); // el resumen pudo tardar
        }

        // Rescate por palabras clave (fase 2.5 liviana): si el tramo viejo se
        // resumió, traer textuales los que más comparten vocabulario con la
        // pregunta actual, para que un dato puntual no se pierda en el resumen.
        const preguntaActual = buscar(base, nodeId)?.pregunta ?? "";
        const relevantes = resumen
          ? intercambiosRelevantes(viejos, preguntaActual)
          : [];

        const mensajes = armarContexto(
          base,
          nodeId,
          { ventana },
          resumen,
          relevantes,
        );

        let ultimoRender = 0;
        const sistema = settings.systemPrompt.trim() || undefined;
        // Recién ahora arranca el watchdog de inactividad de la respuesta.
        esperandoRespuesta = true;
        ultimaActividad = Date.now();
        const { texto, uso, truncada } = await llamarIA(configIA, mensajes, {
          signal: ctrl.signal,
          sistema,
          usarProxy: settings.usarProxyIA,
          onTexto: (_delta, acumulado) => {
            const ahora = Date.now();
            recibioAlgo = true;
            ultimaActividad = ahora;
            ultimoAcumulado = acumulado;
            if (ahora - ultimoRender < 80) return;
            ultimoRender = ahora;
            setArbol((a) =>
              conRespuesta(a, nodeId, { respuesta: acumulado, pending: true }),
            );
          },
        });

        setArbol((a) => {
          let next = conRespuesta(a, nodeId, {
            respuesta: texto,
            pending: false,
            proveedor: configIA.proveedor,
            tokensEntrada: uso?.entrada ?? null,
            tokensSalida: uso?.salida ?? null,
          });
          // El proveedor cortó por el límite de tokens de salida: el texto queda
          // (útil) pero se marca como incompleto — si no, 3maps la trata como
          // respuesta terminada y el usuario no se entera.
          if (truncada) {
            next = conError(
              next,
              nodeId,
              "La respuesta llegó al límite de tokens del modelo y quedó incompleta. Volvé a preguntar pidiendo que continúe, o ↻ Rehacer.",
            );
          }
          return next;
        });

        // ── Instrumentación B2 (temporal): cuánto cuesta la llamada OCULTA de
        // `resumir()` vs la respuesta que el usuario sí ve. Se guarda el últimos
        // ~60 en `localStorage["3maps:debug:b2"]` + `console.info`. Sacar cuando
        // haya datos y esté decidida la política de ventana adaptativa.
        if (!resumenDesdeCache && viejos.length > 0) {
          // Estimado de la entrada REAL de la llamada oculta: solo la cola nueva
          // (incremental) + el resumen previo, no el tramo viejo entero.
          const nuevos = viejos.slice(viejos.length - resumenNuevos);
          const charsResumen = nuevos.reduce(
            (s, i) => s + i.pregunta.length + (i.respuesta?.length ?? 0),
            0,
          );
          const rec = {
            at: new Date().toISOString().slice(0, 19),
            prov: configIA.proveedor,
            modelo: configIA.modelo,
            ventana,
            nViejos: viejos.length,
            resumen: {
              incremental: resumenNuevos < viejos.length,
              nNuevos: resumenNuevos,
              estIn: Math.round(charsResumen / 4),
              tokIn: resumenUso?.entrada ?? null,
              tokOut: resumenUso?.salida ?? null,
            },
            respuesta: {
              estIn: estimarTokens(mensajes),
              tokIn: uso?.entrada ?? null,
              tokOut: uso?.salida ?? null,
            },
          };
          console.info("[b2]", rec);
          try {
            const prev = JSON.parse(
              localStorage.getItem("3maps:debug:b2") ?? "[]",
            ) as unknown[];
            prev.push(rec);
            localStorage.setItem(
              "3maps:debug:b2",
              JSON.stringify(prev.slice(-60)),
            );
          } catch {
            /* ignorar */
          }
        }
        // La respuesta final puede ser más alta que el estimado → si el globo
        // quedó pisando a otro, empujarlo (solo el solapado, ver layout.ts).
        resolverSolapes();
      } catch (e) {
        // El usuario apretó STOP → lo que llegó queda como respuesta final.
        // `abort("usuario")` hace que `fetch` rechace con el string "usuario"
        // (no un DOMException), así que se chequea el signal, no `e`.
        if (ctrl.signal.aborted && ctrl.signal.reason === "usuario") {
          setArbol((a) =>
            conRespuesta(a, nodeId, {
              respuesta: ultimoAcumulado || null,
              pending: false,
              proveedor: configIA.proveedor,
            }),
          );
          resolverSolapes();
          return;
        }
        if (e instanceof Error && e.name === "AbortError") {
          // Timeout del watchdog → error reintentable (deja la respuesta parcial
          // a la vista). Abort "normal" (el usuario re-disparó / borró) → nada.
          if (cortadoPorTimeout) {
            const msg = recibioAlgo
              ? "La respuesta se cortó a la mitad (el proveedor dejó de enviar). Reintentá — se retoma desde cero."
              : "El proveedor no respondió a tiempo (suele pasar en el tier gratuito cuando está saturado, o con varias ramas a la vez). Reintentá en un momento, o probá otro proveedor en ⚙️.";
            setArbol((a) => conError(a, nodeId, msg));
          }
          return;
        }
        setArbol((a) =>
          conError(a, nodeId, e instanceof Error ? e.message : String(e)),
        );
      } finally {
        window.clearInterval(watchdog);
        if (enVueloRef.current.get(nodeId) === ctrl) {
          enVueloRef.current.delete(nodeId);
        }
      }
    },
    [
      configIA,
      settings.ventanaContexto,
      settings.systemPrompt,
      settings.usarProxyIA,
      resolverSolapes,
    ],
  );

  // Crea UN globo (intercambio) colgando del nodo activo (o de `parentId`, para
  // el composer del panel lateral — fase 3.9) y le pide la respuesta a la IA.
  // "main" cuelga hacia abajo (sigue el hilo); "branch" nace por la derecha
  // (después se puede arrastrar a la izquierda). Devuelve el id del globo nuevo.
  const handleSubmit = useCallback(
    (
      text: string,
      kind: BranchKind,
      parentId?: string,
      adjuntos?: Adjunto[],
    ): string | null => {
      if (readOnly) return null;

      // Árbol vacío: el primer globo es la raíz.
      if (arbol.intercambios.length === 0) {
        const id = nuevoId();
        const nuevo = crearIntercambio({
          id,
          padreId: null,
          rama: "main",
          pregunta: text,
          x: 250,
          y: 0,
          pending: true,
          adjuntos,
        });
        const arbolNuevo: Arbol = { intercambios: [nuevo] };
        seleccionarLuegoRef.current = id;
        setArbol(arbolNuevo);
        setActiveNodeId(id);
        centrarEnGlobo(250, 0);
        void responder(id, arbolNuevo);
        return id;
      }

      const parent = buscar(arbol, parentId ?? activeNodeId ?? "");
      if (!parent) return null;
      const id = nuevoId();

      // F5: "continuar hilo" (`main`) NO crea un globo — se suma al TRAMO del
      // padre, siempre por la PUNTA (Enter solo continúa desde la punta). Solo
      // "ramificar" crea un tramo nuevo.
      if (kind === "main") {
        const cab = cabezaDeTramo(arbol, parent.id);
        const tramo = tramoDesde(arbol, cab);
        const punta = tramo[tramo.length - 1] ?? parent;
        const nuevo = crearIntercambio({
          id,
          padreId: punta.id,
          rama: "main",
          pregunta: text,
          x: punta.x, // `arbolAVista` solo usa la x/y de la cabeza
          y: punta.y,
          pending: true,
          adjuntos,
        });
        const arbolNuevo = agregar(arbol, nuevo);
        seleccionarLuegoRef.current = cab;
        setArbol(arbolNuevo);
        setActiveNodeId(cab);
        void responder(id, arbolNuevo);
        return id;
      }

      // Buscar un lugar libre cerca del padre (no pisa a ningún otro globo) y
      // el lado de la rama (alterna izq/der para un árbol parejo). Ver layout.ts.
      const medir = (nid: string) => {
        const n = getNode(nid);
        return {
          w: n?.measured?.width ?? 260,
          h: n?.measured?.height ?? 160,
        };
      };
      const { x, y, rama } = ubicarNuevoGlobo(arbol, parent.id, "branch", medir);
      const nuevo = crearIntercambio({
        id,
        padreId: parent.id,
        rama,
        pregunta: text,
        x,
        y,
        pending: true,
        adjuntos,
      });
      const arbolNuevo = agregar(arbol, nuevo);

      seleccionarLuegoRef.current = id;
      setArbol(arbolNuevo);
      setActiveNodeId(id);
      centrarEnGlobo(x, y);
      // Si `ubicarNuevoGlobo` no encontró hueco cerca del padre y lo dejó
      // pegado a él, bajarlo por su columna ya (sin esperar a la respuesta).
      resolverSolapes();
      void responder(id, arbolNuevo);
      return id;
    },
    [
      arbol,
      activeNodeId,
      responder,
      readOnly,
      getNode,
      centrarEnGlobo,
      resolverSolapes,
    ],
  );

  const retryNode = useCallback(
    (id: string) => {
      if (readOnly) return;
      void responder(id, arbolRef.current);
    },
    [responder, readOnly],
  );

  // El usuario cortó la respuesta de un globo mientras streameaba. `responder`
  // lee `signal.reason` en el catch y conserva lo que llegó (ver ahí).
  const stopNode = useCallback((id: string) => {
    enVueloRef.current.get(id)?.abort("usuario");
  }, []);

  // Al soltar / frenar el envión: escribir la posición final de cada globo al
  // árbol y, si es una rama, fijar el lado (izq/der) según dónde quedó respecto
  // del padre. Batch: una selección entera se asienta en un solo `setArbol`
  // (un globo suelto es una lista de uno).
  const asentarVarios = useCallback(
    (items: { id: string; pos: { x: number; y: number } }[]) => {
      if (items.length === 0) return;
      setArbol((a) => {
        let next = a;
        for (const { id, pos } of items) {
          const ic = buscar(next, id);
          if (!ic) continue;
          next = conPosicion(next, id, pos.x, pos.y);
          if (ic.padreId === null || ic.rama === "main") continue;
          const padre = buscar(next, ic.padreId);
          const lado: Rama =
            padre && pos.x < padre.x ? "branch-left" : "branch-right";
          next = conRama(next, id, lado);
        }
        return next;
      });
    },
    [],
  );

  // Envión / inercia al soltar, tipo Obsidian Canvas.
  const {
    onNodeDragStart: nodeInertiaDragStart,
    onNodeDrag: nodeInertiaDrag,
    onNodeDragStop: nodeInertiaDragStop,
    cancelInertia,
  } = useNodeInertia(setNodes, asentarVarios, settings.inertia);

  // Al soltar, glidear TODA la selección (no solo el globo agarrado). React Flow
  // no es confiable para esto: según agarres un globo o el recuadro, y por
  // `selectNodesOnDrag`, el 3er arg puede traer uno solo. Leemos la selección de
  // NUESTRO estado. Si el globo soltado no está en la selección (o hay uno
  // solo), es un drag individual (B3, decisiones B3).
  const onNodeDragStop = useCallback(
    (evt: unknown, node: Node) => {
      const sel = getNodes().filter((n) => n.selected);
      const enGrupo = sel.length > 1 && sel.some((n) => n.id === node.id);
      nodeInertiaDragStop(evt, node, enGrupo ? sel : [node]);
      // La selección se MANTIENE tras mover el grupo (pedido de Alan) — se limpia
      // sola al clickear el fondo del canvas (`onPaneClick`).
    },
    [getNodes, nodeInertiaDragStop],
  );

  // Mientras se arrastra una rama: mover el handle de su flecha al lado
  // (izq/der) donde va quedando, en vivo — sin esperar al `asentar` del drop
  // (fase 3.3). Solo toca el estado `edges`; la `rama` del árbol se fija al
  // soltar. Durante el envión, el ajuste final lo hace `asentar`.
  const onNodeDrag = useCallback(
    (evt: unknown, node: Node) => {
      nodeInertiaDrag(evt, node);
      const ic = buscar(arbolRef.current, node.id);
      if (!ic || ic.padreId === null || ic.rama === "main") return;
      const padre = getNode(ic.padreId);
      if (!padre) return;
      const lado: Rama =
        node.position.x < padre.position.x ? "branch-left" : "branch-right";
      // La rama entra al hijo por el costado opuesto (mismo criterio que
      // `arbolAVista`).
      const tgt = lado === "branch-right" ? "t-left" : "t-right";
      const edgeId = `e-${ic.padreId}-${node.id}`;
      setEdges((eds) => {
        const i = eds.findIndex((e) => e.id === edgeId);
        if (
          i === -1 ||
          (eds[i].sourceHandle === lado && eds[i].targetHandle === tgt)
        ) {
          return eds;
        }
        const next = eds.slice();
        next[i] = { ...next[i], sourceHandle: lado, targetHandle: tgt };
        return next;
      });
    },
    [nodeInertiaDrag, getNode, setEdges],
  );

  // Envión también al mover el plano del fondo con la manito.
  const { onMoveStart, onMove, onMoveEnd, cancelPanInertia } = usePanInertia(
    setViewport,
    getViewport,
    settings.inertia,
  );

  const onNodeDragStart = useCallback(() => {
    cancelPanInertia();
    nodeInertiaDragStart();
  }, [cancelPanInertia, nodeInertiaDragStart]);

  // "Ordenar" (fase 3.4): reacomoda todos los globos a la forma canónica
  // (tronco vertical + ramas al costado con su propio tronco). Escribe las
  // posiciones nuevas al árbol Y a los nodos (la firma de la vista no incluye
  // x/y, así que setArbol solo no movería nada), y después fitea la cámara.
  const ordenar = useCallback(() => {
    cancelInertia();
    cancelPanInertia();
    const pos = calcularLayout(
      arbolRef.current,
      (id) => getNode(id)?.measured?.height,
    );
    if (pos.size === 0) return;
    setNodes((nds) =>
      nds.map((n) => {
        const p = pos.get(n.id);
        return p ? { ...n, position: { x: p.x, y: p.y } } : n;
      }),
    );
    setArbol((a) => ({
      intercambios: a.intercambios.map((i) => {
        const p = pos.get(i.id);
        return p && (p.x !== i.x || p.y !== i.y) ? { ...i, x: p.x, y: p.y } : i;
      }),
    }));
    window.setTimeout(() => void fitView({ ...fitOpts, duration: 400 }), 50);
  }, [cancelInertia, cancelPanInertia, getNode, setNodes, fitView, fitOpts]);

  // Modo de interacción:
  //   - por defecto: manito → arrastrar el fondo hace pan (con envión).
  //   - con la barra espaciadora apretada: puntero → arrastrar el fondo hace un
  //     recuadro de selección (varios globos).
  //   - en ambos modos, arrastrar un globo lo mueve.
  const [spaceHeld, setSpaceHeld] = useState(false);
  useEffect(() => {
    const isEditable = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !isEditable(e.target)) {
        e.preventDefault(); // que no scrollee la página
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    const onBlur = () => setSpaceHeld(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Elimina un nodo y todos sus descendientes. Deja como activo al padre.
  const deleteNode = useCallback(
    (id: string) => {
      if (readOnly) return;
      cancelInertia();
      cancelPanInertia();
      const desc = descendientes(arbol, id);
      if (
        desc.length > 0 &&
        !window.confirm(
          `Se van a eliminar ${desc.length + 1} intercambios: este tramo y todo lo que cuelga de él. ¿Seguir?`,
        )
      ) {
        return;
      }
      // Borrar la raíz (ya sin hijos) deja el mapa vacío — confirmar (fase 3.6).
      if (
        desc.length === 0 &&
        buscar(arbol, id)?.padreId === null &&
        !window.confirm("Vas a borrar el último globo. El mapa queda vacío. ¿Seguir?")
      ) {
        return;
      }
      // Cortar cualquier llamada a la IA en curso de lo que se borra.
      for (const q of [id, ...desc.map((d) => d.id)]) {
        enVueloRef.current.get(q)?.abort();
        enVueloRef.current.delete(q);
      }
      const padreIc = buscar(arbol, id)?.padreId ?? null;
      const padreCabeza = padreIc ? cabezaDeTramo(arbol, padreIc) : null;
      seleccionarLuegoRef.current = padreCabeza;
      setArbol((a) => quitarSubarbol(a, id));
      setActiveNodeId(padreCabeza);
    },
    [arbol, cancelInertia, cancelPanInertia, readOnly],
  );

  // Selección múltiple (B3): ids de los globos seleccionados, estable mientras
  // no cambie la selección (no re-deriva en cada frame de drag). Alimenta la
  // toolbar compartida `ToolbarGrupo`.
  const selKey = nodes
    .filter((n) => n.selected)
    .map((n) => n.id)
    .sort()
    .join(",");
  const idsSeleccionados = useMemo(
    () => (selKey ? selKey.split(",") : []),
    [selKey],
  );

  // Eliminar varios globos de una (toolbar compartida). Un solo `window.confirm`.
  // Si un seleccionado cuelga de otro seleccionado, se borra con él (no se
  // cuenta dos veces).
  const deleteMuchos = useCallback(
    (ids: string[]) => {
      if (readOnly || ids.length < 2) return;
      cancelInertia();
      cancelPanInertia();
      const a = arbolRef.current;
      const sel = new Set(ids);
      const raices = ids.filter((id) => {
        let p = buscar(a, id)?.padreId ?? null;
        while (p) {
          if (sel.has(cabezaDeTramo(a, p))) return false;
          p = buscar(a, p)?.padreId ?? null;
        }
        return true;
      });
      const afectados = new Set<string>();
      for (const id of raices) {
        afectados.add(id);
        for (const d of descendientes(a, id)) afectados.add(d.id);
      }
      if (
        !window.confirm(
          `Se van a eliminar ${afectados.size} intercambios (${raices.length} globos y todo lo que cuelga). ¿Seguir?`,
        )
      ) {
        return;
      }
      for (const q of afectados) {
        enVueloRef.current.get(q)?.abort();
        enVueloRef.current.delete(q);
      }
      setArbol((prev) => raices.reduce((acc, id) => quitarSubarbol(acc, id), prev));
      setActiveNodeId(null);
    },
    [readOnly, cancelInertia, cancelPanInertia],
  );

  // Pintar varios globos de una (toolbar compartida).
  const colorMuchos = useCallback((ids: string[], color: ColorGlobo | null) => {
    setArbol((a) => ids.reduce((acc, id) => conColor(acc, id, color), a));
  }, []);

  // Panel de transcripción de la rama (doble-click en un globo o botón ⤢).
  const [transcriptNodeId, setTranscriptNodeId] = useState<string | null>(null);

  // Abrir el panel en un globo Y dejarlo seleccionado en el canvas (borde azul).
  // `id` puede ser cualquier intercambio (una cabeza de tramo desde el canvas /
  // `nav`, o el intercambio recién creado desde el mini-composer). Se resuelve al
  // tramo: el panel apunta a su PUNTA (`transcriptNodeId`, así `caminoRaizA` da
  // raíz→acá completo) y se selecciona el nodo cabeza.
  const verGloboEnPanel = useCallback(
    (id: string) => {
      const a = arbolRef.current;
      const cabeza = buscar(a, id) ? cabezaDeTramo(a, id) : id;
      const tramo = tramoDesde(a, cabeza);
      const punta = tramo.length ? tramo[tramo.length - 1].id : id;
      setTranscriptNodeId(punta);
      setActiveNodeId(cabeza);
      setNodes((nds) =>
        nds.map((n) =>
          n.selected === (n.id === cabeza)
            ? n
            : { ...n, selected: n.id === cabeza },
        ),
      );
    },
    [setNodes],
  );
  const openNode = verGloboEnPanel;

  // Tamaño manual del globo → al árbol (`.md` → sincroniza). null = automático.
  const resizeNode = useCallback(
    (id: string, ancho: number | null, alto: number | null) => {
      setArbol((a) => conTamano(a, id, ancho, alto));
    },
    [],
  );

  const colorNode = useCallback((id: string, color: ColorGlobo | null) => {
    // `id` es la cabeza del tramo (= id del nodo). El color vive ahí.
    setArbol((a) => conColor(a, id, color));
  }, []);
  const transcripcion = useMemo(
    () => (transcriptNodeId ? caminoRaizA(arbol, transcriptNodeId) : null),
    [arbol, transcriptNodeId],
  );

  // Estimación (≈ chars/4) de los tokens de contexto que mandaría una pregunta
  // desde el globo abierto en el panel (T10). Usa el resumen del tramo viejo si
  // ya está cacheado (de una llamada previa de esa rama); si no, cuenta el tramo
  // viejo completo. NUNCA dispara el resumen — es solo lectura del árbol.
  const contextoTokens = useMemo(() => {
    if (!transcriptNodeId || !buscar(arbol, transcriptNodeId)) return null;
    const ventana = settings.ventanaContexto;
    const viejos = tramoAResumir(arbol, transcriptNodeId, { ventana });
    const resumen =
      viejos.length > 0
        ? resumenCacheRef.current.get(viejos.map((i) => i.id).join("|")) ?? null
        : null;
    const relevantes = resumen
      ? intercambiosRelevantes(
          viejos,
          buscar(arbol, transcriptNodeId)?.pregunta ?? "",
        )
      : [];
    return estimarTokens(
      armarContexto(arbol, transcriptNodeId, { ventana }, resumen, relevantes),
    );
  }, [arbol, transcriptNodeId, settings.ventanaContexto]);

  // Navegación del panel (`‹` `›`): saltar SOLO a los globos unidos al globo
  // abierto por una línea de COSTADO — sus ramas hijas, más el padre si el
  // globo abierto es una rama (ahí la línea al padre también sale de costado).
  // Los hijos `main` (línea por abajo) y los hermanos no entran: a esos se
  // llega por scroll o click.
  // Cada lado devuelve una LISTA ordenada por `y` (borde superior del globo,
  // no el centro → no depende del alto): una flechita por destino, apiladas en
  // ese orden. Si un globo se mueve, `nav` recalcula y las flechas se reordenan.
  const nav = useMemo(() => {
    if (!transcriptNodeId) return null;
    const cabezaId = cabezaDeTramo(arbol, transcriptNodeId);
    const cabeza = buscar(arbol, cabezaId);
    if (!cabeza) return null;
    const tramo = tramoDesde(arbol, cabezaId);

    const izq: Intercambio[] = [];
    const der: Intercambio[] = [];

    // El padre, solo si la CABEZA del tramo abierto es una rama: branch-left → el
    // padre queda a la DERECHA (la línea entra por el costado derecho).
    if (cabeza.rama === "branch-left" || cabeza.rama === "branch-right") {
      const p = cabeza.padreId
        ? buscar(arbol, cabezaDeTramo(arbol, cabeza.padreId))
        : null;
      if (p) (cabeza.rama === "branch-left" ? der : izq).push(p);
    }
    // Ramas hijas que salen de CUALQUIER intercambio del tramo (cada una es
    // cabeza de su propio tramo).
    for (const ic of tramo) {
      for (const h of hijos(arbol, ic.id)) {
        if (h.rama === "branch-left") izq.push(h);
        else if (h.rama === "branch-right") der.push(h);
      }
    }
    const rotular = (n: Intercambio) => ({
      id: n.id,
      label: n.pregunta.trim().slice(0, 48) || "(sin título)",
    });
    izq.sort((a, b) => a.y - b.y);
    der.sort((a, b) => a.y - b.y);
    return { left: izq.map(rotular), right: der.map(rotular) };
  }, [arbol, transcriptNodeId]);

  // Composer del panel lateral (fase 3.9): crea un hijo del globo abierto y mueve
  // el panel a ese hijo, así se ve su respuesta sin cerrar el panel. Enter =
  // continúa el hilo ("main"), Ctrl/Cmd+Enter o botón = ramifica (fase 3.12).
  const responderDesdePanel = useCallback(
    (text: string, kind: BranchKind, adjuntos: Adjunto[], desdeId?: string) => {
      if (!transcriptNodeId) return;
      // "main" continúa desde la punta; "branch" desde `desdeId` (un intercambio
      // del medio, F5-3) o desde la punta si no se eligió.
      const padre =
        kind === "branch" ? (desdeId ?? transcriptNodeId) : transcriptNodeId;
      const id = handleSubmit(text, kind, padre, adjuntos);
      if (id) verGloboEnPanel(id);
    },
    [handleSubmit, transcriptNodeId, verGloboEnPanel],
  );

  const crecimientoPx = Math.max(
    0,
    Math.min(24, settings.crecimientoPxPorMensaje ?? 9),
  );
  const crecimientoTope = Math.max(0, settings.crecimientoTope ?? 320);
  const nodeActions = useMemo(
    () => ({
      deleteNode,
      retryNode,
      stopNode,
      openNode,
      resizeNode,
      colorNode,
      readOnly,
      crecimientoPx,
      crecimientoTope,
    }),
    [
      deleteNode,
      retryNode,
      stopNode,
      openNode,
      resizeNode,
      colorNode,
      readOnly,
      crecimientoPx,
      crecimientoTope,
    ],
  );

  // Ancho del panel lateral (fase 3.11): bucket por ancho de viewport. En móvil
  // (< 768) el panel va a pantalla completa y no se redimensiona.
  const panelBucket: "mobile" | "desktop" = esMobile ? "mobile" : "desktop";
  const panelResizable = panelBucket === "desktop";
  const panelAncho = panelResizable
    ? Math.min(
        Math.round(anchoVentana * ANCHO_PANEL_MAX_FRAC),
        Math.max(
          ANCHO_PANEL_MIN,
          settings.transcriptWidth?.[panelBucket] ?? ANCHO_PANEL_DEFECTO,
        ),
      )
    : undefined;
  const guardarAnchoPanel = useCallback(
    (px: number) => {
      updateSettings({
        transcriptWidth: {
          ...(settings.transcriptWidth ?? DEFAULT_SETTINGS.transcriptWidth),
          [panelBucket]: px,
        },
      });
    },
    [updateSettings, settings.transcriptWidth, panelBucket],
  );

  // ── Compartir (fase 2.3) ─────────────────────────────────────────────────
  // "Compartir" sube el árbol actual a Supabase y devuelve el link. Solo si el
  // backend está configurado y no estamos ya viendo un árbol de otro.
  const compartir = useCallback(
    (titulo: string) => compartirArbol(arbolRef.current, titulo),
    [],
  );
  // "Guardar en mi 3maps": el árbol compartido pasa a ser local y editable
  // (queda en el mapa activo).
  const guardarCopiaLocal = useCallback(() => {
    guardarArbol(arbolRef.current, mapaId);
    limpiarSlugDeLaUrl();
    setCompartido(null);
  }, [mapaId]);
  // "Salir": volver al árbol local propio (recarga para re-hidratar limpio).
  const salirDeCompartido = useCallback(() => {
    limpiarSlugDeLaUrl();
    window.location.reload();
  }, []);

  // ── Mapas (fase 3.5): crear / cambiar / borrar / renombrar ────────────────
  const cargarEnMapa = useCallback((id: string, t: Arbol) => {
    const ultimo = cabezaUltimo(t);
    seleccionarLuegoRef.current = ultimo;
    setArbol(t);
    setActiveNodeId(ultimo);
    setTranscriptNodeId(null);
    setMapaActivo(id);
    setMapaId(id);
  }, []);

  const cambiarMapa = useCallback(
    (id: string) => {
      if (id === mapaId) return;
      cancelInertia();
      cancelPanInertia();
      cargarEnMapa(id, cargarArbol(id));
      window.setTimeout(() => void fitView({ ...fitOpts, duration: 300 }), 60);
    },
    [mapaId, cancelInertia, cancelPanInertia, cargarEnMapa, fitView, fitOpts],
  );

  const nuevoMapa = useCallback(() => {
    cancelInertia();
    cancelPanInertia();
    const id = crearMapa(nombreMapaLibre());
    const m = leerMapas();
    setMapas(m);
    const vacio: Arbol = { intercambios: [] };
    guardarArbol(vacio, id);
    cargarEnMapa(id, vacio);
    if (usuario) void subirIndiceMapasNube(usuario.id, m);
  }, [cancelInertia, cancelPanInertia, cargarEnMapa, usuario]);

  const borrarMapaActual = useCallback(() => {
    const titulo = mapas[mapaId]?.titulo ?? "este mapa";
    const ultimo = Object.keys(mapas).length <= 1;
    const msg = ultimo
      ? `¿Borrar “${titulo}”? Es tu único mapa — se crea uno nuevo vacío. No se puede deshacer.`
      : `¿Borrar el mapa “${titulo}”? Se pierde su árbol (esto no se puede deshacer).`;
    if (!window.confirm(msg)) return;
    cancelInertia();
    cancelPanInertia();
    const borradoId = mapaId;
    let m = borrarMapa(borradoId);
    let siguiente = Object.keys(m)[0];
    const eraUltimo = !siguiente;
    if (eraUltimo) {
      // Era el último → arrancar uno nuevo vacío. Se escribe el registro a mano
      // (no `crearMapa`, que llamaría a `leerMapas()` sobre un registro vacío y
      // dispararía la migración → recrearía "principal").
      siguiente = nuevoMapaId();
      m = { [siguiente]: { titulo: "Mi mapa", creado: new Date().toISOString() } };
      guardarMapas(m);
      guardarArbol({ intercambios: [] }, siguiente);
    }
    setMapas(m);
    if (usuario) {
      const uid = usuario.id;
      if (eraUltimo) {
        // Borrar el ÚLTIMO mapa == "Empezar de cero": tombstonear todo lo de la
        // nube + epoch nuevo. Si no, un mapa fantasma del otro dispositivo (que
        // esta PC nunca tuvo) sobrevive en el índice y vuelve a sincronizarse.
        const epoch = Date.now();
        marcarEpoch(uid, epoch);
        void empezarDeCeroNube(uid, { id: siguiente, meta: m[siguiente] }, epoch);
      } else {
        // En secuencia: primero borrar el árbol, después el índice con el
        // tombstone (si van en paralelo, el índice puede releerse antes de
        // borrar y re-añadir).
        void (async () => {
          await borrarMapaNube(uid, borradoId);
          await subirIndiceMapasNube(uid, m, { borrar: [borradoId] });
        })();
      }
    }
    cargarEnMapa(siguiente, cargarArbol(siguiente));
    window.setTimeout(() => void fitView({ ...fitOpts, duration: 300 }), 60);
  }, [
    mapas,
    mapaId,
    usuario,
    cancelInertia,
    cancelPanInertia,
    cargarEnMapa,
    fitView,
    fitOpts,
  ]);

  const renombrarMapaActual = useCallback(
    (titulo: string) => {
      const m = renombrarMapa(mapaId, titulo);
      setMapas(m);
      if (usuario) void subirIndiceMapasNube(usuario.id, m);
    },
    [mapaId, usuario],
  );

  const empezarDeCero = useCallback(() => {
    if (
      !window.confirm(
        "Esto borra TODOS tus mapas — en este dispositivo Y en la nube — y arranca " +
          "con uno vacío. Las API keys no se tocan. No se puede deshacer. ¿Seguir?",
      )
    ) {
      return;
    }
    cancelInertia();
    cancelPanInertia();
    try {
      const claves = Object.keys(localStorage).filter((k) =>
        /^3maps:(mapas|mapaActivo|arbol|vista|sync):?/.test(k),
      );
      claves.forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignorar
    }
    const id = nuevoMapaId();
    const meta = { titulo: "Mi mapa", creado: new Date().toISOString() };
    const m: Mapas = { [id]: meta };
    guardarMapas(m);
    guardarArbol({ intercambios: [] }, id);
    setMapas(m);
    cargarEnMapa(id, { intercambios: [] });
    if (usuario) {
      const epoch = Date.now();
      // Marcar local ANTES (el poll no debe auto-resetear este dispositivo) y
      // subir con el mismo epoch.
      marcarEpoch(usuario.id, epoch);
      void empezarDeCeroNube(usuario.id, { id, meta }, epoch);
    }
    window.setTimeout(() => void fitView({ ...fitOpts, duration: 300 }), 60);
  }, [usuario, cancelInertia, cancelPanInertia, cargarEnMapa, fitView, fitOpts]);

  // Sync de la LISTA de mapas entre dispositivos. Fuente única: el índice
  // `_mapas.json` (`{ mapas, borrados }`). Aplica los tombstones (borra local),
  // fusiona los que falten, y re-sube si local tiene algo que el índice no.
  // Corre al loguear y al volver a foco la pestaña.
  const sincronizarListaMapas = useCallback(async () => {
    if (!usuario || readOnly) return;
    const uid = usuario.id;
    const indice = await bajarIndiceMapasNube(uid);
    if (!indice) {
      // Todavía no hay índice en la nube → subir lo local como estado inicial.
      const local = leerMapas();
      if (Object.keys(local).length) void subirIndiceMapasNube(uid, local);
      return;
    }
    // Reset duro coordinado: "Empezar de cero" en otro dispositivo dejó un epoch
    // mayor al que aplicamos → adoptar el índice de la nube TAL CUAL, sin
    // depender de que los tombstones cubran cada mapa local (los que este
    // dispositivo creó y nunca subió no están tombstoneados).
    if (indice.epoch > epochAplicado(uid)) {
      try {
        for (const k of Object.keys(localStorage)) {
          if (/^3maps:(arbol|vista|sync):/.test(k)) localStorage.removeItem(k);
        }
      } catch {
        // ignorar
      }
      guardarMapas(indice.mapas);
      marcarEpoch(uid, indice.epoch); // después del wipe (borra la clave del epoch)
      setMapas(indice.mapas);
      const activo = Object.keys(indice.mapas)[0];
      if (activo) {
        guardarArbol({ intercambios: [] }, activo);
        cargarEnMapa(activo, cargarArbol(activo));
      }
      return;
    }
    const borrados = new Set(indice.borrados);
    const localIds = Object.keys(leerMapas());
    // "Empezar de cero" desde otro dispositivo: si TODOS mis mapas están
    // tombstoneados, limpiar local (árboles/vista) y adoptar el/los de la nube.
    if (localIds.length > 0 && localIds.every((id) => borrados.has(id))) {
      try {
        for (const k of Object.keys(localStorage)) {
          if (/^3maps:(arbol|vista|sync):/.test(k)) localStorage.removeItem(k);
        }
      } catch {
        // ignorar
      }
      guardarMapas({});
    } else {
      // Tombstones normales (no borrar el mapa activo por debajo).
      podarMapasBorrados(indice.borrados, mapaIdRef.current);
    }
    let m = fusionarMapasNube(indice.mapas);
    if (Object.keys(m).length === 0) {
      // Ni local ni nube tienen mapas → crear uno y subirlo.
      const nid = nuevoMapaId();
      m = { [nid]: { titulo: "Mi mapa", creado: new Date().toISOString() } };
      guardarMapas(m);
      guardarArbol({ intercambios: [] }, nid);
      void subirIndiceMapasNube(uid, m);
    }
    setMapas(m);
    // Si el mapa activo ya no existe (lo borró/reseteó otro dispositivo) → pasar
    // a uno válido.
    if (!m[mapaIdRef.current]) {
      const sig = Object.keys(m)[0];
      if (sig) cargarEnMapa(sig, cargarArbol(sig));
    }
    // Sanar el índice si local tiene mapas que la nube no (y no tombstoneados).
    const enIndice = new Set(Object.keys(indice.mapas));
    if (Object.keys(m).some((id) => !enIndice.has(id) && !borrados.has(id))) {
      void subirIndiceMapasNube(uid, m);
    }
  }, [usuario, readOnly, cargarEnMapa]);

  useEffect(() => {
    void sincronizarListaMapas();
    const tick = () => {
      if (document.visibilityState === "visible") void sincronizarListaMapas();
    };
    // Poll (el sync no es push) + al volver a foco.
    const id = window.setInterval(tick, 15_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [sincronizarListaMapas]);

  // ── Sync entre dispositivos (fase 2.4, per-mapa desde 3.5) ────────────────
  // Solo con sesión y fuera del modo compartido. Last-write-wins.
  const aplicarArbolNube = useCallback((a: Arbol) => {
    const ultimo = cabezaUltimo(a);
    seleccionarLuegoRef.current = ultimo;
    setArbol(a);
    setActiveNodeId((cur) =>
      a.intercambios.some((i) => i.id === cur) ? cur : ultimo,
    );
    // No se resuelven solapes acá: reposicionar marcaría el árbol como "con
    // cambios" → lo re-subiría y frenaría el poll de `revisarNube`, con posible
    // ping-pong de posiciones entre dispositivos. Si un árbol traído se pisa en
    // esta pantalla, el usuario tiene "▤ Ordenar".
  }, []);
  const onTituloNube = useCallback(
    (titulo: string) => setMapas(renombrarMapa(mapaId, titulo)),
    [mapaId],
  );
  const estadoSync = useSync({
    arbol,
    setArbol: aplicarArbolNube,
    listo,
    activo: !readOnly,
    mapId: mapaId,
    titulo: mapas[mapaId]?.titulo ?? "",
    onTituloNube,
  });

  return (
    <NodeActionsContext.Provider value={nodeActions}>
      <div
        className="relative h-full w-full"
        data-chat={sVista.composerOculto ? "oculto" : "visible"}
        // Grosor de las flechas conectoras (B4). `.react-flow__edge-path` lee
        // `--xy-edge-stroke-width`; lo heredan desde acá. Cambiar el slider se
        // aplica al toque, sin re-render de la vista. (`sVista`: default hasta
        // montar → sin mismatch de hidratación.)
        style={
          {
            "--xy-edge-stroke-width": Math.min(
              5,
              Math.max(1, sVista.grosorLineas ?? 1.5),
            ),
          } as CSSProperties
        }
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onMoveStart={onMoveStart}
          onMove={onMove}
          onMoveEnd={onMoveEnd}
          onNodeClick={() => cancelInertia()}
          onNodeDoubleClick={(_, node) => verGloboEnPanel(node.id)}
          onSelectionChange={onSelectionChange}
          panOnDrag={!spaceHeld}
          selectionOnDrag={spaceHeld}
          selectionMode={SelectionMode.Partial}
          selectionKeyCode={null}
          panActivationKeyCode={null}
          // Borrar es solo por el botón 🗑 (pasa por `deleteNode`: subárbol +
          // confirmación). El Backspace de React Flow borraría un nodo suelto
          // sin limpiar hijos ni tocar el árbol.
          deleteKeyCode={null}
          nodeDragThreshold={3}
          colorMode="dark"
          minZoom={0.15}
          fitView
          fitViewOptions={fitOpts}
          // El doble-click abre la transcripción de la rama (`onNodeDoubleClick`);
          // si no, React Flow lo usa para hacer zoom.
          zoomOnDoubleClick={false}
        >
          <Background />
          {/* Marca de agua del logo completo (B6): árbol + globos + wordmark
              "3maps", tenue, centrado, fijo (no pan/zoom). Hijo de `<ReactFlow>`
              → sobre el fondo pero debajo del `.react-flow__pane` (z-1) y los
              nodos. `colorMode="dark"` pinta un fondo opaco en `.react-flow`, por
              eso va acá y no en el wrapper. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-center bg-no-repeat opacity-[0.05]"
            style={{
              zIndex: 0,
              backgroundImage: `url(${rutaAsset("logo.png")})`,
              backgroundSize: "min(72vw, 440px) auto",
            }}
          />
          <Controls>
            {!readOnly && (
              <ControlButton
                onClick={ordenar}
                title="Ordenar el árbol"
                aria-label="Ordenar el árbol"
              >
                <span style={{ fontSize: 14, lineHeight: 1 }}>▤</span>
              </ControlButton>
            )}
          </Controls>
          <MiniMap position="top-right" pannable zoomable />
          {!readOnly && (
            <ToolbarGrupo
              ids={idsSeleccionados}
              onEliminar={deleteMuchos}
              onColor={colorMuchos}
            />
          )}
        </ReactFlow>
        {listo && arbol.intercambios.length === 0 && !readOnly && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="max-w-xs text-center text-sm text-white/40">
              El árbol está vacío. Escribí tu primera pregunta abajo para empezar.
            </p>
          </div>
        )}
        {compartido && (
          <SharedBanner
            titulo={compartido.titulo}
            onGuardar={guardarCopiaLocal}
            onSalir={salirDeCompartido}
          />
        )}
        {listo && <LoginNudge readOnly={readOnly} />}
        <SettingsPanel
          settings={settings}
          onChange={updateSettings}
          configIA={configIA}
          onGuardarKeyIA={guardarKeyIA}
          onCambiarProveedorIA={cambiarProveedorIA}
          onBorrarKeyIA={borrarKeyIA}
          onCompartir={haySupabase() && !readOnly ? compartir : undefined}
          estadoSync={estadoSync}
        />
        {listo && !readOnly && Object.keys(mapas).length > 0 && (
          <MapaSwitcher
            mapas={mapas}
            activoId={mapaId}
            onCambiar={cambiarMapa}
            onNuevo={nuevoMapa}
            onBorrar={borrarMapaActual}
            onRenombrar={renombrarMapaActual}
            onEmpezarDeCero={empezarDeCero}
          />
        )}
        {!readOnly && (
          <Composer
            activeNodeLabel={activeNodeLabel}
            arbolVacio={arbol.intercambios.length === 0}
            onSubmit={handleSubmit}
            oculto={sVista.composerOculto}
            onToggleOculto={() =>
              updateSettings({ composerOculto: !settings.composerOculto })
            }
          />
        )}
        {transcripcion && transcripcion.length > 0 && (
          <PanelConversacion
            intercambios={transcripcion}
            side={settings.transcriptSide}
            onFlipSide={() =>
              updateSettings({
                transcriptSide:
                  settings.transcriptSide === "left" ? "right" : "left",
              })
            }
            onClose={() => setTranscriptNodeId(null)}
            onSubmit={readOnly ? undefined : responderDesdePanel}
            onStop={
              readOnly || !transcriptNodeId
                ? undefined
                : () => stopNode(transcriptNodeId)
            }
            onRetry={
              readOnly || !transcriptNodeId
                ? undefined
                : () => retryNode(transcriptNodeId)
            }
            nav={nav}
            onNavigate={verGloboEnPanel}
            contextoTokens={contextoTokens}
            proveedorNombre={NOMBRE_PROVEEDOR[configIA.proveedor]}
            proveedorLeePdf={
              configIA.proveedor === "gemini" || configIA.proveedor === "claude"
            }
            width={panelAncho}
            resizable={panelResizable}
            onResize={guardarAnchoPanel}
          />
        )}
      </div>
    </NodeActionsContext.Provider>
  );
}

export default function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
