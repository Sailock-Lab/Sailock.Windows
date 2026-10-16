// src/components/MarkdownView.tsx
// Muestra texto markdown con formato. Seguro por diseño: no interpreta HTML en bruto, no carga
// imágenes remotas y los enlaces solo se abren (http/https) tras la confirmación de la app.
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeUrl, useOpenUrl } from "@/components/EntryFields";

type WithChildren = { children?: ReactNode };

export function MarkdownView({ source }: { source: string }) {
  const { requestOpen, dialog } = useOpenUrl();

  return (
    <div className="break-words text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }: WithChildren) => <h1 className="mb-3 mt-5 text-2xl font-bold first:mt-0">{children}</h1>,
          h2: ({ children }: WithChildren) => <h2 className="mb-2 mt-5 text-xl font-bold first:mt-0">{children}</h2>,
          h3: ({ children }: WithChildren) => <h3 className="mb-2 mt-4 text-lg font-semibold first:mt-0">{children}</h3>,
          h4: ({ children }: WithChildren) => <h4 className="mb-1 mt-3 text-base font-semibold first:mt-0">{children}</h4>,
          h5: ({ children }: WithChildren) => <h5 className="mb-1 mt-3 text-sm font-semibold first:mt-0">{children}</h5>,
          h6: ({ children }: WithChildren) => <h6 className="mb-1 mt-3 text-sm font-semibold text-muted-foreground first:mt-0">{children}</h6>,
          p: ({ children }: WithChildren) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          strong: ({ children }: WithChildren) => <strong className="font-bold">{children}</strong>,
          em: ({ children }: WithChildren) => <em className="italic">{children}</em>,
          del: ({ children }: WithChildren) => <del className="line-through opacity-80">{children}</del>,
          ul: ({ children }: WithChildren) => <ul className="my-2 list-disc space-y-1 pl-6">{children}</ul>,
          ol: ({ children }: WithChildren) => <ol className="my-2 list-decimal space-y-1 pl-6">{children}</ol>,
          li: ({ children }: WithChildren) => <li className="[&>input]:mr-2 [&>input]:align-middle">{children}</li>,
          blockquote: ({ children }: WithChildren) => (
            <blockquote className="my-3 border-l-4 pl-4 italic text-muted-foreground">{children}</blockquote>
          ),
          hr: () => <hr className="my-4" />,
          pre: ({ children }: WithChildren) => (
            <pre className="my-3 overflow-x-auto rounded-md border bg-muted p-3 font-mono text-xs [&_code]:bg-transparent [&_code]:p-0">
              {children}
            </pre>
          ),
          code: ({ children }: WithChildren) => (
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
          ),
          table: ({ children }: WithChildren) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }: WithChildren) => <th className="border bg-muted px-2 py-1 text-left font-semibold">{children}</th>,
          td: ({ children }: WithChildren) => <td className="border px-2 py-1">{children}</td>,
          // Sin imágenes remotas: se muestra el texto alternativo.
          img: ({ alt }: { alt?: string }) => <span className="text-muted-foreground">[{alt || "image"}]</span>,
          a: ({ href, children }: { href?: string; children?: ReactNode }) => {
            // Solo enlaces http(s); cualquier otro se muestra como texto.
            if (!href || !/^https?:\/\//i.test(href) || !normalizeUrl(href)) return <span>{children}</span>;
            return (
              <a
                href={href}
                className="text-primary underline underline-offset-2"
                onClick={(e) => {
                  e.preventDefault();
                  requestOpen(href);
                }}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
      {dialog}
    </div>
  );
}