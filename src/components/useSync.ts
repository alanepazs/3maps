"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Arbol } from "@/model/intercambio";
import { guardarArbol } from "@/model/persistencia";
import {
  bajarArbolNube,
  marcarSincronizado,
  subirArbolNube,
  ultimoSyncAt,
} from "@/model/sync";
import { useSesion } from "./useSesion";

// Sync del árbol de trabajo entre dispositivos (fase 2.4). Last-write-wins, sin
// prompt de conflicto (decidido con el usuario).
//
//   - Al loguear (o al montar ya logueado): traer si la nube es más nueva que
//     lo último que sincronizamos; si no, subir la local.
//   - En cada cambio del árbol: subir (debounce ~1.5s) + flush al ocultar/cerrar
//     la pestaña.
//
// `activo` = false cuando se está viendo un árbol compartido (`?compartir=`):
// ahí NO se sincroniza (el árbol es de otro).

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
  useEffect(() => {
    arbolRef.current = arbol;
  });

  // La instancia de `Arbol` que consideramos "ya en la nube". Si `arbol` sigue
  // siendo esta misma referencia, no hay nada nuevo que subir.
  const sincronizado = useRef<Arbol | null>(null);
  // Id de sesión ya con sync inicial hecho (para no repetirlo en cada render).
  const syncInicialDe = useRef<string | null>(null);
  const pendiente = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const subirYa = useCallback(async () => {
    pendiente.current = false;
    const snap = arbolRef.current;
    setEstado("sincronizando");
    const at = await subirArbolNube(snap);
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

    let vivo = true;
    const run = async () => {
      setEstado("sincronizando");
      const nube = await bajarArbolNube();
      if (!vivo) return;
      if (!nube) {
        const at = await subirArbolNube(arbolRef.current);
        if (at) sincronizado.current = arbolRef.current;
        if (vivo) setEstado(at ? "ok" : "error");
        return;
      }
      if (nube.updatedAt > ultimoSyncAt()) {
        // Editado en otro dispositivo después de nuestro último sync → gana la nube.
        setArbol(nube.arbol);
        guardarArbol(nube.arbol);
        marcarSincronizado(nube.updatedAt);
        sincronizado.current = nube.arbol;
        if (vivo) setEstado("ok");
      } else {
        const at = await subirArbolNube(arbolRef.current);
        if (at) sincronizado.current = arbolRef.current;
        if (vivo) setEstado(at ? "ok" : "error");
      }
    };
    void run();
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
