"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente de Supabase para fase 2 (compartir / sync). Es OPCIONAL: si no hay
// env configurado, `getSupabase()` devuelve null y la app sigue 100% local
// (sin backend, como en fase 1). Nada del canvas ni de la IA lo necesita.
//
// Las dos env vars son "públicas por diseño" (van en el bundle del navegador):
//   NEXT_PUBLIC_SUPABASE_URL       — https://<ref>.supabase.co
//   NEXT_PUBLIC_SUPABASE_ANON_KEY  — la publishable / anon key (NO la secret)
// La invariante de CLAUDE.md ("la key de IA nunca a un server propio") sigue en
// pie: esto es la key de Supabase, no la del proveedor de IA.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let cliente: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!cliente) {
    cliente = createClient(url, anonKey, {
      auth: {
        // Fase 2.0/2.3 no usa login todavía; que no intente refrescar sesiones
        // ni escuchar el hash de la URL (rompería el `?compartir=` que leemos).
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return cliente;
}

// `true` si el backend está configurado (para mostrar/ocultar el botón Compartir).
export function haySupabase(): boolean {
  return Boolean(url && anonKey);
}

// URL del edge function `ia-proxy` (fase 2.1). Se deriva de la URL del proyecto
// — no hace falta otra env. `null` si no hay Supabase configurado.
export function proxyIAUrl(): string | null {
  return url ? `${url.replace(/\/$/, "")}/functions/v1/ia-proxy` : null;
}
