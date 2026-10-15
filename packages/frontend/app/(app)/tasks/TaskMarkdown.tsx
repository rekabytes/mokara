import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const plugins = [remarkGfm];
const components: Components = {
  // The drawer title already owns h2; task content starts below it.
  h1: "h3",
  h2: "h4",
  h3: "h5",
  h4: "h6",
  a: ({ href, children, title }) =>
    href ? (
      <a href={href} title={title} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  table: ({ children }) => (
    <div className="task-markdown-table" role="region" aria-label="Markdown table" tabIndex={0}>
      <table>{children}</table>
    </div>
  ),
  // Keep attachment previews in the authenticated attachment UI. Markdown must
  // never load a tracking image or fetch a URL supplied by another user/agent.
  img: ({ alt }) => <span className="task-markdown-image">{alt || "Image attachment"}</span>,
};

/** Render untrusted task text as React nodes, never executable HTML. */
export function TaskMarkdown({ children }: { children: string }) {
  return (
    <div className="task-markdown">
      <ReactMarkdown remarkPlugins={plugins} components={components} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}
