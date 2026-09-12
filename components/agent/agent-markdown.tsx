'use client'

import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic text-foreground/90">{children}</em>,
  ul: ({ children }) => <ul className="my-2 ml-4 list-disc space-y-1.5 marker:text-muted-foreground">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 ml-4 list-decimal space-y-1.5 marker:text-muted-foreground">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5 [&>p]:mb-0">{children}</li>,
  h1: ({ children }) => <h1 className="mt-2 mb-1.5 text-[17px] font-semibold text-foreground">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-2 mb-1.5 text-[16px] font-semibold text-foreground">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-2 mb-1 text-[15px] font-semibold text-foreground">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-accent/40 bg-white/[0.03] px-3 py-1.5 text-foreground/85">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-white/10" />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2 hover:text-accent/80">
      {children}
    </a>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg border border-white/10 bg-black/45 px-3 py-2 text-[13px] leading-relaxed font-mono text-foreground/90">
      {children}
    </pre>
  ),
  code: ({ className, children }) => {
    const block = Boolean(className)
    if (block) return <code className={className}>{children}</code>
    return (
      <code className="rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 text-[13px] font-mono text-foreground">
        {children}
      </code>
    )
  },
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full border-collapse text-left text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-white/[0.04]">{children}</thead>,
  th: ({ children }) => <th className="border-b border-white/10 px-2 py-1.5 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-t border-white/[0.06] px-2 py-1.5 align-top">{children}</td>,
}

export function AgentMarkdown({ text }: { text: string }) {
  return (
    <div className="agent-md break-words text-[15px] leading-relaxed">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </Markdown>
    </div>
  )
}
