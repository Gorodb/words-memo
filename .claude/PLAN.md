# wordsLearning: plan

Offline React Native app (no backend, no login) for learning English, German and Chinese words with Russian translations.

## Concepts

```
Language (en, de, zh)
 ├─ WordSet           (belongs to the language; exists on its own)
 │   └─ Word
 └─ Folder            (manual drag-and-drop order; contains any number of sets)
     ┄ sets           (many-to-many; removing a folder keeps its sets)
         └─ Word      term · translation · examples[{text, translation}] · learned
```

- The **active language** is a global setting. The Folders and Sets tabs only show data for it.
- **Study modes** work on a list of words (a whole set, its not-learned words, or a selection). New modes are added to a registry without touching the data model.
- **Dictionaries** are read-only reference data (downloaded per language) used to suggest word forms and translations. They are kept apart from the user's data.

## Navigation

```
RootStack
├─ Tabs (bottom)
│  ├─ FoldersTab → FoldersStack
│  │   ├─ Folders      header: "Folders · English" + [+] → new folder sheet; drag to reorder
│  │   └─ Folder       header: [<] name, [add sets] → set picker sheet, [⋯] → Edit / Remove menu sheet
│  ├─ SetsTab          all sets of the active language, [+] → new set sheet
│  ├─ LanguagesTab     en / de ✓ active, dictionary Download / Remove per language
│  └─ SettingsTab      Theme (System/Light/Dark) · Export · Import · dictionary attribution
├─ Set                 Learn / Flashcards tiles, "To learn" / "Learned" word lists; [+] word sheet, [⋯] Edit set / Select words / Study set / Study not learned / Reset progress
├─ Study               one session in one study mode (opens on top of the tabs)
└─ Flashcards          full-screen modal: [×] counter [shuffle]; swipe cards of the words to learn
```

`Set` and the learning screens sit in the root stack, so both Folders and Sets can open them and they cover the tab bar.

## Folder structure

```
src/
  app/App.tsx                 providers: gesture root, safe area, theme, navigation, bottom sheets
  navigation/                 RootNavigator, TabNavigator, FoldersStack, typed params
  screens/<tab>/              one folder per tab; screens stay thin
  components/                 shared UI (ListRow, EmptyState, HeaderIconButton, …)
  theme/                      colors and ThemeProvider (light/dark/system → nav theme)
  store/                      zustand: settings (theme, active language)
  domain/types.ts             Language, Folder, WordSet, Word, BackupFile
  config/languages.ts         bundled languages, dictionary download URLs and format version
  db/                         op-sqlite connection, migrations, repositories
  features/dictionary/        search keys, lookup queries, download/install store
  features/study/             study modes registry and session reducer (pure + unit tests)
  features/backup/            backup format, import planner (pure + unit tests), save/share/pick
scripts/dictionary/           Wiktionary → SQLite dictionary build (dict:fetch, dict:build)
```

## Tech choices

| Concern | Choice | Why |
|---|---|---|
| Navigation | React Navigation 7 (bottom-tabs + native-stack) | standard, typed |
| Bottom sheet | @gorhom/bottom-sheet 5 (+ reanimated 4, gesture-handler 2) | the "bottomSheet modal" you asked for |
| UI state | zustand | small, no boilerplate |
| Persistence | **op-sqlite** for user data and dictionaries | dictionaries have hundreds of thousands of rows, so they need indexed lookup; one engine for everything |
| Settings persistence | zustand `persist` → SQLite `settings` table (or MMKV) | |
| Icons | lucide-react-native (+ react-native-svg) | autolinked, no font setup |
| Downloads, files | @dr.pogodin/react-native-fs | dictionary downloads with progress; backup will reuse it |
| Backup files | @react-native-documents/picker + react-native-share | pick, "save as" and share sheet |

## Database (SQLite)

```sql
folders  (id TEXT PK, language_code, name, position, created_at, updated_at)
sets     (id TEXT PK, language_code, name, created_at, updated_at)
folder_sets (folder_id → folders CASCADE, set_id → sets CASCADE, added_at, PK(folder_id, set_id))
words    (id TEXT PK, set_id → sets ON DELETE CASCADE, language_code,
          term, term_norm, translation, examples_json ([{text, translation}]),
          learned_at (NULL = to learn), sort_at (list order), created_at, updated_at)
          INDEX (language_code, term_norm)          -- used by import merge
settings (key PK, value)
```

`term_norm` = trim, collapse whitespace, Unicode NFC. **Case-sensitive**: "das Essen", "essen", "isst" and "hat gegessen" are all different words.

Words are **not unique**: the same term can be in several sets of one language.

## Backup ✅

- **File**: JSON `BackupFile` (`domain/types.ts`, `version: 1`).
  - `kind: 'full'` (Settings → Export) holds every language: sets with words (term, translation, example pairs, learned, dates), and folders in manual order with the names of their sets.
  - `kind: 'sets'` is a shared set: sets only, no folders.
- **Export** (Settings → Export) offers two choices:
  - **Save to device**: the system "save as" dialog.
  - **Share**: the share sheet (Drive, Telegram, e-mail, …).
