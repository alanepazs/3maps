"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Arbol } from "@/model/intercambio";
import { guardarArbol } from "@/model/persistencia";
import { marcarSincronizado, planInicial, subirArbolNube } from "@/model/sync";
import { useSesion } from "./useSesion";

// Sync del árbol de trabajo entre dispositivos (fase 2.4). Last-write-wins por
// hora del SERVIDOR (no la del navegador), sin prompt de conflicto.
//
//   - Al loguear: `planInicial` decide subir / traer / nada.
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
  const uidRef = useRef<string | null>(null);
  useEffect(() => {
    arbolRef.current = arbol;
    uidRef.current = usuario?.id ?? null;
  });

  // La instancia de `Arbol` que consideramos "ya en la nube".
  const sincronizado = useRef<Arbol | null>(null);
  const syncInicialDe = useRef<string | null>(null);
  const pendiente = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const subirYa = useCallback(async () => {
    pendiente.current = false;
    const uid = uidRef.current;
    if (!uid) return;
    const snap = arbolRef.current;
    setEstado("sincronizando");
    const at = await subirArbolNube(snap, uid);
    if (at) sincronizado.current = snap;
    setEstado(at ? "ok" : "error");
  }, []);

  // ── Sync inicial al loguear ────────────────────────────────────────────────
  useEffect(() => {
    if (!listo || !activo || !usuario) {
      if (!usuario) {
        syncInicialDe.current = null;
        sincronizado.current = null;
      }
      return;
    }
    if (syncInicialDe.current === usuario.id) return;
    syncInicialDe.current = usuario.id;

    const uid = usuario.id;
    let vivo = true;
    void (async () => {
      setEstado("sincronizando");
      const plan = await planInicial(arbolRef.current, uid);
      if (!vivo) return;
      console.info("[3maps sync] inicial:", plan.accion);
      if (plan.accion === "traer") {
        setArbol(plan.arbol);
        guardarArbol(plan.arbol);
        marcarSincronizado(plan.updatedAt, plan.arbol);
        sincronizado.current = plan.arbol;
        setEstado("ok");
      } else if (plan.accion === "subir") {
        const at = await subirArbolNube(arbolRef.current, uid);
        if (!vivo) return;
        if (at) sincronizado.current = arbolRef.current;
        setEstado(at ? "ok" : "error");
      } else {
        sincronizado.current = arbolRef.current;
        setEstado("ok");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [usuario, listo, activo, setArbol]);

  // ── Subir en cada cambio (debounce) ───────────────────────────────────────
  useEffect(() => {
    if (!listo || !activo || !usuario) return;
    if (syncInicialDe.current !== usuario.id) return; // esperar al sync inicial
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
