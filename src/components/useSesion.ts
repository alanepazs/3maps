"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { getSupabase } from "@/model/supabase";

// Login OPCIONAL (fase 2.2). Sin sesión, la app es igual que siempre: todo en
// `localStorage`, compartir anónimo. La sesión solo habilita "mis árboles
// compartidos" / despublicar (2.2b) y el sync entre dispositivos (2.4).
//
// Dos vías, las dos vuelven con la sesión en el hash (`#access_token=…`) que
// `detectSessionInUrl` levanta solo:
//   - Google OAuth (`signInWithGoogle`): un click, sin mail. Recomendado.
//   - Magic link (`enviarMagicLink`): mail con un link. Limitado a ~4/hora en
//     el free tier de Supabase.

export type EstadoSesion = {
  usuario: User | null;
  cargando: boolean;
  // Redirige a Google y vuelve logueado.
  signInWithGoogle: () => Promise<void>;
  // Manda el magic link al mail.
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

  const redirect = () =>
    typeof window !== "undefined"
      ? window.location.origin + window.location.pathname
      : undefined;

  const signInWithGoogle = useCallback(async () => {
    if (!sb) throw new Error("El login no está disponible en esta instancia.");
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirect() },
    });
    if (error) throw new Error(error.message);
  }, [sb]);

  const enviarMagicLink = useCallback(
    async (email: string) => {
      if (!sb) throw new Error("El login no está disponible en esta instancia.");
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirect() },
      });
      if (error) throw new Error(error.message);
    },
    [sb],
  );

  const cerrarSesion = useCallback(async () => {
    if (sb) await sb.auth.signOut();
    setUsuario(null);
  }, [sb]);

  return {
    usuario,
    cargando,
    signInWithGoogle,
    enviarMagicLink,
    cerrarSesion,
  };
}
