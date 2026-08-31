"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import BranchTranscript from "./BranchTranscript";
import SharedBanner from "./SharedBanner";
import { NodeActionsContext } from "./nodeActions";
import {
  DEFAULT_SETTINGS,
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
  caminoRaizA,
  conError,
  conPosicion,
  conRama,
  conRespuesta,
  crearIntercambio,
  descendientes,
  nuevoId,
  quitarSubarbol,
  reparentar,
  type Arbol,
  type Proveedor,
  type Rama,
} from "@/model/intercambio";
import { cargarArbol, guardarArbol } from "@/model/persistencia";
import { calcularLayout, ubicarNuevoGlobo } from "@/model/layout";
import {
  borrarMapa,
  crearMapa,
  fusionarMapasNube,
  leerMapas,
  mapaActivoId,
  renombrarMapa,
  setMapaActivo,
  type Mapas,
} from "@/model/mapas";
import {
  bajarIndiceMapasNube,
  borrarMapaNube,
  subirIndiceMapasNube,
} from "@/model/sync";
import { useSesion } from "./useSesion";
import MapaSwitcher from "./MapaSwitcher";
import {
  armarContexto,
  intercambiosRelevantes,
  tramoAResumir,
} from "@/model/contexto";
import { llamarIA, resumir, MODELO_POR_DEFECTO, type ConfigIA } from "@/model/ia";
import {
  borrarKeyProveedor,
  cambiarProveedorActivo,
  cargarConfigIA,
  guardarConfigIA,
} from "@/model/configIA";
import { haySupabase } from "@/model/supabase";
import {
  cargarArbolCompartido,
  compartirArbol,
  limpiarSlugDeLaUrl,
  slugDeLaUrl,
} from "@/model/compartir";

// Definido a nivel de módulo (no dentro del componente): si React Flow recibe
// un objeto nodeTypes nuevo en cada render, remonta todos los nodos.
const nodeTypes: NodeTypes = { message: MessageNode };

