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
  ]),
]);

export default eslintConfig;
