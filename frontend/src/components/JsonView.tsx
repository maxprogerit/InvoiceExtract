import { tokenizeJson, type JsonTokenKind } from '../lib/json'

const COLOR: Record<JsonTokenKind, string> = {
  key: 'text-accent-text',
  string: 'text-fg',
  number: 'text-warn',
  literal: 'text-muted',
  plain: 'text-muted',
}

/** Read-only, syntax-coloured JSON. Built from tokens (never innerHTML), so content cannot inject markup. */
export function JsonView({ text }: { text: string }) {
  return (
    // tabIndex so keyboard users can scroll long documents
    <pre
      tabIndex={0}
      aria-label="Extracted data as JSON"
      className="max-h-[32rem] overflow-auto rounded-xl bg-bg p-4 font-mono text-[0.8rem] leading-relaxed"
    >
      <code>
        {tokenizeJson(text).map((token, i) => (
          <span key={i} className={COLOR[token.kind]}>
            {token.text}
          </span>
        ))}
      </code>
    </pre>
  )
}
