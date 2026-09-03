import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `next/image` no sirve con `output: "export"` para fuentes dinámicas /
      // data-URIs (imágenes del modelo en Markdown, adjuntos del usuario en el
      // panel). Todo el canvas es estático y client-side. Ver decisiones F3-22b.
      "@next/next/no-img-element": "off",

      // Reglas nuevas de `eslint-plugin-react-hooks@7` (vía core-web-vitals de
      // Next 16). Chocan con dos patrones DELIBERADOS de este proyecto:
      //   - `useEffect(() => setX(true), [])` para hidratación SSR: el 1er render
      //     del cliente usa los defaults (= lo que prerenderizó el server) y un
      //     effect de montaje aplica lo de `localStorage`. Sin esto hay mismatch
      //     de hidratación y React 19 no lo patchea. Ver decisiones §5 / B7.
      //   - leer `resumenCacheRef.current` en un `useMemo` de SOLO LECTURA (el
      //     contador "≈ N tokens" del panel, T10): no dispara el resumen, y un
      //     conteo levemente viejo no molesta.
      // Además el plugin tiene un presupuesto de análisis por función → en
      // `FlowCanvas` (`Flow()`, ~1900 líneas) reporta o no estos casos según el
      // tamaño exacto del archivo. Apagarlas hace `npm run lint` determinístico.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Edge functions de Supabase: código Deno, lo type-checkea `supabase` al
    // deployar, no la toolchain de Next.
    "supabase/functions/**",
    // Worktrees de sesiones de Claude Code (build artifacts + copias de src):
    // no son código del proyecto, no linteralos.
    ".claude/**",
  ]),
]);

export default eslintConfig;
