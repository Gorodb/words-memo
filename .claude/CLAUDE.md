# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Offline-first React Native app (Android + iOS) for learning English and German words (plus languages the user adds) with Russian translations. An optional account syncs the data through the NestJS backend in `backend/` (see "Sync" below); without one, the app works fully offline. **`.claude/PLAN.md` is the source of truth** for product decisions, the roadmap (numbered steps, ✅ = done), and the backup/import merge rules. Feature plans live in `.claude/plans/`. Read it before starting a feature and update it when a step is completed or a decision changes.

## Commands

```sh
npm start                      # Metro
npm run android                # build + install on emulator/device
npm run ios                    # macOS only; run `cd ios && bundle exec pod install` after native dep changes
npx tsc --noEmit               # type-check (not in package.json scripts)
npm run lint                   # eslint
npm test                       # jest
npx jest __tests__/db.test.ts  # single file;  add -t "<test name>" for a single test
cd android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a   # fast native compile check
npm run dict:fetch             # download Wiktionary sources (~1.3 GB) into dictionaries/source/
npm run dict:build             # build dictionaries/build/<lang>-ru.db (~20 s)
node scripts/dictionary/query.ts de essen Apf   # try lookups against a built dictionary
npm run android:release        # release APKs per ABI → dist/words-memo-<versionName>-arm64.apk / -armv7.apk (signing: WORDS_UPLOAD_* in ~/.gradle/gradle.properties)
npm run brand                  # regenerate launcher icons from scripts/brand/artwork.ts (then re-run the bootsplash command it prints)
cd backend && docker compose up -d db && npm run start:dev   # sync server on :3000 (see backend/README.md)
adb reverse tcp:3000 tcp:3000  # lets the app's http://localhost:3000 reach it from an emulator / USB device
```

`backend/` is a separate Node project (ESM, its own `package.json`, `npm test` = `node --test`). The root `tsconfig.json`, ESLint, Jest and Metro all ignore it.

Release signing: `android/app/build.gradle` uses the upload key from the `WORDS_UPLOAD_*` gradle properties and falls back to the debug key with a warning. Updates must always be signed with the same key: a key change forces an uninstall, which deletes the user's local words. Bump `versionCode` and `versionName` in `android/app/build.gradle` for every release you install over an older one. ABI splits (arm64-v8a, armeabi-v7a) are enabled only for release tasks.

Stack: RN 0.88 (New Architecture, Hermes), React 19, TypeScript. Reanimated 4 needs `react-native-worklets/plugin` to stay **last** in `babel.config.js`. `react-native-gesture-handler` is pinned to 2.x on purpose, because `@gorhom/bottom-sheet` 5 targets the v2 API. Don't upgrade it to 3.x.

## Architecture

