// Markdown from the guide: replies (lists, bold) and documents (tables, checklists).
// Documents keep their line breaks, so checklist fields don't run together. Inline is for
// a single line such as the big question (no paragraph spacing).
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

export default function Md({ children, doc = false, inline = false }: { children: string; doc?: boolean; inline?: boolean }) {
  return (
    <Markdown remarkPlugins={doc ? [remarkGfm, remarkBreaks] : [remarkGfm]}
      // No pictures from outside, and no links out to websites (safety review 2): just their words.
      components={{ img: ({ alt }) => <>{alt ?? ''}</>, a: ({ children: c }) => <>{c}</>, ...(inline ? { p: ({ children: c }) => <>{c}</> } : {}) }}>
      {children}
    </Markdown>
  );
}