- **Share set** (the set's ⋯ menu) sends a `kind: 'sets'` file. The other person imports it with Settings → Import.
- **Import** (merge, never deletes). Before writing anything, the app shows a preview ("X added, Y updated, …") and asks for confirmation:
  1. Sets and folders are matched by name per language, or created. Sets listed for a folder are added to it.
  2. A word matching by exact `(language_code, term_norm)` fully replaces translation and examples on **every** matching word. Each one keeps its set and its learned state.
  3. Other words are added to their set from the file, with their learned state.
  4. Languages the app doesn't have are skipped and reported.
  5. Everything runs in one transaction.
- **Code**:
  - `features/backup/format.ts`: validation of untrusted files.
  - `merge.ts`: the pure planner.
  - `backupFiles.ts`: save, share and pick.
  - `db/repositories/backup.ts`: export, snapshot and apply.

## Dictionaries

Built from **Wiktionary** via kaikki.org / wiktextract (CC BY-SA 4.0). The original wikidict files were Wikipedia title pairs (no verbs, `Apfel → Апфель`) and were dropped.

- **Sources** (`npm run dict:fetch`, into gitignored `dictionaries/source/`):
  - Russian Wiktionary raw dump (295 MB gz). It provides Russian glosses, forms and translated examples for German and English.
  - English Wiktionary German extract (1 GB). It's used only for the verb auxiliary (haben/sein) and adjective comparison, which Russian Wiktionary lacks.
- **Build** (`npm run dict:build`, about 20 s) writes `dictionaries/build/<lang>-ru.db`. Sizes: de about 18 MB (85k entries), en about 14 MB (64k entries).
- **Display forms**:
  - German nouns: `der Apfel, die Äpfel`.
  - German verbs: `essen, isst, aß, hat gegessen` (or `ist` / `hat/ist`).
  - German adjectives: `gut, besser, am besten`.
  - English irregular verbs: `go, went, gone`.
- **Lookup**: prefix search over the lemma and every form, with umlauts folded. Typing `isst` finds essen, and `apfel` finds Äpfel.
- **Distribution**: GitHub Release `dict-v1` of Gorodb/words-memo. You upload the files. The Languages tab downloads them with progress and checks `meta.format`.
- **In the word sheet**:
  - The word field suggests entries, and picking one fills in the full forms.
  - The translation field then suggests that entry's Russian glosses. You can still type freely.

## Study modes

Registry in `src/features/study/modes.ts`; session logic in `session.ts` (pure reducer, memory only):

1. **Translation → word**: tap to reveal or hide the word.
2. **Word → translation**: tap to reveal or hide the translation.
3. **Writing the word**:
   - **Hint** adds the next letter of the answer.
   - **Check** compares the whole string, case-insensitive. A correct answer turns green.
   - A wrong answer turns red and shows **Show**, **Mark as correct** and **Try again**.
4. **Writing the translation**: the same, for the translation.

Every mode has **Shuffle** and **Hide learned**. Hide learned hides revealed or correct words for the rest of the session and doesn't change the Learned flag in the set.

## Set tiles and flashcards

- **Learn** tile: a menu of the study modes over the words to learn (all words once every word is learned).
- **Flashcards** tile (`FlashcardsScreen`, reducer in `features/study/flashcards.ts`):
  - Cards are the set's words that are **not learned**, snapshot at open. If all are learned, the tile offers "Reset and start".
  - Header: close, counter `3 / 12`, shuffle (shuffles the cards not answered yet).
  - The card shows the translation; tap flips it to the word. "Word first" / "Translation first" swaps the sides.
  - Swipe right = learned, swipe left = to learn. **Both write the Learned flag to the database** (only when it changes).
  - Undo goes back one card and restores its Learned flag.
  - At the end: "Repeat N to learn" starts a round over the cards still to learn.
- **Reset progress** (set ⋯ menu): marks every word of the set as not learned, after a confirmation.

## Steps

1. ✅ **Scaffold**: dependencies, providers, bottom tabs, Folders stack, theme switching, language switching, placeholder screens.
2. ✅ **DB layer + Folders/Sets CRUD**: op-sqlite, migrations, repositories, create and rename bottom sheet, long-press Rename / Delete, Sets tab grouped by folder, persisted settings.
3. ✅ **Words**: shared bottom-sheet form (fields, required, suggestions, example pairs), Set screen with "To learn" / "Learned" parts, swipe to Edit / Delete, tap to expand examples, and selection mode. Remaining: search.
4. ✅ **Backup**: export (save / share), import with preview and merge, share a set, unit and round-trip tests.
5. ✅ **Dictionaries**: Wiktionary build script, download flow, and forms and translation suggestions. Remaining: upload `de-ru.db` / `en-ru.db` to the `dict-v1` release.
6. ✅ **Study modes**: registry plus the first 4 modes. Later: more modes, and spaced repetition.
7. Polish: app icon, iOS build check on the Mac.
8. ✅ **Set tiles + flashcards**: Learn / Flashcards tiles on the Set screen, flashcards game, Reset progress.

## Decisions

- Words are not unique per language. Import fully updates every word with the same exact term.
- Updated words stay in their current set.
- Term matching is case-sensitive and exact.
- Platforms: Android and iOS. You'll sign and install the iOS build yourself as an .ipa.
- Dictionaries come from Wiktionary, are kept out of git, and are downloaded by the app (GitHub Release).
- Writing modes check the whole string (case-insensitive), and "Mark as correct" covers typos or a missing article.
- "Hide learned" in study is session-only.
- Chinese (`zh`) is a language without a dictionary for now: no download button and no suggestions. Its words are typed freely (characters, pinyin in the term or translation as you like).
- Flashcards are the exception: their swipes change the Learned flag in the database. They show only the words to learn.
- Sets are independent of folders. A folder contains sets (a set can be in several folders), and removing a folder keeps its sets. Sets created from inside a folder are added to it.
- Folders are sorted manually with drag and drop. New folders go to the end.
- Up to 5 folders and 5 sets per language can be pinned to the top of their lists. Use the "⋯" menu on a folder or set screen, or long-press a set.
- App icon: fanned flashcards with a teal "learned" check on an indigo → violet gradient. The splash screen shows the same mark on #6A5DF0.
