import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El indicador de dev de Next se pone abajo a la derecha para no tapar la
  // tuerquita de ajustes (arriba a la izquierda del canvas).
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;
