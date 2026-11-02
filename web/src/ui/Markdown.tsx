import { useMemo, type ReactNode } from 'react';
import {
  parseMarkdown,
  type Block,
  type Inline,
} from '../features/markdown/markdown';

/** Only web and mail links open; anything else stays plain text. */
const openable = (href: string) => /^(https?:|mailto:)/i.test(href);

const HEADING_CLASSES = [
  'text-xl font-bold',
  'text-lg font-bold',
  'text-base font-bold',
  'text-base font-semibold',
  'text-sm font-semibold',
  'text-sm font-semibold',
];

/** Renders Markdown (see `features/markdown/markdown.ts` for the syntax). */
export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <Blocks blocks={blocks} />;
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-3 leading-relaxed">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'heading': {
      const Tag = `h${Math.min(block.level + 2, 6)}` as 'h3';
      return (
        <Tag className={HEADING_CLASSES[block.level - 1]}>
          <Inlines nodes={block.children} />
        </Tag>
      );
    }
    case 'paragraph':
      return (
        <p className="break-words">
          <Inlines nodes={block.children} />
        </p>
      );
    case 'list': {
      const items = block.items.map((item, i) => (
        <li key={i} className="pl-1">
          <Blocks blocks={item} />
        </li>
      ));
      return block.ordered ? (
        <ol start={block.start} className="list-decimal space-y-1 pl-6">
          {items}
        </ol>
      ) : (
        <ul className="list-disc space-y-1 pl-6">{items}</ul>
      );
    }
    case 'quote':
      return (
        <blockquote className="border-l-4 border-primary/40 pl-3 text-muted">
          <Blocks blocks={block.children} />
        </blockquote>
      );
    case 'code':
      return (
        <pre className="overflow-x-auto rounded-xl bg-surface-2 p-3 font-mono text-sm">
          {block.text}
        </pre>
      );
    case 'rule':
      return <hr className="border-line" />;
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                {block.header.map((cell, i) => (
                  <th
                    key={i}
                    style={{ textAlign: block.align[i] ?? 'left' }}
                    className="border border-line bg-surface-2 px-3 py-1.5 font-semibold"
                  >
                    <Inlines nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) => (
                    <td
                      key={i}
                      style={{ textAlign: block.align[i] ?? 'left' }}
                      className="border border-line px-3 py-1.5 align-top"
                    >
                      <Inlines nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function Inlines({ nodes }: { nodes: Inline[] }): ReactNode {
  return nodes.map((node, i) => <InlineView key={i} node={node} />);
}

function InlineView({ node }: { node: Inline }) {
  switch (node.type) {
    case 'text':
      return <>{node.text}</>;
    case 'break':
      return <br />;
    case 'strong':
      return (
        <strong className="font-semibold">
          <Inlines nodes={node.children} />
        </strong>
      );
    case 'em':
      return (
        <em>
          <Inlines nodes={node.children} />
        </em>
      );
    case 'strike':
      return (
        <s>
          <Inlines nodes={node.children} />
        </s>
      );
    case 'code':
      return (
        <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.9em]">
          {node.text}
        </code>
      );
    case 'link':
      return openable(node.href) ? (
        <a
          href={node.href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary underline underline-offset-2"
        >
          <Inlines nodes={node.children} />
        </a>
      ) : (
        <Inlines nodes={node.children} />
      );
  }
}
