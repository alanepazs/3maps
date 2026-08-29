import type { NextConfig } from "next";

// Deploy: GitHub Pages (estático, sin backend). `output: "export"` genera `out/`.
// El `basePath` solo se aplica en el build de Pages (el workflow setea
// NEXT_PUBLIC_PAGES=1); en `next dev` local la app queda en la raíz.
const enPages = process.env.NEXT_PUBLIC_PAGES === "1";
const REPO = "3maps";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  ...(enPages ? { basePath: `/${REPO}` } : {}),

  // El indicador de dev de Next se pone abajo a la derecha para no tapar la
  // tuerquita de ajustes (arriba a la izquierda del canvas).
  devIndicators: {
    position: "bottom-right",
  },
  // Que `next dev` no escriba el bloque nextjs-agent-rules en CLAUDE.md.
  agentRules: false,
};

export default nextConfig;
