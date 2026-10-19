# Dictionary suggestions, richer words, set menu and study modes

## Context

The user wants dictionary help when creating words, a richer word list in a set, and the first study modes.

Research done during planning:
- **The current wikidict files can't do this.** They're Wikipedia title pairs: `Apfel → Апфель` (a surname), `go → Go (programming language)`, and no verbs or adjectives at all (`essen`, `gehen`, `schnell`, `eat`, `fast` are missing).
- **Russian Wiktionary, extracted by wiktextract (kaikki.org), has what's needed:**
  - German nouns: gender and the full declension (Apfel: masculine, plural Äpfel).
  - German verbs: esse/isst/esst, Präteritum aß, Partizip II gegessen, Konjunktiv äße, imperative.
  - Russian glosses (essen: «есть, кушать»).
  - **Example sentences with Russian translations**.
  - English: Russian glosses, plural, IPA.
  - Size: about 120k German and 104k English senses. Extracted 2026-10-18, licensed CC-BY-SA/GFDL.
  - Source file: `https://kaikki.org/ruwiktionary/raw-wiktextract-data.jsonl.gz` (295 MB gz, all languages, filter on `lang_code`).
  - Gap: the verb auxiliary (hat/ist) isn't among the forms, so it needs a fallback (step 3).
- **Feasibility.** Forms suggestions ("Apfel → der Apfel, die Äpfel", "essen → essen, isst, aß, hat gegessen") are feasible if the dictionary is built offline into a small SQLite file. They are not too complex to implement.

User decisions:
- Use the Wiktionary source and drop wikidict.
- Writing study modes check the **whole string**, case-insensitive, plus a **"Mark as correct"** button for typos or a missing article.
- "Hide learned" in study is **session-only**.
- Dictionaries are **downloaded in the app** from a GitHub Release of `Gorodb/words-memo`. `gh` isn't installed, so the user uploads the files.

## Step 0 — Move Claude files into `.claude/`

- Move `CLAUDE.md` to `.claude/CLAUDE.md` (Claude Code loads it from there).
- Move `PLAN.md` to `.claude/PLAN.md` and update the references in CLAUDE.md.
- Copy this plan to `.claude/plans/dictionary-and-study.md`.
- `.mcp.json` must stay in the repo root, because Claude Code only reads project MCP config there. Mention this to the user.

## Step 1 — Word model: learned state, example pairs, ordering

**Migration v3** (`src/db/migrations.ts`, append only):
- `ALTER TABLE words ADD COLUMN learned_at INTEGER` (NULL = not learned).
- `ALTER TABLE words ADD COLUMN sort_at INTEGER NOT NULL DEFAULT 0`, then `UPDATE words SET sort_at = created_at`.
- Convert `examples_json` from `["a"]` to `[{"text":"a","translation":""}]` with `json_each` / `json_group_array`.
- `toWord` also accepts the legacy string form.

**Types** (`src/domain/types.ts`):
- `Example { text; translation }`.
- `Word.examples: Example[]` and `Word.learnedAt: Timestamp | null`.
- `WordInput.examples: Example[]`.
- `BackupFile` words get `learnedAt`.

**Repository** (`src/db/repositories/words.ts`):
- `listWords` orders by `ORDER BY learned_at IS NOT NULL, sort_at DESC, rowid DESC`.
- New `setLearned(id, learned)` sets `learned_at = learned ? now : NULL` and `sort_at = now`.
  - "Learned" moves the word to the top of the Learned part.
  - "To revise" moves it to the top of the list.
- `createWord` sets `sort_at = now`.

## Step 2 — Set screen word list

New `src/screens/sets/WordRow.tsx`, used by `SetScreen.tsx`:
- **Swipe left** opens the word menu. Use `ReanimatedSwipeable` from `react-native-gesture-handler/ReanimatedSwipeable` (already installed, v2.33).
  - Right actions are **Edit** and **Delete** text buttons.
  - Edit opens the existing `wordForm` in edit mode (`src/components/formSheet/forms.ts`).
  - Delete deletes the word right away, as specified.
  - Opening one row closes the other open row.
- **Tap** the row to expand it. Expanded rows show the examples (example text plus its translation in the muted color) below the translation.
- The **"Learned" / "To revise"** `TextButton` (`src/components/TextButton.tsx`) sits at the end of the row and calls `setLearned`.
- Switch from `FlatList` to `SectionList`.
  - Section headers are a centered divider: line, label, line.
  - Labels: "To learn (N)" and "Learned (N)". A section is shown only when it isn't empty.
