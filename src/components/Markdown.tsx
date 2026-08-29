import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Render de markdown para las respuestas de la IA. Compacto (los globos son
// angostos, ~260px) y en tema oscuro. react-markdown NO renderiza HTML crudo →
// seguro por defecto ante lo que devuelva el modelo.

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
    <td className="border border-white/15 px-1.5 py-0.5">{children}</td>
  ),
};

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="break-words text-left [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
