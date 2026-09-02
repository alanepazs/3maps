import { memo, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

import LimiteError from "./LimiteError";
import { copiarTexto } from "@/model/exportar";

// Render de markdown para las respuestas de la IA. Compacto (los globos son
// angostos, ~260px) y en tema oscuro.
//
// Pipeline:
//   remark-gfm    tablas / listas / tachado
//   remark-math   $…$  y  $$…$$  → nodos de math
//   rehype-raw    interpreta el HTML crudo del modelo (sobre todo <br> en tablas)
//   rehype-sanitize  limpia ese HTML (un árbol compartido es de otra persona →
//                    no puede meter <script>). Corre ANTES de katex: sanea el
//                    TeX como texto plano; katex después genera markup confiable.
//   rehype-katex  renderiza la matemática (necesita katex.min.css, importado arriba)

// Comandos de matemática sin argumento (`\cdot`, `\sum`, `\pi`…) que igual
// queremos envolver si el modelo los deja sueltos sin `$`.
const MATH_SUELTOS =
  "cdot|times|div|pm|mp|leq|geq|le|ge|neq|ne|approx|equiv|to|rightarrow|Rightarrow|infty|partial|nabla|sum|int|prod|forall|exists|in|notin|subset|cup|cap|pi|alpha|beta|gamma|delta|theta|lambda|mu|sigma|phi|omega|Delta|Sigma|Omega|Gamma|Phi";

// Un token LaTeX: `\cmd` + (opcional) sub/superíndices con arg + (opcional)
// grupos `{…}` (1 nivel de anidado).
const TOKEN_LATEX =
  /\\[a-zA-Z]+(?:\s*[_^]\s*(?:\{(?:[^{}]|\{[^{}]*\})*\}|\\?[a-zA-Z0-9]+))*(?:\s*\{(?:[^{}]|\{[^{}]*\})*\})*/g;

// Un token cuenta como matemática real solo si lleva `{`/`_`/`^` o es un comando
// de la lista de sueltos — así `\n`, `\t`, `C:\newfolder`, "el comando \frac"
// (sin `{`) NO se tocan.
function esMathReal(m: string): boolean {
  if (/[{}_^]/.test(m)) return true;
  const cmd = m.match(/^\\([a-zA-Z]+)/)?.[1] ?? "";
  return new RegExp(`^(?:${MATH_SUELTOS})$`).test(cmd);
}

// Modelos open-source chicos (gpt-oss-120b…) escupen `\frac{…}` entre paréntesis
// normales, sin `$`. remark-math no lo agarra → queda LaTeX crudo. Envolvemos el
// token en `$…$`, línea por línea, salteando código y líneas que ya tienen `$`.
function envolverLatexCrudo(texto: string): string {
  let enFence = false;
  return texto
    .split("\n")
    .map((linea) => {
      if (/^\s*```/.test(linea)) {
        enFence = !enFence;
        return linea;
      }
      if (enFence || /^ {4,}\S/.test(linea)) return linea;
      if (linea.includes("$") || !linea.includes("\\")) return linea;
      return linea.replace(TOKEN_LATEX, (m) => (esMathReal(m) ? `$${m}$` : m));
    })
    .join("\n");
}

// Los modelos usan varios delimitadores para la matemática. remark-math solo
// entiende `$`/`$$`; normalizamos `\[ \]` → `$$` y `\( \)` → `$`, y envolvemos el
// LaTeX crudo suelto, antes de parsear.
function normalizarMath(texto: string): string {
  return envolverLatexCrudo(
    texto
      .replace(/\\\[\s*([\s\S]+?)\s*\\\]/g, (_, m) => `\n\n$$\n${m}\n$$\n\n`)
      .replace(/\\\(\s*([\s\S]+?)\s*\\\)/g, (_, m) => `$${m}$`),
  );
}

// Tokens especiales que largan algunos modelos (padding, BOS/EOS, plantillas de
// chat). Nunca son contenido, y `rehype-raw` los toma como tags HTML SIN CERRAR:
// unos miles de `<PAD>` seguidos = unos miles de niveles de anidado = `RangeError:
// Maximum call stack size exceeded` al parsear (crashea el render). Visto con un
// modelo de HuggingFace. Ver decisiones F3-14.
const TOKENS_BASURA =
  /<\/?(?:pad|unk|mask|cls|sep|s|bos|eos|eot_id|end_of_turn|start_of_turn|begin_of_text|end_of_text|\|[^>]*\|)>/gi;

// Techo de largo: una respuesta legítima rara vez pasa los ~20k chars. 60k deja
// margen y frena que un modelo que escupe basura infinita cuelgue el parser.
const MAX_CHARS = 60_000;

function sanitizarCrudo(texto: string): string {
  let t = texto.replace(TOKENS_BASURA, "");

  // Colapsar tiradas de un char especial de markdown/HTML repetido (`****…`,
  // `[[[[…`) y de blockquote anidado (`> > > …`). Con miles de estos el parser
  // entra en backtracking catastrófico (CUELGA — no lo agarra el error boundary)
  // o anida miles de niveles (RangeError). Nunca es contenido real.
  t = t
    .replace(/([*_~[\]()#`<])\1{15,}/g, "$1$1$1")
    .replace(/(>[ \t]*){12,}/g, "> > > ");

  // Backstop de tags: si aún quedan cientos de aperturas `<x`, es basura de token
  // (`<foo><foo>…`). Escapamos TODO `<` → se ve crudo pero no explota. Una tabla
  // grande con `<br>` ronda las 50; 120 deja margen de sobra.
  const aperturas = (t.match(/<[a-z!/]/gi) ?? []).length;
  if (aperturas > 120) t = t.replace(/</g, "&lt;");

  return t.length > MAX_CHARS
    ? t.slice(0, MAX_CHARS) + "\n\n… (respuesta recortada)"
    : t;
}


// Schema de sanitización = el default + lo que necesita remark-math/katex:
// la clase `math math-inline|display` en el <span>/<div> que envuelve el TeX
// (si se borra, katex no lo encuentra y queda el TeX crudo).
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      ["className", "math", "math-inline"],
    ],
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      ["className", "math", "math-display"],
    ],
  },
};

// Texto crudo del `<code>` dentro de un `<pre>` (nodo hast de react-markdown).
function extraerTextoCodigo(node: unknown): string {
  const el = node as {
    children?: Array<{
      tagName?: string;
      children?: Array<{ type?: string; value?: string }>;
    }>;
  };
  const code = el?.children?.find((c) => c.tagName === "code");
  return (code?.children ?? [])
    .map((c) => (c.type === "text" ? (c.value ?? "") : ""))
    .join("");
}

// Botón "copiar este bloque" (T15), solo cuando `<Markdown conCopiar>`.
function BotonCopiarBloque({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copiarTexto(texto)) {
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        }
      }}
      title="Copiar este bloque"
      className="absolute right-1 top-1 rounded border border-white/15 bg-neutral-900/90 px-1.5 py-0.5 text-[10px] text-white/60 opacity-0 transition-opacity hover:bg-white/10 hover:text-white group-hover:opacity-100"
    >
      {ok ? "✓" : "⧉"}
    </button>
  );
}

const components: Components = {
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
    >
      {children}
    </a>
  ),
  p: ({ children }) => <p className="my-1.5">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-1.5 list-disc pl-4 [&_ul]:my-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1.5 list-decimal pl-4 [&_ol]:my-0.5">{children}</ol>
  ),
  li: ({ children }) => <li className="my-0.5">{children}</li>,
  h1: ({ children }) => (
    <h1 className="mb-1 mt-2 text-[13px] font-semibold">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1 mt-2 text-[13px] font-semibold">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide text-white/60">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1 mt-2 text-xs font-semibold text-white/60">{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 className="mb-1 mt-2 text-xs font-semibold text-white/60">{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 className="mb-1 mt-2 text-xs font-semibold text-white/60">{children}</h6>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children, className }) => {
    const enBloque = /\blanguage-/.test(className ?? "");
    return enBloque ? (
      <code className="block font-mono text-[11px] leading-relaxed">{children}</code>
    ) : (
      <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-1.5 overflow-x-auto rounded bg-black/40 p-2">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-1.5 border-l-2 border-white/20 pl-2 text-white/70">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 border-white/10" />,
  table: ({ children }) => (
    <div className="my-1.5 overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-white/15 px-1.5 py-0.5 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-white/15 px-1.5 py-0.5 align-top">{children}</td>
  ),
};

// `pre` con botón "copiar este bloque" (T15). Se usa solo con `conCopiar`.
const preConCopiar: Components["pre"] = ({ children, node }) => {
  const codigo = extraerTextoCodigo(node);
  return (
    <pre className="group relative my-1.5 overflow-x-auto rounded bg-black/40 p-2">
      {codigo && <BotonCopiarBloque texto={codigo} />}
      {children}
    </pre>
  );
};

// `memo` + `useMemo`: react-markdown (remark parse, rehype-raw, sanitize, katex)
// es lo caro del render de un globo/panel. Con `data.rev` estable (mover el globo,
// re-render por zoom, etc.) el string `children` no cambia → no se re-parsea (B8:
// arrastrar un globo iba a ~5 fps porque re-parseaba TODA la transcripción del
// tramo por frame).
function Markdown({
  children,
  conCopiar = false,
}: {
  children: string;
  // Botón "copiar" en cada bloque de código (T15). Lo activa el panel, no el globo.
  conCopiar?: boolean;
}) {
  const texto = useMemo(
    () => normalizarMath(sanitizarCrudo(children)),
    [children],
  );
  const comps = useMemo(
    () => (conCopiar ? { ...components, pre: preConCopiar } : components),
    [conCopiar],
  );
  return (
    <div className="katex-compacto break-words text-left [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <LimiteError
        resetKey={texto}
        fallback={
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-white/70">
            {texto}
          </pre>
        }
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeRaw, [rehypeSanitize, schema], rehypeKatex]}
          components={comps}
        >
          {texto}
        </ReactMarkdown>
      </LimiteError>
    </div>
  );
}

export default memo(Markdown);
