import { ruleTitle } from '../src/domain/rules';
import {
  firstLine,
  inlineText,
  parseInline,
  parseMarkdown,
} from '../src/features/markdown/markdown';

const text = (t: string) => ({ type: 'text', text: t });

describe('parseInline', () => {
  test('bold, italic, strike, code and links', () => {
    expect(parseInline('a **b** *c* ~~d~~ `e*f` [g](https://x.y)')).toEqual([
      text('a '),
      { type: 'strong', children: [text('b')] },
      text(' '),
      { type: 'em', children: [text('c')] },
      text(' '),
      { type: 'strike', children: [text('d')] },
      text(' '),
      { type: 'code', text: 'e*f' },
      text(' '),
      { type: 'link', href: 'https://x.y', children: [text('g')] },
    ]);
  });

  test('nesting and ***both***', () => {
    expect(parseInline('***x***')).toEqual([
      { type: 'strong', children: [{ type: 'em', children: [text('x')] }] },
    ]);
    expect(parseInline('**a _b_**')).toEqual([
      {
        type: 'strong',
        children: [text('a '), { type: 'em', children: [text('b')] }],
      },
    ]);
  });

  test('stray markers, spaced stars, snake_case and escapes stay text', () => {
    expect(parseInline('2 * 3 * 4')).toEqual([text('2 * 3 * 4')]);
    expect(parseInline('snake_case_name')).toEqual([text('snake_case_name')]);
    expect(parseInline('**open')).toEqual([text('**open')]);
    expect(parseInline('\\*not\\*')).toEqual([text('*not*')]);
    expect(parseInline('~one~')).toEqual([text('~one~')]);
  });

  test('line breaks are kept', () => {
    expect(parseInline('a\nb')).toEqual([
      text('a'),
      { type: 'break' },
      text('b'),
    ]);
  });

  test('inlineText flattens', () => {
    expect(inlineText(parseInline('**der** Hund\n`x`'))).toBe('der Hund\nx');
  });
});

describe('parseMarkdown', () => {
  test('headings, paragraphs, rules, quotes and code', () => {
    expect(
      parseMarkdown(
        '# Perfekt\n\nhaben + Partizip II\nsein bei Bewegung\n\n---\n> Note\n> more\n\n```\nich habe\n  gegessen\n```',
      ),
    ).toEqual([
      { type: 'heading', level: 1, children: [text('Perfekt')] },
      {
        type: 'paragraph',
        children: [
          text('haben + Partizip II'),
          { type: 'break' },
          text('sein bei Bewegung'),
        ],
      },
      { type: 'rule' },
      {
        type: 'quote',
        children: [
          {
            type: 'paragraph',
            children: [text('Note'), { type: 'break' }, text('more')],
          },
        ],
      },
      { type: 'code', text: 'ich habe\n  gegessen' },
    ]);
  });

  test('a list right after a paragraph line ends the paragraph', () => {
    const blocks = parseMarkdown('Forms:\n- isst\n- aß');
    expect(blocks.map(b => b.type)).toEqual(['paragraph', 'list']);
  });

  test('bullet and numbered lists, nested by indentation', () => {
    expect(parseMarkdown('- a\n  - b\n- c\n\n3. x\n4. y')).toEqual([
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          [
            { type: 'paragraph', children: [text('a')] },
            {
              type: 'list',
              ordered: false,
              start: 1,
              items: [[{ type: 'paragraph', children: [text('b')] }]],
            },
          ],
          [{ type: 'paragraph', children: [text('c')] }],
        ],
      },
      {
        type: 'list',
        ordered: true,
        start: 3,
        items: [
          [{ type: 'paragraph', children: [text('x')] }],
          [{ type: 'paragraph', children: [text('y')] }],
        ],
      },
    ]);
  });

  test('pipe tables with alignment', () => {
    expect(
      parseMarkdown(
        '| Person | essen |\n|:--|--:|\n| ich | esse |\n| du | isst',
      ),
    ).toEqual([
      {
        type: 'table',
        align: ['left', 'right'],
        header: [[text('Person')], [text('essen')]],
        rows: [
          [[text('ich')], [text('esse')]],
          [[text('du')], [text('isst')]],
        ],
      },
    ]);
  });

  test('Windows line breaks and blank input', () => {
    expect(parseMarkdown('a\r\nb')).toEqual([
      {
        type: 'paragraph',
        children: [text('a'), { type: 'break' }, text('b')],
      },
    ]);
    expect(parseMarkdown('  \n\n')).toEqual([]);
  });
});

describe('rule titles', () => {
  test('the title, or the first line without Markdown for older rules', () => {
    expect(ruleTitle({ title: 'Perfekt', text: '# Other' })).toBe('Perfekt');
    expect(
      ruleTitle({ title: '', text: '\n## **Perfekt** mit sein\nmore' }),
    ).toBe('Perfekt mit sein');
    expect(firstLine('- *first* item\n- second')).toBe('first item');
    expect(ruleTitle({ title: '', text: '---' })).toBe('Rule');
  });
});
