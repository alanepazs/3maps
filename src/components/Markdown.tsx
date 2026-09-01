import { Component, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

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

// Los modelos usan varios delimitadores para la matemática. remark-math solo
// entiende `$`/`$$`; normalizamos `\[ \]` → `$$` y `\( \)` → `$` antes de parsear.
function normalizarMath(texto: string): string {
  return texto
    .replace(/\\\[\s*([\s\S]+?)\s*\\\]/g, (_, m) => `\n\n$$\n${m}\n$$\n\n`)
    .replace(/\\\(\s*([\s\S]+?)\s*\\\)/g, (_, m) => `$${m}$`);
}

// Tokens especiales que largan algunos modelos (padding, BOS/EOS, plantillas de
// chat). Nunca son contenido, y `rehype-raw` los toma como tags HTML SIN CERRAR:
// unos miles de `<PAD>` seguidos = unos miles de niveles de anidado = `RangeError:
// Maximum call stack size exceeded` al parsear (crashea el render). Visto con un
// modelo de HuggingFace. Ver decisiones F3-14.
const TOKENS_BASURA =
  /<\/?(?:pad|unk|mask|cls|sep|s|bos|eos|eot_id|end_of_turn|start_of_turn|begin_of_text|end_of_text|\|[^>]*\|)>/gi;

function sanitizarCrudo(texto: string): string {
  const limpio = texto.replace(TOKENS_BASURA, "");
  // Backstop: si aún quedan cientos de aperturas de tag, es basura de token
  // (`<foo><foo>…`). Escapamos TODO `<` → el texto se ve crudo pero no crashea.
  // Una tabla grande con `<br>` ronda las 50; 120 deja margen de sobra.
  const aperturas = (limpio.match(/<[a-z!/]/gi) ?? []).length;
  return aperturas > 120 ? limpio.replace(/</g, "&lt;") : limpio;
}

// Si el pipeline de markdown igual tira (input que no previmos), mostramos el
// texto crudo en vez de tumbar todo el canvas.
class LimiteMarkdown extends Component<
  { crudo: string; children: ReactNode },
  { rota: boolean }
> {
  state = { rota: false };
  static getDerivedStateFromError() {
    return { rota: true };
  }
  componentDidUpdate(prev: { crudo: string }) {
    if (prev.crudo !== this.props.crudo && this.state.rota) {
      this.setState({ rota: false });
    }
  }
  render() {
    if (this.state.rota) {
      return (
        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-white/70">
          {this.props.crudo}
        </pre>
      );
    }
    return this.props.children;
  }
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

export default function Markdown({ children }: { children: string }) {
  const texto = normalizarMath(sanitizarCrudo(children));
  return (
    <div className="katex-compacto break-words text-left [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <LimiteMarkdown crudo={texto}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeRaw, [rehypeSanitize, schema], rehypeKatex]}
          components={components}
        >
          {texto}
        </ReactMarkdown>
      </LimiteMarkdown>
    </div>
  );
}
