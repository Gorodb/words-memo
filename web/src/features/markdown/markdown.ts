/**
 * A small Markdown parser for word descriptions and rules. Pure, so it can
 * be unit tested; `components/Markdown.tsx` renders the result.
 *
 * Blocks: headings (#), paragraphs, bullet and numbered lists (nested by
 * indentation), quotes (>), fenced code (```), horizontal rules (---) and
 * pipe tables. Inline: **bold**, *italic*, ~~strike~~, `code`, [links](url)
 * and backslash escapes. A single line break is kept as a line break, which
 * is what people expect when they type notes on a phone.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'strike'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'break' };

export type Align = 'left' | 'center' | 'right' | null;

export type Block =
  | { type: 'heading'; level: number; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: Block[][] }
  | { type: 'quote'; children: Block[] }
  | { type: 'code'; text: string }
  | { type: 'rule' }
  | {
      type: 'table';
      align: Align[];
      header: Inline[][];
      rows: Inline[][][];
    };

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}> ?/;
const LIST_ITEM = /^( *)([-*+]|(\d{1,9})[.)])(?:[ \t]+(.*))?$/;
const TABLE_DELIMITER = /^ *\|? *:?-+:? *(?:\| *:?-+:? *)*\|? *$/;

export function parseMarkdown(source: string): Block[] {
  return parseBlocks(source.replace(/\r\n?/g, '\n').split('\n'));
}

const isBlank = (line: string) => line.trim() === '';

function isTableStart(lines: string[], i: number): boolean {
  return (
    lines[i].includes('|') &&
    i + 1 < lines.length &&
    lines[i + 1].includes('-') &&
    TABLE_DELIMITER.test(lines[i + 1]) &&
    splitRow(lines[i]).length === splitRow(lines[i + 1]).length
  );
}

/** Lines that end a paragraph because they start another block. */
function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i];
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    LIST_ITEM.test(line) ||
    isTableStart(lines, i)
  );
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1];
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) {
        code.push(lines[i]);
        i++;
      }
      i++; // closing fence (or the end)
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        children: parseInline(heading[2] ?? ''),
      });
      i++;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: 'rule' });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && !isBlank(lines[i])) {
        // Lines without ">" continue the quote (lazy continuation).
        quoted.push(lines[i].replace(QUOTE, ''));
        i++;
      }
      blocks.push({ type: 'quote', children: parseBlocks(quoted) });
      continue;
    }

    if (LIST_ITEM.test(line)) {
      i = parseList(lines, i, blocks);
      continue;
    }

    if (isTableStart(lines, i)) {
      i = parseTable(lines, i, blocks);
      continue;
    }

    const text: string[] = [line.trim()];
    i++;
    while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines, i)) {
      text.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: 'paragraph', children: parseInline(text.join('\n')) });
  }
  return blocks;
}

/** Parses the list starting at line `start`; returns the next line index. */
function parseList(lines: string[], start: number, blocks: Block[]): number {
  const first = LIST_ITEM.exec(lines[start])!;
  const indent = first[1].length;
  const ordered = first[3] !== undefined;
  const items: string[][] = [];
  let current: string[] = [];
  /** Indentation that makes a line belong to the current item. */
  let contentIndent = 0;
  let i = start;
  let afterBlank = false;

  while (i < lines.length) {
    const line = lines[i];
    const item = LIST_ITEM.exec(line);
    const lineIndent = line.length - line.trimStart().length;

    if (
      item &&
      item[1].length <= indent + 1 &&
      (item[3] !== undefined) === ordered
    ) {
      current = [item[4] ?? ''];
      items.push(current);
      contentIndent = item[1].length + item[2].length + 1;
      afterBlank = false;
      i++;
      continue;
    }
    if (isBlank(line)) {
      // A blank line ends the list unless an indented line or another item follows.
      const next = lines.slice(i + 1).find(l => !isBlank(l));
      if (next === undefined) {
        break;
      }
      const nextItem = LIST_ITEM.exec(next);
      const nextIndent = next.length - next.trimStart().length;
      if (
        nextIndent > indent ||
        (nextItem &&
          nextItem[1].length <= indent + 1 &&
          (nextItem[3] !== undefined) === ordered)
      ) {
        current.push('');
        afterBlank = true;
        i++;
        continue;
      }
      break;
    }
    if (lineIndent > indent) {
      current.push(line.slice(Math.min(lineIndent, contentIndent)));
      i++;
      continue;
    }
    // Unindented text right after an item's text continues it.
    if (!afterBlank && !startsBlock(lines, i)) {
      current.push(line.trim());
      i++;
      continue;
    }
    break;
  }

  blocks.push({
    type: 'list',
    ordered,
    start: ordered ? Number(first[3]) : 1,
    items: items.map(parseBlocks),
  });
  return i;
}