- **Entry**: `App.tsx` re-exports `src/app/App.tsx`. `bootstrap()` runs **synchronously before the first render**: it opens SQLite, applies migrations and hydrates the settings store. That's why settings reads and migrations use `executeSync`.
- **Navigation** (`src/navigation/`): a root native stack contains `Tabs` (Folders, Sets, Languages, Settings) plus screens that must cover the tab bar and be reachable from several tabs (`Set`, `Study`). The Folders tab has its own nested stack (`Folders` → `Folder`). Param lists live in `navigation/types.ts`, and `ReactNavigation.RootParamList` is declared globally. Screens inside nested stacks get a root-typed navigator with `useNavigation<NativeStackNavigationProp<RootStackParamList>>()` when they open root screens.
- **Data** (`src/db/`): op-sqlite. Each `repositories/*.ts` module is a set of async functions that map snake_case rows to the camelCase types in `src/domain/types.ts`. **After every write, a repository must call `notifyChanged(...tables)`** (`db/changes.ts`). Screens read data with `useQuery(load, tables)`, which re-runs when one of those tables changes. `load` must be memoized with `useCallback`, otherwise it re-runs on every render. There's no global data cache. The DB is the state.
- **Migrations** (`db/migrations.ts`): an append-only array whose version is tracked in `PRAGMA user_version`. Never edit a migration that has shipped; add a new one. `migrate()` turns foreign keys off while migrating, so a migration can rebuild a table (create, copy, drop, rename) without cascading deletes, and it runs `foreign_key_check` before committing. `PRAGMA foreign_keys = ON` is set per connection in `database.ts`.
- **Data model**: sets belong to a language, not to a folder. Folders contain sets through `folder_sets` (many-to-many; code says "in folder", e.g. `setInFolder`). Deleting a folder only removes its sets from it; deleting a set cascades to its words and folder links. Folders have a manual `position` (drag and drop with `react-native-reorderable-list`), and `reorderFolders` rewrites the positions in one transaction.
- **Pin to top**: folders and sets have `pinned_at`; up to `MAX_PINNED` (5) of each per language (`src/domain/pinning.ts`, enforced in `setFolderPinned` / `setSetPinned`, which throw `PinLimitError`). Every list query orders pinned first (`pinned_at IS NULL`, then the normal order). UI goes through `togglePinned()` / `pinLabel()` in `components/itemActions.ts`. "Pinned" means pinned to the top. Don't use it for folder membership.
- **UI state** (`src/store/`): zustand stores only the theme mode, the active language and the language list. Setters persist to the `settings` table. Read languages from `useSettingsStore(s => s.languages)` (bundled `BUNDLED_LANGUAGES` + custom ones from the `languages` table), never from `BUNDLED_LANGUAGES` directly.
- **Custom languages** (`db/repositories/languages.ts`): code `x-<id>`, `custom: true`, no dictionary (so `wordForm` gives no suggestions). Add / rename / remove go through the settings store, which checks names are unique (`domain/languages.ts`). Deleting one deletes its folders, sets and words. Language scoping: folders, sets and words carry a `language_code`, and every list query filters by the active language.
- **Theme**: `ThemeProvider` resolves system/light/dark to app `colors` and a React Navigation theme. Components take colors from `useAppTheme()` instead of hard-coding them.
- **Bottom-sheet forms** (`components/formSheet/`): `useFormSheet()` is the single sheet for every create and edit form. Render `{sheet.element}` in the screen and call `sheet.open(options)`. Options declare `fields` (with `required`, `initialValue`, `multiline`, `hint`, and `suggestions`, an async dropdown that can set several fields on pick) and an optional `examples` config, which turns on "+ Add example" and removable example + translation rows. Save stays disabled until the required fields are filled, and the result is trimmed with blank examples removed (pure logic in `form.ts`). A field with `addLabel` stays hidden behind a "+ <addLabel>" button next to "+ Add example" (shown after the examples once revealed; starts revealed when it has a value), which is how the word description works. `open()` also takes a `FormSheetChoice` (`variants`): a segmented control under the title switches between whole forms, and switching starts the other form empty (new word | new rule). Build options with the presets in `forms.ts` (`nameForm`, `wordForm`, `ruleForm`, `wordOrRuleForm`) instead of inline field lists. All buttons are `TextButton`, and icon-only buttons are `IconButton`.
- **Sheet rules**: sheets with inputs use `android_keyboardInputMode="adjustPan"`, never `adjustResize`. The app is edge-to-edge, so Android doesn't resize the window for the keyboard, and with `adjustResize` the library ignores the keyboard height and the sheet stays behind it. Pass `topInset={insets.top}` so a sheet never goes taller than the screen. Text inputs are uncontrolled (`defaultValue` + `onChangeText`), and **their `defaultValue` must never change while mounted**. React Native sends `value ?? defaultValue` to the native field, so a value that follows the typing makes the cursor jump on Android. To set an input from code, change its seed and remount it through `key` (the FormSheet "seeds" / "revisions", and the study screen's Hint). Don't make an uncontrolled input read-only to show a final value. On Android it falls back to its `defaultValue` and loses the typed text, so render a `Text` instead (see `WriteCard` after Check). Never `autoFocus` an input that mounts together with a sheet. Focus it in the sheet's `onChange(index >= 0)` instead, because focusing during the open animation pushes the sheet off-screen on Android. `useActionMenu()` (`components/ActionMenuSheet.tsx`) is the bottom-sheet menu, and the chosen action runs after the menu has dismissed, so it can safely open another sheet or an alert.
- **List item actions**: long-press opens a `useActionMenu()` bottom sheet (Pin / Rename / Delete …), not an `Alert`, because Android alerts show at most 3 buttons. `confirmDelete()` is the delete confirmation. Word rows use swipe-left actions (`ReanimatedSwipeable`) instead.
- **Keyboard outside sheets**: there's no keyboard library on purpose. A `KeyboardProvider` would change keyboard handling app-wide and break the sheets. Screens pad their scroll content by `useKeyboardHeight()` and scroll the focused input into view (see `StudyScreen`).
- **Descriptions and rules**: `words.description` is Markdown (`''` = none); `WordInput.description` is optional and `updateWord` keeps the current one when it's missing. Rules live in their own `rules` table (`db/repositories/rules.ts`, change table `'rules'`) so no word query or study mode can pick them up. A rule has a `title` and Markdown `text`; display titles through `ruleTitle()` (`domain/rules.ts`), which falls back to the text's first line for rules made before migration v8. Render Markdown with `components/Markdown.tsx` (parser: `features/markdown/markdown.ts`, pure, tested in `__tests__/markdown.test.ts`) and show long text read-only with `useMarkdownSheet()`. `SegmentedControl` is the shared tab switch (Set screen Words / Rules, FormSheet variants).
- **Words order**: `listWords` returns "to learn" first, then learned, each by `sort_at DESC`. `createWord` and `setLearned` set `sort_at` above every word in the set, which moves the word to the top of its part.
- **Study** (`src/features/study/`): `modes.ts` is the registry (kind `reveal` | `write`, prompt side, answer side). `session.ts` is a pure reducer and only lives in memory (write statuses: `idle`, `correct`, `assisted` = correct after a hint or peek, `wrong`). The write card's "Learned" button calls `setLearned` from the screen. `StudyScreen` renders a card per kind, so a new kind needs a renderer.
- **Study words** (`features/study/studyWords.ts` + `screens/study/StudyWordsScreen.tsx`): a pure reducer over up to 10 words and three rounds (`STUDY_WORDS_ROUNDS`), each with one repeat pass over its mistakes. Options are built when a pass starts (`buildOptions`, set words first, then `sampleWordsOutsideSet`). At the end the screen writes the mistake-free words with `setLearnedMany`.
- **Flashcards** (`features/study/flashcards.ts` + `screens/study/FlashcardsScreen.tsx`): a pure reducer over the set's words to learn. Unlike study sessions, swipes write the Learned flag: the screen asks `learnedWrite(state, action)` for the change before dispatching. The card uses Gesture Handler `Gesture.Pan`/`Tap` + Reanimated, and calls back to JS with `scheduleOnRN` (react-native-worklets). The screen is a `fullScreenModal` with its own `GestureHandlerRootView` and `BottomSheetModalProvider` (on iOS it is a native modal, so sheets from the root provider would open behind it). "Edit" opens the word form; the `edit` action swaps the card text without touching the game position.