// Comparación shallow del `data` de un nodo (pregunta/respuesta/pending/isRoot).
function datosIguales(a: Node["data"], b: Node["data"]): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
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
  const activoIniId = semilla.intercambios.at(-1)?.id ?? null;
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
  // Ver docs/fase-2.md (2.3).
  const slugInicial = useMemo(() => slugDeLaUrl(), []);
  const [compartido, setCompartido] = useState<{ titulo: string } | null>(null);
  const readOnly = compartido !== null;
  // Id a seleccionar tras la próxima reconstrucción de la vista (globo recién
  // creado, o el padre tras un borrado). null = mantener la selección actual.
  const seleccionarLuegoRef = useRef<string | null>(null);
  const { getNode, getViewport, setViewport, setCenter, fitView } =
    useReactFlow();

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
    // Poblar el registro de mapas (corre la migración del formato viejo) —
    // recién acá, no en el render, para no romper la hidratación.
    const idActivo = mapaActivoId();
    setMapaId(idActivo);
    setMapas(leerMapas());

    if (slugInicial) {
      let cancelado = false;
      void cargarArbolCompartido(slugInicial).then((res) => {
        if (cancelado) return;
        if (res) {
          const ultimo = res.arbol.intercambios.at(-1)?.id ?? null;
          setArbol(res.arbol);
          setActiveNodeId(ultimo);
          seleccionarLuegoRef.current = ultimo;
          setCompartido({ titulo: res.titulo });
        } else {
          limpiarSlugDeLaUrl();
          const guardado = cargarArbol(idActivo);
          const ultimo = guardado.intercambios.at(-1)?.id ?? null;
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
    const ultimo = guardado.intercambios.at(-1)?.id ?? null;
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
    const t = setTimeout(() => void fitView({ duration: 200 }), 0);
    return () => clearTimeout(t);
  }, [listo, fitView]);

  // Ajustes configurables (tuerquita). En el server no hay localStorage, así
  // que se usan los defaults; en el cliente se leen los guardados. No hay
  // mismatch de hidratación porque el panel arranca cerrado y nada del render
  // inicial depende de estos valores.
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

  // Configuración de la IA (proveedor activo + su API key + modelo). Solo en
  // este navegador. `configIA.ts` guarda una key POR PROVEEDOR, así que cambiar
  // de proveedor y volver no pierde la key. Lazy init igual que `settings`.
  const [configIA, setConfigIA] = useState<ConfigIA>(() =>
    typeof window === "undefined"
      ? { proveedor: "gemini", apiKey: "", modelo: MODELO_POR_DEFECTO.gemini }
      : cargarConfigIA(),
  );
  // Guarda la key/modelo del proveedor activo.
  const guardarKeyIA = useCallback((c: ConfigIA) => {
    setConfigIA(c);
    guardarConfigIA(c);
  }, []);
  // Cambia el proveedor activo y trae su key guardada (si tiene).
  const cambiarProveedorIA = useCallback((p: Proveedor) => {
    setConfigIA(cambiarProveedorActivo(p));
  }, []);
  // Borra solo la key del proveedor activo.
  const borrarKeyIA = useCallback(() => {
    setConfigIA((cur) => borrarKeyProveedor(cur.proveedor));
  }, []);

  // Llamadas a la IA en curso, por id de nodo (para poder cancelarlas).
  const enVueloRef = useRef<Map<string, AbortController>>(new Map());
  // Resúmenes del tramo viejo del contexto, cacheados por los ids del tramo.
  const resumenCacheRef = useRef<Map<string, string>>(new Map());
  // Espejo del árbol actual para leerlo dentro de callbacks async.
  const arbolRef = useRef(arbol);
  useEffect(() => {
    arbolRef.current = arbol;
  }, [arbol]);

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
          antes.sourceHandle === fresco.sourceHandle
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
        }),
      );

      // Watchdog: si la llamada se queda "estática" (el stream se abre pero no
      // llega nada, o el server deja la conexión colgada) hay que cortarla — si
      // no, el globo queda `pending` para siempre sin forma de reintentar.
      const INACTIVIDAD_MS = 45_000;
      const TOTAL_MS = 180_000;
      let ultimaActividad = Date.now();
      const inicio = Date.now();
      let cortadoPorTimeout = false;
      const watchdog = window.setInterval(() => {
        const ahora = Date.now();
        if (
          ahora - ultimaActividad > INACTIVIDAD_MS ||
          ahora - inicio > TOTAL_MS
        ) {
          cortadoPorTimeout = true;
          ctrl.abort();
        }
      }, 5_000);

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
        if (viejos.length > 0) {
          const clave = viejos.map((i) => i.id).join("|");
          resumen = resumenCacheRef.current.get(clave) ?? null;
          if (!resumen) {
            try {
              resumen = await resumir(configIA, viejos, {
                usarProxy: settings.usarProxyIA,
              });
              resumenCacheRef.current.set(clave, resumen);
            } catch {
              resumen = null;
            }
          }
          ultimaActividad = Date.now(); // el resumen puede tardar
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
        const texto = await llamarIA(configIA, mensajes, {
          signal: ctrl.signal,
          sistema,
          usarProxy: settings.usarProxyIA,
          onTexto: (_delta, acumulado) => {
            const ahora = Date.now();
            ultimaActividad = ahora;
            if (ahora - ultimoRender < 80) return;
            ultimoRender = ahora;
            setArbol((a) =>
              conRespuesta(a, nodeId, { respuesta: acumulado, pending: true }),
            );
          },
        });

        setArbol((a) =>
          conRespuesta(a, nodeId, {
            respuesta: texto,
            pending: false,
            proveedor: configIA.proveedor,
          }),
        );
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          // Timeout del watchdog → error reintentable (deja la respuesta parcial
          // a la vista). Abort "normal" (el usuario re-disparó / borró) → nada.
          if (cortadoPorTimeout) {
            setArbol((a) =>
              conError(
                a,
                nodeId,
                "La respuesta se cortó (no llegó nada en 45s, seguramente el proveedor está saturado). Reintentá.",
              ),
            );
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
    ],
  );

  // Crea UN globo (intercambio) colgando del nodo activo (o de `parentId`, para
  // el composer del panel lateral — fase 3.9) y le pide la respuesta a la IA.
  // "main" cuelga hacia abajo (sigue el hilo); "branch" nace por la derecha
  // (después se puede arrastrar a la izquierda). Devuelve el id del globo nuevo.
  const handleSubmit = useCallback(
    (text: string, kind: BranchKind, parentId?: string): string | null => {
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
      // Buscar un lugar libre cerca del padre (no pisa a ningún otro globo) y
      // el lado de la rama (alterna izq/der para un árbol parejo). Ver layout.ts.
      const medir = (nid: string) => {
        const n = getNode(nid);
        return {
          w: n?.measured?.width ?? 260,
          h: n?.measured?.height ?? 160,
        };
      };
      const { x, y, rama } = ubicarNuevoGlobo(
        arbol,
        parent.id,
        kind === "main" ? "main" : "branch",
        medir,
      );
      const nuevo = crearIntercambio({
        id,
        padreId: parent.id,
        rama,
        pregunta: text,
        x,
        y,
        pending: true,
      });
      const arbolNuevo = agregar(arbol, nuevo);

      seleccionarLuegoRef.current = id;
      setArbol(arbolNuevo);
      setActiveNodeId(id);
      centrarEnGlobo(x, y);
      void responder(id, arbolNuevo);
      return id;
    },
    [arbol, activeNodeId, responder, readOnly, getNode, centrarEnGlobo],
  );

  const retryNode = useCallback(
    (id: string) => {
      if (readOnly) return;
      void responder(id, arbolRef.current);
    },
    [responder, readOnly],
  );

  // Al soltar / frenar el envión: escribir la posición final al árbol y, si es
  // una rama, fijar el lado (izq/der) según dónde quedó respecto del padre.
  const asentar = useCallback(
    (id: string) => {
      const n = getNode(id);
      if (!n) return;
      const { x, y } = n.position;
      setArbol((a) => {
        const ic = buscar(a, id);
        if (!ic) return a;
        const conPos = conPosicion(a, id, x, y);
        if (ic.padreId === null || ic.rama === "main") return conPos;
        const p = buscar(a, ic.padreId);
        const lado: Rama = p && x < p.x ? "branch-left" : "branch-right";
        return conRama(conPos, id, lado);
      });
    },
    [getNode],
  );

  // Envión / inercia al soltar, tipo Obsidian Canvas.
  const {
    onNodeDragStart: nodeInertiaDragStart,
    onNodeDrag: nodeInertiaDrag,
    onNodeDragStop,
    onSelectionDragStart,
    onSelectionDrag,
    onSelectionDragStop,
    cancelInertia,
  } = useNodeInertia(setNodes, asentar, settings.inertia);

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
      const edgeId = `e-${ic.padreId}-${node.id}`;
      setEdges((eds) => {
        const i = eds.findIndex((e) => e.id === edgeId);
        if (i === -1 || eds[i].sourceHandle === lado) return eds;
        const next = eds.slice();
        next[i] = { ...next[i], sourceHandle: lado };
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
    window.setTimeout(() => void fitView({ duration: 400 }), 50);
  }, [cancelInertia, cancelPanInertia, getNode, setNodes, fitView]);

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
          `Se van a eliminar ${desc.length + 1} globos: este y todo lo que cuelga de él. ¿Seguir?`,
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
      const padreId = buscar(arbol, id)?.padreId ?? null;
      seleccionarLuegoRef.current = padreId;
      setArbol((a) => quitarSubarbol(a, id));
      setActiveNodeId(padreId);
    },
    [arbol, cancelInertia, cancelPanInertia, readOnly],
  );

  // Panel de transcripción de la rama (doble-click en un globo o botón ⤢).
  const [transcriptNodeId, setTranscriptNodeId] = useState<string | null>(null);
  const openNode = useCallback((id: string) => setTranscriptNodeId(id), []);
  const transcripcion = useMemo(
    () => (transcriptNodeId ? caminoRaizA(arbol, transcriptNodeId) : null),
    [arbol, transcriptNodeId],
  );

  // Composer del panel lateral (fase 3.9): crea un hijo "main" del globo abierto
  // y mueve el panel a ese hijo, así se ve su respuesta sin cerrar el panel.
  const responderDesdePanel = useCallback(
    (text: string) => {
      if (!transcriptNodeId) return;
      const id = handleSubmit(text, "main", transcriptNodeId);
      if (id) setTranscriptNodeId(id);
    },
    [handleSubmit, transcriptNodeId],
  );

  const nodeActions = useMemo(
    () => ({ deleteNode, retryNode, openNode, readOnly }),
    [deleteNode, retryNode, openNode, readOnly],
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
    const ultimo = t.intercambios.at(-1)?.id ?? null;
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
      window.setTimeout(() => void fitView({ duration: 300 }), 60);
    },
    [mapaId, cancelInertia, cancelPanInertia, cargarEnMapa, fitView],
  );

  const nuevoMapa = useCallback(() => {
    cancelInertia();
    cancelPanInertia();
    const n = Object.keys(leerMapas()).length + 1;
    const id = crearMapa(`Mapa ${n}`);
    const m = leerMapas();
    setMapas(m);
    const vacio: Arbol = { intercambios: [] };
    guardarArbol(vacio, id);
    cargarEnMapa(id, vacio);
    if (usuario) void subirIndiceMapasNube(usuario.id, m);
  }, [cancelInertia, cancelPanInertia, cargarEnMapa, usuario]);

  const borrarMapaActual = useCallback(() => {
    const ids = Object.keys(mapas);
    if (ids.length <= 1) return;
    const titulo = mapas[mapaId]?.titulo ?? "este mapa";
    if (
      !window.confirm(
        `¿Borrar el mapa “${titulo}”? Se pierde su árbol (esto no se puede deshacer).`,
      )
    ) {
      return;
    }
    cancelInertia();
    cancelPanInertia();
    const m = borrarMapa(mapaId);
    setMapas(m);
    if (usuario) {
      void borrarMapaNube(usuario.id, mapaId);
      void subirIndiceMapasNube(usuario.id, m);
    }
    const siguiente = Object.keys(m)[0];
    cargarEnMapa(siguiente, cargarArbol(siguiente));
    window.setTimeout(() => void fitView({ duration: 300 }), 60);
  }, [
    mapas,
    mapaId,
    usuario,
    cancelInertia,
    cancelPanInertia,
    cargarEnMapa,
    fitView,
  ]);

  const renombrarMapaActual = useCallback(
    (titulo: string) => {
      const m = renombrarMapa(mapaId, titulo);
      setMapas(m);
      if (usuario) void subirIndiceMapasNube(usuario.id, m);
    },
    [mapaId, usuario],
  );

  // Sync de la LISTA de mapas entre dispositivos (unión, sin propagar borrados):
  // al loguear, traer el índice de la nube y fusionar los que falten localmente.
  useEffect(() => {
    if (!usuario || readOnly) return;
    let vivo = true;
    void bajarIndiceMapasNube(usuario.id).then((nube) => {
      if (vivo && nube) setMapas(fusionarMapasNube(nube));
    });
    return () => {
      vivo = false;
    };
  }, [usuario, readOnly]);

  // ── Sync entre dispositivos (fase 2.4, per-mapa desde 3.5) ────────────────
  // Solo con sesión y fuera del modo compartido. Last-write-wins.
  const aplicarArbolNube = useCallback((a: Arbol) => {
    const ultimo = a.intercambios.at(-1)?.id ?? null;
    seleccionarLuegoRef.current = ultimo;
    setArbol(a);
    setActiveNodeId((cur) =>
      a.intercambios.some((i) => i.id === cur) ? cur : ultimo,
    );
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
      <div className="relative h-full w-full">
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
          onSelectionDragStart={onSelectionDragStart}
          onSelectionDrag={onSelectionDrag}
          onSelectionDragStop={onSelectionDragStop}
          onMoveStart={onMoveStart}
          onMove={onMove}
          onMoveEnd={onMoveEnd}
          onNodeClick={() => cancelInertia()}
          onNodeDoubleClick={(_, node) => setTranscriptNodeId(node.id)}
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
          fitView
          // El doble-click abre la transcripción de la rama (`onNodeDoubleClick`);
          // si no, React Flow lo usa para hacer zoom.
          zoomOnDoubleClick={false}
        >
          <Background />
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
          />
        )}
        {!readOnly && (
          <Composer
            activeNodeLabel={activeNodeLabel}
            arbolVacio={arbol.intercambios.length === 0}
            onSubmit={handleSubmit}
          />
        )}
        {transcripcion && transcripcion.length > 0 && (
          <BranchTranscript
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
