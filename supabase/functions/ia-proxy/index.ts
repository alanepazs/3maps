// ia-proxy — proxy stateless para los proveedores de IA OpenAI-compatibles que
// NO habilitan CORS desde el navegador (OpenAI, DeepSeek, Groq, OpenRouter,
// Mistral, Hugging Face, Zhipu/GLM, Qwen, Moonshot, SiliconFlow).
// Ver docs/decisiones.md §7a, F2-6.
//
// Qué hace: recibe la request del navegador, la reenvía al proveedor con la API
// key del usuario (que viene en el header `x-ia-key`), y devuelve la respuesta
// —streaming incluido— con los headers de CORS que faltaban.
//
// STATELESS a propósito: no loguea el body ni la key, no guarda nada. La key
// del usuario solo TRANSITA por acá (invariante relajada, opción A). El usuario
// lo activa a mano con un toggle en ⚙️ que se lo explica.
//
// Deploy:
//   supabase functions deploy ia-proxy --project-ref ejecjjpdjoxgrbqrhwwd
// (o pegar este archivo en el editor de Edge Functions del panel de Supabase).
// `verify_jwt = false` en supabase/config.toml — no pide auth de Supabase; el
// control de abuso es la lista de orígenes + que cada uno trae su propia key.

const PROVEEDORES: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  mistral: "https://api.mistral.ai/v1",
  huggingface: "https://router.huggingface.co/v1",
  zhipu: "https://open.bigmodel.cn/api/paas/v4",
  qwen: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  moonshot: "https://api.moonshot.cn/v1",
  siliconflow: "https://api.siliconflow.com/v1",
};

const RUTAS_OK = new Set(["/chat/completions", "/models"]);

const ORIGENES_DEFECTO = [
  "https://alanepazs.github.io",
  "http://localhost:3000",
];

function origenPermitido(origin: string | null): string | null {
  const env = Deno.env.get("PROXY_ALLOWED_ORIGINS");
  const lista = env
    ? env.split(",").map((s) => s.trim()).filter(Boolean)
    : ORIGENES_DEFECTO;
  if (lista.includes("*")) return "*";
  return origin && lista.includes(origin) ? origin : null;
}

function headersCors(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "content-type, x-ia-provider, x-ia-path, x-ia-key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  const ao = origenPermitido(origin);
  if (ao) h["Access-Control-Allow-Origin"] = ao;
  return h;
}

function jsonError(msg: string, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify({ error: { message: msg } }), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = headersCors(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (!cors["Access-Control-Allow-Origin"]) {
    return new Response("Origen no permitido", { status: 403 });
  }

  const proveedor = req.headers.get("x-ia-provider") ?? "";
  const base = PROVEEDORES[proveedor];
  if (!base) return jsonError("Proveedor inválido.", 400, cors);

  const ruta = req.headers.get("x-ia-path") ?? "/chat/completions";
  if (!RUTAS_OK.has(ruta)) return jsonError("Ruta no permitida.", 400, cors);

  const key = req.headers.get("x-ia-key");
  if (!key) return jsonError("Falta la API key (header x-ia-key).", 401, cors);

  let upstream: Response;
  try {
    upstream = await fetch(base + ruta, {
      method: req.method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body:
        req.method === "GET" || req.method === "HEAD"
          ? undefined
          : await req.text(),
    });
  } catch (_e) {
    return jsonError("No se pudo contactar al proveedor.", 502, cors);
  }

  // Pasar tal cual: status + body (streameado) + content-type, más el CORS.
  const headers = new Headers(cors);
  const ct = upstream.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  return new Response(upstream.body, { status: upstream.status, headers });
});
