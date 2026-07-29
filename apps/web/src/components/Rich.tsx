import { Fragment, type ReactElement } from 'react';

/**
 * Render the tiny markup the parser emits in insight bodies: **bold** and
 * *italic*. Deliberately not HTML, so the parser stays renderer-agnostic and
 * nothing it produces can inject markup.
 */
export function Rich({ text }: { text: string }): ReactElement {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) return <b key={i}>{part.slice(2, -2)}</b>;
        if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
