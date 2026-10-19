# wordsLearning: plan

Offline React Native app (no backend, no login) for learning English and German words with Russian translations.

## Concepts

```
Language (en, de, +downloadable)
 ├─ WordSet           (belongs to the language; exists on its own)
 │   └─ Word
 └─ Folder            (manual drag-and-drop order; pins any number of sets)
     ┄ pinned sets    (many-to-many; removing a folder only unpins)
         └─ Word      term · translation · examples[]
```

- The **active language** is a global setting. The Folders and Sets tabs only show data for it.
- **Learning programs** are plugins that work on a list of words (a set, a folder, or a mix). New ones can be added without touching the data model.
- **Dictionaries** are read-only reference data used to suggest translations. They are kept apart from the user's data.

## Navigation

```
RootStack
├─ Tabs (bottom)
│  ├─ FoldersTab → FoldersStack
│  │   ├─ Folders      header: "Folders · English" + [+] → new folder sheet; drag to reorder
│  │   └─ Folder       header: [<] name, [add sets] → set picker sheet, [⋯] → Edit / Remove menu sheet
│  ├─ SetsTab          all sets of the active language, [+] → new set sheet
│  ├─ LanguagesTab     en / de (bundled) ✓ active, "Download more"
│  └─ SettingsTab      Theme (System/Light/Dark) · Export · Import
├─ Set                 word list, add/edit word, "Learn" (opens on top of the tabs)
├─ WordEditor          (later) term, translation, N examples
└─ Learn/<program>     (later) full-screen session
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
  config/languages.ts         bundled languages and catalog URL
  -- later --
  db/                         op-sqlite connection, migrations, repositories
  features/backup/            export, import, merge logic (pure + unit tests)
  features/dictionary/        lookup, download, install
  features/learning/          program registry and programs/<id>/
scripts/build-dictionary.ts   DSL → SQLite converter (runs at build time)
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
| File I/O for backup | @react-native-documents/picker + a filesystem/share lib | pick an import file, save or share the export |

## Database (SQLite)

```sql
folders  (id TEXT PK, language_code, name, position, created_at, updated_at)
sets     (id TEXT PK, language_code, name, created_at, updated_at)
folder_sets (folder_id → folders CASCADE, set_id → sets CASCADE, added_at, PK(folder_id, set_id))
words    (id TEXT PK, set_id → sets ON DELETE CASCADE, language_code,
          term, term_norm, translation, examples_json, created_at, updated_at)
          INDEX (language_code, term_norm)          -- used by import merge and duplicate check
word_progress (word_id, program_id, score, last_seen_at, due_at, …)  -- per learning program
settings (key PK, value)
languages(code PK, name, native_name, dictionary_status, dictionary_version)
```

`term_norm` = trim, collapse whitespace, Unicode NFC. **Case-sensitive**: "das Essen", "essen", "isst" and "hat gegessen" are all different words.

Words are **not unique**: the same term can be in several sets of one language.

## Backup

- **Export**: one JSON file (`BackupFile` in `domain/types.ts`, versioned). For each language it holds the sets with their words, plus the folders in their manual order, each listing the names of its pinned sets.
- **Import** (merge, never wipes data). For each language in the file:
  1. Find each set by name, or create it. Do the same for folders, and pin the listed sets to them.
  2. For each word, look it up by exact `(language_code, term_norm)`:
     - **found**: fully replace translation and examples on **every** matching word. Each one stays in its current set.
     - **not found**: insert it into the set from the backup.
  3. Run everything in one transaction and show a summary (X added, Y updated).
- The merge is a pure function `(existing, backup) → operations`, so it can be unit tested without a device.

## Dictionaries: important finding

The `wikidict` files are **Wikipedia article-title pairs**, not a real dictionary:

- en-ru: about 628k entries, de-ru: about 420k. Mostly proper nouns and article titles ("2015 European Athletics Indoor Championships – Men's 60 metres").
- Common words are often missing (`house` isn't in it) or translated oddly (`Haus → Жилище`).
- Each card's format is simple: `headword \n translation \n\t[m1]…[/m]` (UTF-8, LF line endings).

They can still be useful for **suggesting a translation while typing**, but they won't cover everyday vocabulary well. Plan:

1. `scripts/build-dictionary.ts`: stream-parse the DSL and drop noise (titles with digits, more than 4 words, translation equal to the headword). Write `dictionaries/build/<lang>-ru.db` with an index on `term_norm`.
2. Publish the `.db` files as GitHub Release assets. The app downloads them, including en and de. This is not parsing a 50–80 MB DSL on the phone.
3. en and de are pre-listed in Languages, so folders and sets work right away. Only the translation suggestions need the download.
4. Consider a Wiktionary-based source (e.g. kaikki.org extracts) later if you want better coverage of common words.

Repo hygiene: ✅ the raw DSL files now live in `dictionaries/source/`, and `/dictionaries/` is gitignored.

## Learning programs (extensible)

```ts
interface LearningProgram {
  id: string;                        // 'flashcards'
  title: string;
  minWords: number;
  Screen: React.ComponentType<{ wordIds: ID[] }>;
}
// features/learning/registry.ts: export const PROGRAMS = [flashcards, quiz, typing]
```

First programs: **Flashcards** (flip, know / don't know), **Multiple choice** (pick the translation from 4), **Typing** (type the term from the translation). Progress is stored per program in `word_progress`. Spaced repetition can be added later.

## Steps

1. ✅ **Scaffold**: dependencies, providers, bottom tabs, Folders stack, theme switching, language switching, placeholder screens.
2. ✅ **DB layer + Folders/Sets CRUD**: op-sqlite, migrations, repositories, create and rename bottom sheet, long-press Rename / Delete, Sets tab grouped by folder, persisted settings.
3. **Words**: ✅ shared bottom-sheet form (`useFormSheet`: fields, required, examples), ✅ Set screen list (tap to edit, long-press to delete). Remaining: search.
4. **Backup**: export and share, import with merge and summary, unit tests for the merge.
5. **Dictionaries**: build script, release assets, download flow, translation suggestions in the word editor.
6. **Learning programs**: registry plus the first two programs.
7. Polish: app icon, iOS build check on the Mac.

## Decisions

- Words are not unique per language. Import fully updates every word with the same exact term.
- Updated words stay in their current set.
- Term matching is case-sensitive and exact.
- Platforms: Android and iOS. You'll sign and install the iOS build yourself as an .ipa.
- Dictionaries are kept out of git and downloaded by the app.
- Sets are independent of folders. A folder pins sets (a set can be in several folders), and removing a folder keeps its sets. Sets created from inside a folder are pinned to it.
- Folders are sorted manually with drag and drop. New folders go to the end.
