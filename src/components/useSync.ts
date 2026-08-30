"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Arbol } from "@/model/intercambio";
import { guardarArbol } from "@/model/persistencia";
import { marcarSincronizado, planInicial, subirArbolNube } from "@/model/sync";
import { useSesion } from "./useSesion";

// Sync del árbol de trabajo entre dispositivos (fase 2.4). Last-write-wins por
// hora del SERVIDOR, sin prompt de conflicto.
//
//   - Al loguear: `planInicial` decide subir / traer / nada. Corre UNA vez por
//     uid y NO se cancela si el efecto se re-ejecuta (p. ej. `onAuthStateChange`
//     emite `TOKEN_REFRESHED` con un `user` nuevo) — cancelarlo a mitad dejaba
//     subir el árbol de ejemplo por el debounce, pisando el de la nube.
//   - El debounce de subida NO arranca hasta que el sync inicial terminó
//     (`inicialListo`).
//   - En cada cambio del árbol: subir (debounce ~1.5s) + flush al ocultar/cerrar.
//
// `activo` = false cuando se está viendo un árbol compartido (`?compartir=`).

export type EstadoSync = "off" | "sincronizando" | "ok" | "error";
const DEBOUNCE_MS = 1500;

export function useSync(opts: {
  arbol: Arbol;
  setArbol: (a: Arbol) => void;
  listo: boolean;
  activo: boolean;
}): EstadoSync {
  const { arbol, setArbol, listo, activo } = opts;
  const { usuario } = useSesion();
  const [estado, setEstado] = useState<EstadoSync>("ok");

  const arbolRef = useRef(arbol);
  const setArbolRef = useRef(setArbol);
  const uidRef = useRef<string | null>(null);
  useEffect(() => {
    arbolRef.current = arbol;
    setArbolRef.current = setArbol;
    uidRef.current = usuario?.id ?? null;
  });

  // La instancia de `Arbol` que consideramos "ya en la nube".
  const sincronizado = useRef<Arbol | null>(null);
  // uid para el que ya arrancó el sync inicial (no re-arrancarlo).
  const inicialDe = useRef<string | null>(null);
  // El sync inicial terminó de aplicarse (recién ahí el debounce sube).
  const inicialListo = useRef(false);
  const pendiente = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const subirYa = useCallback(async () => {
    pendiente.current = false;
    const uid = uidRef.current;
    if (!uid || !inicialListo.current) return;
    const snap = arbolRef.current;
    setEstado("sincronizando");
    const at = await subirArbolNube(snap, uid);
    if (at) sincronizado.current = snap;
    setEstado(at ? "ok" : "error");
  }, []);

  // ── Sync inicial al loguear (una vez por uid, no se cancela) ───────────────
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
    if (inicialDe.current === uid) return;
    inicialDe.current = uid;
    inicialListo.current = false;

    void (async () => {
      setEstado("sincronizando");
      const plan = await planInicial(arbolRef.current, uid);
      if (uidRef.current !== uid) return; // cambió de sesión mientras tanto
      console.info("[3maps sync] inicial:", plan.accion);
      if (plan.accion === "traer") {
        setArbolRef.current(plan.arbol);
        guardarArbol(plan.arbol);
        marcarSincronizado(plan.updatedAt, plan.arbol);
        sincronizado.current = plan.arbol;
        inicialListo.current = true;
        setEstado("ok");
      } else if (plan.accion === "subir") {
        const at = await subirArbolNube(arbolRef.current, uid);
        if (uidRef.current !== uid) return;
        if (at) sincronizado.current = arbolRef.current;
        inicialListo.current = true;
        setEstado(at ? "ok" : "error");
      } else {
        sincronizado.current = arbolRef.current;
        inicialListo.current = true;
        setEstado("ok");
      }
    })();
  }, [usuario, listo, activo]);

  // ── Subir en cada cambio (debounce) ───────────────────────────────────────
  useEffect(() => {
    if (!listo || !activo || !usuario || !inicialListo.current) return;
    if (arbol === sincronizado.current) return; // nada nuevo (o venía de "traer")
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
