import {
  findSimilar,
  similarWarning,
  wordKey,
  type KnownWord,
} from '../src/features/similarWords/similarWords';

const words: KnownWord[] = [
  { id: '1', term: 'der Apfel, die Äpfel', setName: 'Food' },
  { id: '2', term: 'essen, isst, aß, hat gegessen', setName: 'Verbs' },
  { id: '3', term: 'went', setName: 'Irregular' },
];

/** Stand-in for the dictionary: essen = entry 10, go = entry 20. */
const ENTRIES: Record<string, number[]> = {
  essen: [10, 11],
  isst: [10],
  gegessen: [10],
  go: [20],
  went: [20],
};
const entryIds = (key: string) => ENTRIES[key] ?? [];
const noDictionary = () => [];

test('word key: main form without articles or "to", lowercase', () => {
  expect(wordKey('der Apfel, die Äpfel')).toBe('apfel');
  expect(wordKey('  Apfel ')).toBe('apfel');
  expect(wordKey('to go')).toBe('go');
  expect(wordKey('das Essen')).toBe('essen');
  expect(wordKey('  ')).toBe('');
});

test('same word ignores case, articles and other forms in the term', () => {
  expect(findSimilar('apfel', words, noDictionary)).toEqual([
    { ...words[0], same: true },
  ]);
  expect(findSimilar('das Essen', words, noDictionary)).toEqual([
    { ...words[1], same: true },
  ]);
  expect(findSimilar('Birne', words, noDictionary)).toEqual([]);
  expect(findSimilar('', words, noDictionary)).toEqual([]);
});

test('another form of the same dictionary entry, both ways', () => {
  expect(findSimilar('isst', words, entryIds)).toEqual([
    { ...words[1], same: false },
  ]);
  expect(findSimilar('go', words, entryIds)).toEqual([
    { ...words[2], same: false },
  ]);
  expect(findSimilar('isst', words, noDictionary)).toEqual([]);
});

test('the edited word is left out', () => {
  expect(findSimilar('Apfel', words, entryIds, '1')).toEqual([]);
});

test('warning text', () => {
  expect(similarWarning([])).toBeNull();
  expect(similarWarning(findSimilar('apfel', words, entryIds))).toBe(
    'Already added: “der Apfel, die Äpfel” in “Food”',
  );
  const twice = [...words, { id: '4', term: 'essen', setName: 'Food' }];
  expect(similarWarning(findSimilar('gegessen', twice, entryIds))).toBe(
    'Similar word added: “essen, isst, aß, hat gegessen” in “Verbs” (+1 more)',
  );
});
