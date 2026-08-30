-- ─────────────────────────────────────────────────────────────────────────────
-- 3maps — esquema de Supabase para fase 2.0 / 2.3 (compartir un árbol por link)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- CÓMO CORRERLO: panel de Supabase → SQL Editor → pegar todo esto → Run.
-- Es idempotente: se puede correr de nuevo sin romper nada.
--
-- Qué crea:
--   • Un bucket de Storage `arboles` (público para lectura), donde cada árbol
--     compartido es UN archivo JSON: `arboles/<slug>.json`.
--   • Políticas (RLS) de Storage: cualquiera sube y cualquiera lee; nadie puede
--     pisar ni borrar lo de otro (sin login todavía — fase 2.2).
--
-- Todavía NO hay tabla de metadata ni "mis árboles": eso llega con el login
-- (fase 2.2 / 2.4). Por ahora el slug ES el secreto: quien lo tiene, ve el árbol.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Bucket público, con tope de tamaño y solo JSON.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('arboles', 'arboles', true, 2097152, array['application/json'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) Políticas de Storage. Se borran y recrean para que el script sea repetible.
drop policy if exists "3maps: leer arboles" on storage.objects;
drop policy if exists "3maps: subir arboles" on storage.objects;

-- Lectura: cualquiera (anon o logueado) puede bajar cualquier archivo del bucket.
create policy "3maps: leer arboles"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'arboles');

-- Escritura: cualquiera puede SUBIR uno nuevo. Sin update ni delete → nadie
-- puede pisar el árbol de otro. (El tope de 2 MB lo hace cumplir el bucket.)
create policy "3maps: subir arboles"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'arboles');

-- ─────────────────────────────────────────────────────────────────────────────
-- Límite conocido (a resolver en una tanda futura, ver docs/fase-2.md):
-- un anónimo puede subir muchos archivos chicos y llenar el free tier. La
-- defensa real (rate-limit) necesita un edge function. Por ahora: tope de 2 MB
-- por archivo + límite de tamaño del lado del cliente (50 intercambios / 1 MB).
-- ─────────────────────────────────────────────────────────────────────────────
