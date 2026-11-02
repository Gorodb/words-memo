import { firstLine } from '../features/markdown/markdown';
import type { Rule } from './types';

/** The rule's title; rules made before titles existed use their first line. */
export function ruleTitle(rule: Pick<Rule, 'title' | 'text'>): string {
  return rule.title || firstLine(rule.text) || 'Rule';
}
