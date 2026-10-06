// Markdown from the guide: replies (lists, bold) and documents (tables, checklists).
// Documents keep their line breaks, so checklist fields don't run together. Inline is for
// a single line such as the big question (no paragraph spacing).
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

export default function Md({ children, doc = false, inline = false }: { children: string; doc?: boolean; inline?: boolean }) {
  return (
    <Markdown remarkPlugins={doc ? [remarkGfm, remarkBreaks] : [remarkGfm]}
      components={{ img: ({ alt }) => <>{alt ?? ''}</>, ...(inline ? { p: ({ children: c }) => <>{c}</> } : {}) }}>
      {children}
    </Markdown>
  );
}