## Backup

- **Pure parts**: `features/backup/format.ts` turns untrusted JSON into `BackupFile` with readable errors, and `merge.ts` (`planImport`) builds an `ImportPlan` from a backup and a snapshot of the DB (`loadExisting`). Keep merge rules there and unit test them (`__tests__/backup.test.ts`).
- **Writes**: `applyImportPlan` writes the plan in one transaction. `exportAll` / `exportSets` build files from the DB. `db.test.ts` has a round trip (share a set, delete it, import it, import again).
- **Native**: `backupFiles.ts` writes to the cache dir, then calls `saveDocuments` (save as), `react-native-share` (share sheet) or `pick` + `keepLocalCopy` + `readFile` (import). Picker cancellation (`OPERATION_CANCELED`) and share cancel are normal outcomes, not errors.

## Sync

- **Model**: the phone's SQLite stays the only data the app reads. The server is a copy per account. The phone is the source of truth: pushed rows overwrite the server's copy, and pulled rows never overwrite a row changed locally since the push.
- **Change capture**: triggers from migration v9 record every insert, update and delete (including cascades and changes made while signed out) as `(sync table, row key)` in `sync_queue`. A row in `sync_pause` turns them off. Repositories don't do anything for sync. They only need `notifyChanged`, which schedules a push. A new synced table needs triggers in a new migration, a `TABLES` entry in `db/repositories/sync.ts`, and a matching type in both `protocol.ts` files.
- **Repository** (`db/repositories/sync.ts`):
  - `collectChanges(full)`: the queued rows, or every row on a full sync.
  - `applyRemoteChanges(changes, upToSeq)`: upserts parents first and skips rows whose parent is missing. Deletes children first and never deletes a parent that holds unpushed local changes. Acks the queue.
  - `applyRemoteChanges` is **synchronous** (`executeSync`) on purpose. op-sqlite's plain `execute` doesn't wait for a transaction, so a UI write during an async transaction would run inside it with the triggers paused.
