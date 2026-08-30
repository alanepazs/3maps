"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { getSupabase } from "@/model/supabase";

// Login OPCIONAL (fase 2.2). Sin sesión, la app es igual que siempre: todo en
// `localStorage`, compartir anónimo. La sesión solo habilita "mis árboles
// compartidos" / despublicar (2.2b) y el sync entre dispositivos (2.4).
//
// Magic link: el usuario pone su mail, le llega un link, lo abre y vuelve con
// `#access_token=…` en el hash — el cliente de Supabase (`detectSessionInUrl`)
// lo levanta solo.

export type EstadoSesion = {
  usuario: User | null;
  cargando: boolean;
  // Manda el magic link al mail. `enviado` queda true si salió bien.
  enviarMagicLink: (email: string) => Promise<void>;
  cerrarSesion: () => Promise<void>;
};

export function useSesion(): EstadoSesion {
  const sb = getSupabase();
  const [usuario, setUsuario] = useState<User | null>(null);
  const [cargando, setCargando] = useState(Boolean(sb));

  useEffect(() => {
    if (!sb) return;
    let vivo = true;
    void sb.auth.getUser().then(({ data }) => {
      if (vivo) {
        setUsuario(data.user ?? null);
        setCargando(false);
      }
    });
    const { data: sub } = sb.auth.onAuthStateChange((_evt, session) => {
      setUsuario(session?.user ?? null);
      setCargando(false);
    });
    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, [sb]);

  const enviarMagicLink = useCallback(
    async (email: string) => {
      if (!sb) throw new Error("El login no está disponible en esta instancia.");
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: {
          // Vuelve a la misma página desde la que se pidió el link.
          emailRedirectTo:
            typeof window !== "undefined"
              ? window.location.origin + window.location.pathname
              : undefined,
        },
      });
      if (error) throw new Error(error.message);
    },
    [sb],
  );

  const cerrarSesion = useCallback(async () => {
    if (sb) await sb.auth.signOut();
    setUsuario(null);
  }, [sb]);

  return { usuario, cargando, enviarMagicLink, cerrarSesion };
}
