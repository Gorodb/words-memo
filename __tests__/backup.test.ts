import type { BackupFile, Language } from '../src/domain/types';
import {
  BackupFormatError,
  parseBackup,
  safeFileName,
} from '../src/features/backup/format';
import {
  describeSummary,
  planImport,
  type ExistingLanguage,
} from '../src/features/backup/merge';

const word = (term: string, translation = term, extra = {}) => ({
  term,
  translation,
  examples: [],
  learnedAt: null,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

const backup = (languages: BackupFile['languages']): BackupFile => ({
  app: 'wordsLearning',
  version: 1,
  kind: 'full',
  exportedAt: 1,
  languages,
});

const empty = (): ExistingLanguage => ({
  sets: [],
  folders: [],
  wordIdsByTerm: new Map(),
});

const known = (...codes: string[]): Language[] =>
  codes.map(code => ({ code, name: code, nativeName: code }));

function ids() {
  let n = 0;
  return () => `new${++n}`;
}

describe('parseBackup', () => {
  test('round-trips a valid file and tolerates legacy string examples', () => {
    const parsed = parseBackup(
      JSON.stringify({
        app: 'wordsLearning',
        version: 1,
        kind: 'sets',
        exportedAt: 5,
        languages: [
          {
            code: 'de',
            sets: [
              {
                name: ' Verben ',
                words: [
                  {
                    term: 'essen',
                    translation: 'есть',
                    examples: ['Wir essen.', { text: 'x', translation: 'y' }],
                  },
                ],
              },
            ],
          },
        ],
      }),
      100,
    );
    expect(parsed.kind).toBe('sets');
    const set = parsed.languages[0].sets[0];
    expect(set.name).toBe('Verben');
    expect(set.createdAt).toBe(100); // missing → now
    expect(set.words[0]).toEqual({
      term: 'essen',
      translation: 'есть',
      examples: [
        { text: 'Wir essen.', translation: '' },
        { text: 'x', translation: 'y' },
      ],
      learnedAt: null,
      createdAt: 100,
      updatedAt: 100,
    });
    expect(parsed.languages[0].folders).toEqual([]);
  });

  test('rejects other files with a readable message', () => {
    expect(() => parseBackup('nope')).toThrow(BackupFormatError);
    expect(() => parseBackup('{"app":"other"}')).toThrow('not a words backup');
    expect(() =>
      parseBackup('{"app":"wordsLearning","version":2,"languages":[]}'),
    ).toThrow('newer app version');
    expect(() =>
      parseBackup(
        JSON.stringify({
          app: 'wordsLearning',
          version: 1,
          languages: [
            { code: 'de', sets: [{ name: 'S', words: [{ term: ' ' }] }] },
          ],
        }),
      ),
    ).toThrow('empty word');
  });

  test('safe file names', () => {
    expect(safeFileName('Verbs: A1/A2 ')).toBe('Verbs-A1-A2');
    expect(safeFileName('???')).toBe('set');
  });
});

describe('planImport', () => {
  test('new words go to their set (created by name); existing sets are reused', () => {
    const plan = planImport(
      backup([
        {
          code: 'de',
          folders: [],
          sets: [
            {
              name: 'Food',
              createdAt: 1,
              updatedAt: 1,
              words: [word('Apfel')],
            },
            { name: 'New', createdAt: 1, updatedAt: 1, words: [word('Haus')] },
          ],
        },
      ]),
      () => ({ ...empty(), sets: [{ id: 'food', name: 'Food' }] }),
      known('de'),
      ids(),
    );
    expect(plan.createSets.map(s => s.name)).toEqual(['New']);
    expect(plan.insertWords.map(w => [w.term, w.setId])).toEqual([
      ['Apfel', 'food'],
      ['Haus', 'new2'], // ids: Apfel=new1, set New=new2,
    ]);
    expect(plan.summary).toMatchObject({
      wordsAdded: 2,
      wordsUpdated: 0,
      setsCreated: 1,
    });
  });

  test('a matching term updates every existing copy; matching is exact and case-sensitive', () => {
    const existing: ExistingLanguage = {
      sets: [{ id: 'a', name: 'A' }],
      folders: [],
      wordIdsByTerm: new Map([
        ['essen', ['w1', 'w2']],
        ['das Essen', ['w3']],
      ]),
    };
    const examples = [{ text: 'Wir essen.', translation: 'Мы едим.' }];
    const plan = planImport(
      backup([
        {
          code: 'de',
          folders: [],
          sets: [
            {
              name: 'A',
              createdAt: 1,
              updatedAt: 1,
              words: [
                word('  essen ', 'есть, кушать', { examples }),
                word('Essen', 'еда?'), // different case → new word
              ],
            },
          ],
        },
      ]),
      () => existing,
      known('de'),
      ids(),
    );
    expect(plan.updateWords).toEqual([
      { id: 'w1', translation: 'есть, кушать', examples },
      { id: 'w2', translation: 'есть, кушать', examples },
    ]);
    expect(plan.insertWords.map(w => w.term)).toEqual(['Essen']);
    expect(plan.summary).toMatchObject({ wordsAdded: 1, wordsUpdated: 2 });
  });

  test('folders are matched or created, and sets are added to them once', () => {
    const plan = planImport(
      backup([
        {
          code: 'en',
          folders: [
            {
              name: 'Travel',
              createdAt: 1,
              updatedAt: 1,
              setNames: ['Airport', 'Hotel'],
            },
            { name: 'Work', createdAt: 1, updatedAt: 1, setNames: ['Office'] },
          ],
          sets: [
            { name: 'Airport', createdAt: 1, updatedAt: 1, words: [] },
            { name: 'Hotel', createdAt: 1, updatedAt: 1, words: [] },
          ],
        },
      ]),
      () => ({
        ...empty(),
        sets: [{ id: 'airport', name: 'Airport' }],
        folders: [{ id: 'travel', name: 'Travel', setIds: ['airport'] }],
      }),
      known('en'),
      ids(),
    );
    expect(plan.createFolders.map(f => f.name)).toEqual(['Work']);
    // Hotel and Office are new sets; Airport is already in Travel.
    expect(plan.createSets.map(s => s.name)).toEqual(['Hotel', 'Office']);
    expect(plan.addToFolder).toEqual([
      { folderId: 'travel', setId: 'new1' },
      { folderId: 'new2', setId: 'new3' },
    ]);
  });

  test('unknown languages are skipped and reported', () => {
    const plan = planImport(
      backup([
        {
          code: 'fr',
          folders: [],
          sets: [
            { name: 'S', createdAt: 1, updatedAt: 1, words: [word('chat')] },
          ],
        },
      ]),
      empty,
      known('de', 'en'),
      ids(),
    );
    expect(plan.insertWords).toEqual([]);
    expect(plan.summary.skippedLanguages).toEqual(['fr']);
    expect(describeSummary(plan.summary)).toBe(
      "0 words added, 0 updated. Skipped languages this app doesn't have: fr.",
    );
  });
  test('a custom language is matched by code, then by name, or created', () => {
    const file = backup([
      {
        code: 'x-same',
        name: 'French',
        folders: [],
        sets: [
          { name: 'A', createdAt: 1, updatedAt: 1, words: [word('chat')] },
        ],
      },
      {
        code: 'x-other',
        name: ' latin ',
        folders: [],
        sets: [{ name: 'B', createdAt: 1, updatedAt: 1, words: [word('lux')] }],
      },
      {
        code: 'x-new',
        name: 'Esperanto',
        folders: [],
        sets: [
          { name: 'C', createdAt: 1, updatedAt: 1, words: [word('saluton')] },
        ],
      },
    ]);
    const local: Language[] = [
      ...known('en'),
      {
        code: 'x-same',
        name: 'Français',
        nativeName: 'Français',
        custom: true,
      },
      { code: 'x-mine', name: 'Latin', nativeName: 'Latin', custom: true },
    ];
    const plan = planImport(file, empty, local, ids());
    expect(plan.createLanguages).toEqual([
      { code: 'x-new', name: 'Esperanto' },
    ]);
    expect(plan.insertWords.map(w => [w.term, w.languageCode])).toEqual([
      ['chat', 'x-same'],
      ['lux', 'x-mine'],
      ['saluton', 'x-new'],
    ]);
    expect(plan.summary.skippedLanguages).toEqual([]);
    expect(describeSummary(plan.summary)).toBe(
      '3 words added, 0 updated, 3 new sets, new language Esperanto.',
    );
  });

  test('a custom name never merges into a bundled language', () => {
    const plan = planImport(
      backup([
        {
          code: 'x-de',
          name: 'de',
          folders: [],
          sets: [{ name: 'S', createdAt: 1, updatedAt: 1, words: [word('x')] }],
        },
      ]),
      empty,
      known('de'),
      ids(),
    );
    expect(plan.createLanguages).toEqual([{ code: 'x-de', name: 'de' }]);
    expect(plan.insertWords[0].languageCode).toBe('x-de');
  });
});
