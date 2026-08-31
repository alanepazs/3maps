"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Arbol } from "@/model/intercambio";
import { guardarArbol } from "@/model/persistencia";
import {
  bajarArbolNube,
  estadoSyncLocal,
  marcarSincronizado,
  metaNube,
  planInicial,
  subirArbolNube,
} from "@/model/sync";
import { useSesion } from "./useSesion";

// Sync del árbol de trabajo entre dispositivos (fase 2.4, per-mapa desde 3.5).
// Last-write-wins por hora del SERVIDOR, sin prompt de conflicto.
//
//   - Al loguear / cambiar de mapa: `planInicial` decide subir / traer / nada.
//     Corre UNA vez por (uid, mapa) y NO se cancela si el efecto se re-ejecuta
//     (p. ej. `onAuthStateChange` emite `TOKEN_REFRESHED`) — cancelarlo a mitad
//     dejaba subir el árbol de ejemplo por el debounce, pisando el de la nube.
//   - El debounce de subida NO arranca hasta que el sync inicial terminó.
//   - En cada cambio del árbol: subir (debounce ~1.5s) + flush al ocultar/cerrar.
//
// `activo` = false cuando se está viendo un árbol compartido (`?compartir=`).

export type EstadoSync = "off" | "sincronizando" | "ok" | "error";
const DEBOUNCE_MS = 1500;
// Cada cuánto chequear si la nube tiene una versión más nueva del mapa abierto
// (además de al volver a foco). El sync NO es push en tiempo real.
const POLL_MS = 15_000;

