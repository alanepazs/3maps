-- ─────────────────────────────────────────────────────────────────────────────
-- 3maps — esquema de Supabase para fase 2 (compartir por link + mis árboles)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- CÓMO CORRERLO: panel de Supabase → SQL Editor → pegar todo esto → Run.
-- Es idempotente: se puede correr de nuevo sin romper nada.
--
-- Qué crea:
--   • Bucket de Storage `arboles` (público para lectura). Cada árbol compartido
--     es UN archivo JSON: `arboles/<slug>.json`.
--   • Políticas RLS de Storage: cualquiera sube y lee; solo el DUEÑO borra lo
--     suyo (los subidos sin login no tienen dueño → no se pueden despublicar).
--   • Tabla `shared_trees`: metadata de los árboles que compartiste LOGUEADO,
--     para la lista "mis árboles compartidos" en ⚙️ (fase 2.2b). El árbol en sí
--     NO necesita esta tabla para abrirse (el título va en el JSON) — es solo
--     para que el dueño los vea y los despublique.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) Bucket ────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('arboles', 'arboles', true, 2097152, array['application/json'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── 2) Políticas de Storage (se borran y recrean para que el script repita) ──
drop policy if exists "3maps: leer arboles" on storage.objects;
drop policy if exists "3maps: subir arboles" on storage.objects;
drop policy if exists "3maps: borrar arboles propios" on storage.objects;

-- Lectura: cualquiera (anon o logueado) baja cualquier archivo del bucket.
create policy "3maps: leer arboles"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'arboles');

-- Subir: cualquiera sube uno NUEVO. Sin update → nadie pisa el de otro.
create policy "3maps: subir arboles"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'arboles');

-- Borrar: solo el dueño (el que lo subió logueado). `owner` lo setea Supabase
-- al subir con sesión; los subidos anónimos tienen owner NULL → no se borran.
create policy "3maps: borrar arboles propios"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'arboles' and owner = auth.uid());

-- ── 3) Tabla shared_trees (metadata para "mis árboles compartidos") ──────────
create table if not exists public.shared_trees (
  slug text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null default '',
  creado timestamptz not null default now()
);

alter table public.shared_trees enable row level security;

drop policy if exists "shared_trees: dueño lee" on public.shared_trees;
drop policy if exists "shared_trees: dueño inserta" on public.shared_trees;
drop policy if exists "shared_trees: dueño borra" on public.shared_trees;

create policy "shared_trees: dueño lee"
  on public.shared_trees for select
  to authenticated
  using (owner_id = auth.uid());

create policy "shared_trees: dueño inserta"
  on public.shared_trees for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "shared_trees: dueño borra"
  on public.shared_trees for delete
  to authenticated
  using (owner_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- Límite conocido (ver docs/fase-2.md): un anónimo puede subir muchos archivos
-- chicos y llenar el free tier. La defensa real (rate-limit) necesita un edge
-- function. Por ahora: tope de 2 MB por archivo + límite del lado del cliente
-- (50 intercambios / ~1 MB). Y los árboles compartidos SIN login no se pueden
-- despublicar (no tienen dueño).
-- ─────────────────────────────────────────────────────────────────────────────