- **Engine** (`features/sync/syncStore.ts`): `startSync()` in `bootstrap`. It syncs on sign in (full: no `sync.cursor` setting), on DB changes (debounced), when the app comes to the foreground, when the network comes back (`@react-native-community/netinfo`), and with backoff retries.
  - 401 signs out locally. `SYNC_CURSOR_AHEAD` makes it run a full sync.
  - The token, email and cursor live in the `settings` table (`sync.*`). Signing out keeps all words.
- **UI**: Settings → Account. Sign in is `signInForm()`. An unknown email (`USER_NOT_FOUND`) asks to create the account. FormSheet `onSubmit` returning `false` keeps the sheet open, and `kind: 'email' | 'password'` sets keyboard, autofill and masking.
- **Server URL**: `src/config/sync.ts` (dev `http://localhost:3000`; release needs HTTPS).

## App icon and splash

- **Icon**: `scripts/brand/artwork.ts` holds the artwork as SVG. `npm run brand` renders it with sharp into:
  - Android legacy and round mipmaps;
  - adaptive icon layers (`mipmap-anydpi-v26`), with the mark kept inside the 66% safe zone;
  - the iOS single 1024 icon (no alpha).
- **Splash**: react-native-bootsplash.
  - Assets come from `npx react-native-bootsplash generate assets/brand/splash-logo.svg …`.
  - It's set up in `MainActivity.kt` (`RNBootSplash.init` after the react-native-screens fragment factory) and in `SceneDelegate.swift` (`customize(_:)`, since RN 0.88 has no ReactNativeDelegate in AppDelegate).
  - `NavigationContainer onReady` hides it, and so does the startup error screen.

## Domain rules (from .claude/PLAN.md decisions)

- Words are **not** unique per language. The same term may appear in several sets.
- Term matching uses `term_norm` (trim, collapse whitespace, NFC) and is **case-sensitive**: "das Essen", "essen" and "isst" are different words.
- Import never wipes data. A matching term fully replaces translation, examples and description on every matching word, and each word stays in its current set. Rules are added unless their set already has the same text. Unmatched words go into the set from the backup, and folders and sets are matched by name or created.

## Dictionaries

The source data comes from Wiktionary (kaikki.org / wiktextract, CC BY-SA), not the old wikidict files.

- **Build** (`scripts/dictionary/`, Node 24 runs the `.ts` files directly):
  - `format.ts` turns wiktextract entries into rows. It is pure and tested with `test-utils/fixtures/*.jsonl`.
  - `schema.ts` holds the DB schema and writer, plus `FORMAT_VERSION`, which must equal `DICTIONARY_FORMAT` in `src/config/languages.ts`.
  - `build.ts` streams the dumps.
  - Read JSONL with `jsonl.ts`: `readline` breaks on the lone `\r` that appears inside entries.
- **Shared with the app**: `src/features/dictionary/searchKey.ts` and `queries.ts` are imported by both the build/tests and the app. They use `.ts` import extensions so plain Node can load them.
- **App**:
  - Dictionaries are downloaded into `DocumentDirectoryPath/dictionaries`.
  - `dictionaryStore` tracks the status per language, and `dictionary.ts` opens them with op-sqlite (absolute `location`).
  - `wordForm(languageCode, …)` wires the suggestions.
- `dictionaries/` is gitignored. Never import dictionary files through Metro or commit them.

## Testing

`jest.config.js` uses `react-native-reanimated/jest/resolver` so code that imports reanimated or worklets directly loads in Jest. `jest.setup.js` globally mocks gesture-handler, reanimated, bottom-sheet and op-sqlite (as a no-op). `react-native-reorderable-list`, `ReanimatedSwipeable`, `react-native-bootsplash` and NetInfo (its own jest mock) are mocked, and `@dr.pogodin/react-native-fs` reports dictionaries as not installed. `__tests__/dictionary.test.ts` builds a dictionary in memory from real fixture lines with the same writer and queries. `__tests__/db.test.ts` replaces the op-sqlite mock with `test-utils/sqliteAdapter.ts`, an adapter over Node's built-in `node:sqlite`, so the real migrations and repository SQL run in Jest. Use that pattern for DB logic (`__tests__/sync.test.ts` covers the sync triggers, collect and apply). `lucide-react-native` is mapped to its CJS build in `jest.config.js` because the RN preset doesn't transform `.mjs` files.