export function useSync(opts: {
  arbol: Arbol;
  setArbol: (a: Arbol) => void;
  listo: boolean;
  activo: boolean;
  mapId: string;
  titulo: string;
  // Al traer de la nube un mapa con título distinto (sync entre dispositivos).
  onTituloNube?: (titulo: string) => void;
}): EstadoSync {
  const { arbol, setArbol, listo, activo, mapId, titulo, onTituloNube } = opts;
  const { usuario } = useSesion();
  const [estado, setEstado] = useState<EstadoSync>("ok");

  const arbolRef = useRef(arbol);
  const setArbolRef = useRef(setArbol);
  const uidRef = useRef<string | null>(null);
  const mapIdRef = useRef(mapId);
  const tituloRef = useRef(titulo);
  const onTituloNubeRef = useRef(onTituloNube);
  useEffect(() => {
    arbolRef.current = arbol;
    setArbolRef.current = setArbol;
    uidRef.current = usuario?.id ?? null;
    mapIdRef.current = mapId;
    tituloRef.current = titulo;
    onTituloNubeRef.current = onTituloNube;
  });

  // La instancia de `Arbol` que consideramos "ya en la nube".
  const sincronizado = useRef<Arbol | null>(null);
  // clave (uid::mapa) para la que ya arrancó el sync inicial.
  const inicialDe = useRef<string | null>(null);
  const inicialListo = useRef(false);
  const pendiente = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const subirYa = useCallback(async () => {
    pendiente.current = false;
    const uid = uidRef.current;
    if (!uid || !inicialListo.current) return;
    const snap = arbolRef.current;
    // Hay una llamada a la IA en curso → NO subir el árbol a medias (el otro
    // dispositivo mostraría "la respuesta quedó a medias"). No se re-agenda acá:
    // cuando el streaming avanza/termina, `arbol` cambia y el effect de cambio
    // vuelve a armar el debounce.
    if (snap.intercambios.some((i) => i.pending)) {
      pendiente.current = true;
      return;
    }
    setEstado("sincronizando");
    const at = await subirArbolNube(
      snap,
      uid,
      mapIdRef.current,
      tituloRef.current,
    );
    if (at) sincronizado.current = snap;
    setEstado(at ? "ok" : "error");
  }, []);

  // ── Traer del otro dispositivo (poll + al volver a foco) ──────────────────
  // El sync inicial corre una vez; después, si el otro dispositivo edita el mapa
  // que tenés abierto, no te enterás hasta recargar. Esto lo chequea.
  const revisarNube = useCallback(async () => {
    const uid = uidRef.current;
    const mapId = mapIdRef.current;
    if (!uid || !inicialListo.current || pendiente.current) return;
    // Local con cambios sin confirmar en la nube → no pisar (nuestro push gana).
    if (arbolRef.current !== sincronizado.current) return;
    // Pre-chequeo barato: si la hora del servidor no cambió, no bajar el árbol.
    const meta = await metaNube(uid, mapId);
    if (!meta || meta.updatedAt === estadoSyncLocal(mapId).at) return;
    const bajado = await bajarArbolNube(uid, mapId);
    if (!bajado) return;
    if (uidRef.current !== uid || mapIdRef.current !== mapId) return;
    if (arbolRef.current !== sincronizado.current) return;
    if (bajado.updatedAt === estadoSyncLocal(mapId).at) return; // ya lo tenemos
    setArbolRef.current(bajado.arbol);
    guardarArbol(bajado.arbol, mapId);
    marcarSincronizado(mapId, bajado.updatedAt, bajado.arbol, uid);
    sincronizado.current = bajado.arbol;
    if (bajado.titulo && bajado.titulo !== tituloRef.current) {
      onTituloNubeRef.current?.(bajado.titulo);
    }
  }, []);

  useEffect(() => {
    if (!usuario || !activo) return;
    const tick = () => {
      if (document.visibilityState === "visible") void revisarNube();
    };
    const id = window.setInterval(tick, POLL_MS);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [usuario, activo, revisarNube]);

  // ── Sync inicial al loguear / cambiar de mapa (una vez por uid+mapa) ───────
  useEffect(() => {
    if (!listo || !activo || !usuario) {
      if (!usuario) {
        inicialDe.current = null;
        inicialListo.current = false;
        sincronizado.current = null;
      }
      return;
    }
    const uid = usuario.id;
    const clave = `${uid}::${mapId}`;
    if (inicialDe.current === clave) return;
    inicialDe.current = clave;
    inicialListo.current = false;

    void (async () => {
      setEstado("sincronizando");
      const plan = await planInicial(arbolRef.current, uid, mapId);
      if (uidRef.current !== uid || mapIdRef.current !== mapId) return;
      console.info("[3maps sync] inicial:", mapId, plan.accion);
      if (plan.accion === "traer") {
        setArbolRef.current(plan.arbol);
        guardarArbol(plan.arbol, mapId);
        marcarSincronizado(mapId, plan.updatedAt, plan.arbol, uid);
        sincronizado.current = plan.arbol;
        if (plan.titulo && plan.titulo !== tituloRef.current) {
          onTituloNubeRef.current?.(plan.titulo);
        }
        inicialListo.current = true;
        setEstado("ok");
      } else if (plan.accion === "vaciar") {
        const vacio: Arbol = { intercambios: [] };
        setArbolRef.current(vacio);
        guardarArbol(vacio, mapId);
        marcarSincronizado(mapId, "", vacio, uid);
        sincronizado.current = vacio;
        inicialListo.current = true;
        setEstado("ok");
      } else if (plan.accion === "subir") {
        const at = await subirArbolNube(
          arbolRef.current,
          uid,
          mapId,
          tituloRef.current,
        );
        if (uidRef.current !== uid || mapIdRef.current !== mapId) return;
        if (at) sincronizado.current = arbolRef.current;
        inicialListo.current = true;
        setEstado(at ? "ok" : "error");
      } else {
        sincronizado.current = arbolRef.current;
        inicialListo.current = true;
        setEstado("ok");
      }
    })();
  }, [usuario, listo, activo, mapId]);

  // ── Subir en cada cambio (debounce) ───────────────────────────────────────
  useEffect(() => {
    if (!listo || !activo || !usuario || !inicialListo.current) return;
    if (arbol === sincronizado.current) return;
    pendiente.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void subirYa(), DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [arbol, usuario, listo, activo, subirYa]);

  // ── Flush al ocultar / cerrar la pestaña ─────────────────────────────────
  useEffect(() => {
    if (!usuario || !activo) return;
    const flush = () => {
      if (pendiente.current) void subirYa();
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [usuario, activo, subirYa]);

  return usuario ? estado : "off";
}