function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith('|')) {
    row = row.slice(1);
  }
  if (row.endsWith('|') && !row.endsWith('\\|')) {
    row = row.slice(0, -1);
  }
  const cells: string[] = [];
  let cell = '';
  for (let i = 0; i < row.length; i++) {
    if (row[i] === '\\' && row[i + 1] === '|') {
      cell += '|';
      i++;
    } else if (row[i] === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += row[i];
    }
  }
  cells.push(cell.trim());
  return cells;
}

function parseTable(lines: string[], start: number, blocks: Block[]): number {
  const header = splitRow(lines[start]);
  const align = splitRow(lines[start + 1]).map((cell): Align => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    return left && right ? 'center' : right ? 'right' : left ? 'left' : null;
  });
  const rows: Inline[][][] = [];
  let i = start + 2;
  while (i < lines.length && !isBlank(lines[i]) && lines[i].includes('|')) {
    const cells = splitRow(lines[i]);
    rows.push(header.map((_, c) => parseInline(cells[c] ?? '')));
    i++;
  }
  blocks.push({
    type: 'table',
    align,
    header: header.map(cell => parseInline(cell)),
    rows,
  });
  return i;
}

const ESCAPABLE = '\\`*_~[]()#+-.!|>';
const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);
const isWordChar = (c: string | undefined) =>
  c !== undefined && /[\p{L}\p{N}]/u.test(c);

/**
 * Index of the closing `delim` for an opening one that ends at `from`, or -1.
 * The closer must follow a non-space character; when it's part of a longer
 * run of the same character, the last `delim.length` characters close it,
 * so `***both***` is bold around italic.
 */
function findCloser(text: string, delim: string, from: number): number {
  const char = delim[0];
  let i = text.indexOf(delim, from);
  while (i !== -1) {
    let end = i;
    while (text[end] === char) {
      end++;
    }
    const at = end - delim.length;
    const valid =
      at > from &&
      !isSpace(text[at - 1]) &&
      // "_" only closes at a word end, so snake_case stays text.
      (char !== '_' || !isWordChar(text[end]));
    if (valid) {
      return at;
    }
    i = text.indexOf(delim, end);
  }
  return -1;
}

export function parseInline(text: string): Inline[] {
  const nodes: Inline[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer) {
      nodes.push({ type: 'text', text: buffer });
      buffer = '';
    }
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i];

    if (c === '\\' && i + 1 < text.length && ESCAPABLE.includes(text[i + 1])) {
      buffer += text[i + 1];
      i += 2;
      continue;
    }

    if (c === '\n') {
      flush();
      nodes.push({ type: 'break' });
      i++;
      continue;
    }

    if (c === '`') {
      let ticks = 1;
      while (text[i + ticks] === '`') {
        ticks++;
      }
      const fence = '`'.repeat(ticks);
      const close = text.indexOf(fence, i + ticks);
      if (close !== -1) {
        flush();
        nodes.push({ type: 'code', text: text.slice(i + ticks, close).trim() });
        i = close + ticks;
        continue;
      }
      buffer += fence;
      i += ticks;
      continue;
    }

    if (c === '[') {
      const link = /^\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/.exec(
        text.slice(i),
      );
      if (link) {
        flush();
        nodes.push({
          type: 'link',
          href: link[2],
          children: parseInline(link[1]),
        });
        i += link[0].length;
        continue;
      }
    }

    if (c === '*' || c === '_' || c === '~') {
      const double = text[i + 1] === c;
      const delim = double ? c + c : c;
      const opensAfter = i + delim.length;
      const canOpen =
        !isSpace(text[opensAfter]) &&
        (c !== '_' || !isWordChar(text[i - 1])) &&
        (c !== '~' || double);
      if (canOpen) {
        const close = findCloser(text, delim, opensAfter);
        if (close !== -1) {
          flush();
          const children = parseInline(text.slice(opensAfter, close));
          nodes.push(
            c === '~'
              ? { type: 'strike', children }
              : { type: double ? 'strong' : 'em', children },
          );
          i = close + delim.length;
          continue;
        }
      }
      buffer += delim;
      i += delim.length;
      continue;
    }

    buffer += c;
    i++;
  }
  flush();
  return nodes;
}

/** Plain text of inline nodes (accessibility labels, previews). */
export function inlineText(nodes: Inline[]): string {
  return nodes
    .map(node =>
      node.type === 'text' || node.type === 'code'
        ? node.text
        : node.type === 'break'
        ? '\n'
        : inlineText(node.children),
    )
    .join('');
}

function blockText(block: Block): string {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
      return inlineText(block.children);
    case 'list':
      return block.items[0]?.[0] ? blockText(block.items[0][0]) : '';
    case 'quote':
      return block.children[0] ? blockText(block.children[0]) : '';
    case 'code':
      return block.text;
    case 'table':
      return block.header.map(inlineText).join(' · ');
    case 'rule':
      return '';
  }
}

/** First line of the text without Markdown syntax (a title fallback). */
export function firstLine(markdown: string): string {
  for (const block of parseMarkdown(markdown)) {
    const line = blockText(block).split('\n')[0].trim();
    if (line) {
      return line;
    }
  }
  return '';
}