- Remove the old long-press delete.

## Step 3 — Dictionary from Wiktionary

**Build: offline, Node 24, no new dependencies.** It uses `node:sqlite`, `zlib` and `readline`.
- `scripts/dictionary/fetch.ts` downloads the raw gz into `dictionaries/source/` (gitignored).
- `scripts/dictionary/build.ts` streams it, keeps `lang_code` `de` / `en`, and writes `dictionaries/build/<lang>-ru.db`:
  ```sql
  meta(key PK, value)                 -- format version, source, dump date, license/attribution
  entries(id INTEGER PK, lemma, pos, display, glosses_json, examples_json)
  keys(key TEXT, entry_id)            -- lemma + every form, lowercased NFC, plus a folded copy (ä→a, ß→ss); INDEX(key)
  ```
  - Keep the first 5 senses and 2 examples per sense. Target under 40 MB per language; measure it and trim if needed.
- `scripts/dictionary/format.ts` holds pure display formatting:
  - German noun: `der|die|das Lemma, die Plural`.
  - German verb: `inf, 3sg, Präteritum, aux PII`.
  - German adjective: `schnell, schneller, am schnellsten` when the forms exist.
  - English irregular verbs: `go, went, gone`. Everything else: the lemma.
- **Auxiliary investigation (first task of this step):** look in the raw entries for `essen` and `gehen` (templates, categories). If Russian Wiktionary doesn't have it, use the English Wiktionary German extract, whose verb forms carry an `auxiliary` tag. As a last resort, show `gegessen` without an auxiliary rather than guess.
- npm scripts: `dict:fetch`, `dict:build`.
- Add the run instructions to `.claude/CLAUDE.md`.

**Hosting:**
- The user uploads `de-ru.db` and `en-ru.db` to the release `dict-v1`.
- URLs go in `src/config/languages.ts`, along with the format version and size.

**App** (`src/features/dictionary/`):
- New dependency `@dr.pogodin/react-native-fs` for downloads with progress into the documents directory. Backup export/import will reuse it. Check that it works on RN 0.88 New Architecture.
- `install.ts`: download to `.part`, rename, check `meta.version`, remove.
- `dictionary.ts`: open the file with op-sqlite `open({ name, location })` (cached per language).
  - `suggestTerms(lang, text)` does a prefix search on `keys`. Exact matches come first, then shorter lemmas, up to 8 results.
  - `glossesFor(lang, term | entryId)`.
- `dictionaryStore.ts` (zustand): status per language (not installed / downloading with progress / installed / error). Detected from the files after startup.
- Languages screen (`src/screens/languages/LanguagesScreen.tsx`):
  - Row subtitle "Dictionary · 25 MB", plus Download, progress % and Remove.
  - Add the CC-BY-SA "Wiktionary" attribution line to Settings.
- Delete the wikidict mentions from PLAN.md.

## Step 4 — Word form: suggestions and example pairs

Extend the generic form (`src/components/formSheet/form.ts`, `FormSheet.tsx`), keeping it free of dictionary code:
- `FormField.suggestions?: { trigger: 'typing' | 'focus'; load(text, values): Promise<FormSuggestion[]>; onPick(s, values): Record<string, string> }`.
  - `FormSuggestion` is `{ key, title, subtitle? }`.
- The dropdown is drawn inline below the focused field, inside the scroll view (taps already persist), with up to 6 rows. Loading is debounced by 200 ms.
- Setting a field from code stays compatible with the uncontrolled-input rule. Bump a per-field revision `key` so the input remounts with the new `defaultValue`, then keep the focus.
- Examples become pairs: each row has an **Example** input, a **Translation** input below it, and the minus button. On save, rows with a blank example text are dropped (pure logic in `form.ts`).

`wordForm(languageCode, …)` in `forms.ts` wires up the dictionary:
- **Word:** while typing (2+ chars), suggest entries. The title is `display` (e.g. "der Apfel, die Äpfel") and the subtitle is the first glosses. Picking one fills the word with `display` and remembers the entry.
- **Translation:** on focus, list the glosses of the picked entry. If nothing was picked, look up the typed main form. Picking a gloss replaces the field, and the user can still type freely.
- If the dictionary isn't installed, show a small hint linking to the Languages tab.
- `SetScreen` passes `set.languageCode`.

## Step 5 — Set "…" menu, selection, study modes

