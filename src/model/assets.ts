// Ruta a un archivo de `public/`, con el `basePath` correcto.
// En el build de GitHub Pages (`NEXT_PUBLIC_PAGES=1`) la app vive bajo `/3maps`;
// en `next dev` local, bajo `/`. Next NO prefija solo las URLs de assets que
// referenciás a mano (sí las de `app/icon.png` y `next/image`).
const BASE = process.env.NEXT_PUBLIC_PAGES === "1" ? "/3maps" : "";

export function rutaAsset(archivo: string): string {
  return `${BASE}/${archivo.replace(/^\//, "")}`;
}
