import React, { useMemo } from 'react';
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import {
  inlineText,
  parseMarkdown,
  type Align,
  type Block,
  type Inline,
} from '../features/markdown/markdown';
import type { AppColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeProvider';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });
const HEADING_SIZES = [22, 19, 17, 16, 15, 15];
/** Table column width from its longest cell, within these bounds. */
const MIN_COLUMN = 64;
const MAX_COLUMN = 220;
const CHAR_WIDTH = 8;

/** Only web and mail links open; anything else stays plain text. */
const openable = (href: string) => /^(https?:|mailto:)/i.test(href);

/** Renders Markdown (see `features/markdown/markdown.ts` for the syntax). */
export function Markdown({ text }: { text: string }) {
  const { colors } = useAppTheme();
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <Blocks blocks={blocks} colors={colors} />;
}

function Blocks({ blocks, colors }: { blocks: Block[]; colors: AppColors }) {
  return (
    <View style={styles.blocks}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} colors={colors} />
      ))}
    </View>
  );
}

function BlockView({ block, colors }: { block: Block; colors: AppColors }) {
  const body = [styles.body, { color: colors.text }];
  switch (block.type) {
    case 'heading':
      return (
        <Text
          accessibilityRole="header"
          style={[
            styles.heading,
            { color: colors.text, fontSize: HEADING_SIZES[block.level - 1] },
          ]}
        >
          <Inlines nodes={block.children} colors={colors} />
        </Text>
      );
    case 'paragraph':
      return (
        <Text style={body}>
          <Inlines nodes={block.children} colors={colors} />
        </Text>
      );
    case 'list':
      return (
        <View style={styles.list}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.listItem}>
              <Text style={[body, styles.marker]}>
                {block.ordered ? `${block.start + i}.` : '•'}
              </Text>
              <View style={styles.listContent}>
                <Blocks blocks={item} colors={colors} />
              </View>
            </View>
          ))}
        </View>
      );
    case 'quote':
      return (
        <View style={[styles.quote, { borderLeftColor: colors.primary }]}>
          <Blocks blocks={block.children} colors={colors} />
        </View>
      );
    case 'code':
      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.codeBlock, { backgroundColor: colors.background }]}
        >
          <Text style={[styles.code, { color: colors.text }]}>
            {block.text}
          </Text>
        </ScrollView>
      );
    case 'rule':
      return <View style={[styles.rule, { backgroundColor: colors.border }]} />;
    case 'table':
      return <Table block={block} colors={colors} />;
  }
}

function Table({
  block,
  colors,
}: {
  block: Extract<Block, { type: 'table' }>;
  colors: AppColors;
}) {
  const widths = block.header.map((cell, c) => {
    const longest = Math.max(
      inlineText(cell).length,
      ...block.rows.map(row => inlineText(row[c]).length),
    );
    return Math.min(
      MAX_COLUMN,
      Math.max(MIN_COLUMN, longest * CHAR_WIDTH + 16),
    );
  });
  const renderRow = (cells: Inline[][], header: boolean, key: number) => (
    <View
      key={key}
      style={[
        styles.tableRow,
        { borderColor: colors.border },
        header ? { backgroundColor: colors.background } : styles.rowDivider,
      ]}
    >
      {cells.map((cell, c) => (
        <Text
          key={c}
          style={[
            styles.cell,
            {
              width: widths[c],
              color: colors.text,
              borderColor: colors.border,
            },
            c > 0 && styles.cellDivider,
            header && styles.headerCell,
            alignStyle(block.align[c]),
          ]}
        >
          <Inlines nodes={cell} colors={colors} />
        </Text>
      ))}
    </View>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View
        style={[
          styles.table,
          { borderColor: colors.border, backgroundColor: colors.surface },
        ]}
      >
        {renderRow(block.header, true, -1)}
        {block.rows.map((row, r) => renderRow(row, false, r))}
      </View>
    </ScrollView>
  );
}

const alignStyle = (align: Align): TextStyle | undefined =>
  align ? { textAlign: align } : undefined;

function Inlines({ nodes, colors }: { nodes: Inline[]; colors: AppColors }) {
  return (
    <>
      {nodes.map((node, i) => (
        <InlineView key={i} node={node} colors={colors} />
      ))}
    </>
  );
}

function InlineView({ node, colors }: { node: Inline; colors: AppColors }) {
  switch (node.type) {
    case 'text':
      return node.text;
    case 'break':
      return '\n';
    case 'strong':
      return (
        <Text style={styles.strong}>
          <Inlines nodes={node.children} colors={colors} />
        </Text>
      );
    case 'em':
      return (
        <Text style={styles.em}>
          <Inlines nodes={node.children} colors={colors} />
        </Text>
      );
    case 'strike':
      return (
        <Text style={styles.strike}>
          <Inlines nodes={node.children} colors={colors} />
        </Text>
      );
    case 'code':
      return (
        <Text
          style={[styles.inlineCode, { backgroundColor: colors.background }]}
        >
          {node.text}
        </Text>
      );
    case 'link':
      return openable(node.href) ? (
        <Text
          accessibilityRole="link"
          onPress={() => Linking.openURL(node.href).catch(() => {})}
          style={[styles.link, { color: colors.primary }]}
        >
          <Inlines nodes={node.children} colors={colors} />
        </Text>
      ) : (
        <Inlines nodes={node.children} colors={colors} />
      );
  }
}

const styles = StyleSheet.create({
  blocks: { gap: 8 },
  body: { fontSize: 15, lineHeight: 21 },
  heading: { fontWeight: '700' },
  list: { gap: 4 },
  listItem: { flexDirection: 'row', gap: 6 },
  marker: { minWidth: 14 },
  listContent: { flex: 1 },
  quote: { borderLeftWidth: 3, paddingLeft: 10 },
  codeBlock: { borderRadius: 8, padding: 10 },
  code: { fontFamily: MONO, fontSize: 13, lineHeight: 18 },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tableRow: { flexDirection: 'row' },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  cell: { fontSize: 14, paddingHorizontal: 8, paddingVertical: 6 },
  cellDivider: { borderLeftWidth: StyleSheet.hairlineWidth },
  headerCell: { fontWeight: '600' },
  strong: { fontWeight: '700' },
  em: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through' },
  inlineCode: { fontFamily: MONO, fontSize: 13 },
  link: { textDecorationLine: 'underline' },
});