**Set header:** **+** (add word) and **⋯** open `useActionMenu` (`src/components/ActionMenuSheet.tsx`, which gets `disabled?` items) with:
- **Edit set**: `nameForm` → `renameSet`.
- **Select words**: selection mode.
  - Rows show checkboxes, and swipe is off.
  - The header has a **Select all / Deselect all** text button.
  - A fixed bottom bar has **Cancel** and **Study (N)**; Study stays disabled until at least 1 word is selected.
- **Study set**: all words.
- **Study not learned**: disabled when there's nothing to study.

Any study option opens a second menu sheet to pick the mode, then navigates to a new root screen `Study { wordIds, modeId }` (`src/navigation/types.ts`, `RootNavigator.tsx`).

**Study** (`src/features/study/`):
- `modes.ts` is a registry: `{ id, title, kind: 'reveal' | 'write', prompt: 'term' | 'translation', answer: 'term' | 'translation' }`.
  - Mode 1: translation → word.
  - Mode 2: word → translation.
  - Mode 3: writing the word.
  - Mode 4: writing the translation.
  - Future modes add new entries (this replaces the "learning programs" section in PLAN.md).
- `session.ts` is a pure reducer with unit tests.
  - State: `order`, `hidden`, and per-word `{ revealed }` or `{ status: idle | correct | wrong | shown, hints, attempt }`.
  - Actions: `shuffle`, `toggleReveal`, `hideLearned`, `check`, `hint`, `show`, `retry`, `markCorrect`.
  - Answers compare the whole string: trim, collapse whitespace, NFC, `toLocaleLowerCase`.

**`StudyScreen.tsx`:**
- Top bar: **Shuffle**, **Hide learned**, and a counter.
- Hide learned removes revealed words (modes 1–2) or correct words (modes 3–4) for the rest of the session. It doesn't change the learned state in the DB.
- **Reveal modes:** the prompt is visible and the answer is masked. A tap reveals it, and another tap hides it.
- **Write modes:** the prompt, an input, and **Hint** and **Check** buttons.
  - Hint fills the input with the next letter of the answer, from the beginning (remount via `key` = attempt + hints).
  - Check marks a correct answer green.
  - A wrong answer turns red and shows **Show**, **Try again** and **Mark as correct**.
  - Show reveals the answer, keeps it red and leaves only **Try again**, which resets the word to its initial state.
- Keyboard: the app is edge-to-edge, so Android doesn't resize the window for the keyboard. Use `react-native-keyboard-controller` (`KeyboardAwareScrollView` / FlatList) so focused inputs stay visible. Check RN 0.88 support when adding it.

## Reuse

- `useFormSheet`, `nameForm` / `wordForm`, `useActionMenu`, `TextButton`, `IconButton`, `confirmDelete`.
- `useQuery` + `notifyChanged('words')`.
- `normalizeTerm` (`src/domain/term.ts`), and the `plural` helper.
- `test-utils/sqliteAdapter.ts` for DB tests, and `migrate(db, target)` for migration tests.

## Verification

- `npx tsc --noEmit`, `npm run lint`, `npm test`. New tests:
  - Migration v2→v3, plus `setLearned` ordering (`__tests__/db.test.ts`).
  - Example pairs, and picking a suggestion sets fields (`__tests__/FormSheet.test.tsx`).
  - Study reducer, including shuffle, hints, wrong → show → retry, mark as correct, and hide learned.
  - `format.ts` with real JSONL fixture lines for Apfel, essen and gehen (in `test-utils/fixtures/`).
  - Dictionary queries against a tiny DB built from those fixtures.
- `npm run dict:fetch && npm run dict:build`: check the file sizes, and query `Apfel`, `Äpf`, `essen`, `gehen`, `apple`, `go` with `node:sqlite`.
- `npx react-native bundle --platform android …` to make sure Metro resolves the new dependencies.
- `cd android && ./gradlew assembleDebug`, because the native dependencies are new (fs, keyboard-controller).
- The user tests on their Android phone. The emulator can't be used: adb reports it as unauthorized, and restarting adb would drop the phone. Checklist:
  - Download the de dictionary.
  - Type "Apf" and pick "der Apfel, die Äpfel".
  - Pick a translation gloss.
  - Add an example pair.
  - Swipe a word to edit or delete it, and tap a word to expand it.
  - Mark a word Learned, then To revise.
  - Select words and run each of the 4 modes.
- Update `.claude/PLAN.md` (steps, decisions) and `.claude/CLAUDE.md` (dictionary scripts, study architecture).
