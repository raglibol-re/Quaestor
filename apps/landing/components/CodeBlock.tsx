import { CopyButton } from "./CopyButton";

// Presentational code block with a header bar (optional label) and a copy button.
// Used by every static command block and by the config wizard output.
export function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="codeblock">
      <div className="code-head">
        <span className="label">{label ?? ""}</span>
        <CopyButton text={code} />
      </div>
      <pre className="code">
        <code>{code}</code>
      </pre>
    </div>
  );
}
