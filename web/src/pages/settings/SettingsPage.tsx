import { useState } from 'react';
import { Check } from 'lucide-react';
import { apiErrorCode } from '../../api/api';
import { PageBody, PageHeader } from '../../app/Layout';
import { API_URL } from '../../config/api';
import type { ThemeMode } from '../../domain/types';
import { describeSummary, importsAnything } from '../../features/backup/summary';
import { exportAll, importBackup, previewImport, signOut } from '../../store/actions';
import { useAppDispatch, useAppSelector } from '../../store';
import { settingsActions } from '../../store/settingsSlice';
import { ListRow, SectionHeader } from '../../ui/common';
import { errorText, showAlert, showMenu } from '../../ui/dialogs';
import { canShareFiles, downloadJson, pickJsonFile, shareOrDownload } from '../sets/files';
import { languageNote } from '../sets/shareActions';

const THEME_OPTIONS: Array<{ mode: ThemeMode; label: string }> = [
  { mode: 'system', label: 'System default' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
];

const backupName = () => `words-backup-${new Date().toISOString().slice(0, 10)}.json`;

export function SettingsPage() {
  const dispatch = useAppDispatch();
  const themeMode = useAppSelector(s => s.settings.themeMode);
  const activeLanguage = useAppSelector(s => s.settings.activeLanguage);
  const email = useAppSelector(s => s.auth.email);
  const [busy, setBusy] = useState(false);

  const confirmSignOut = () =>
    showAlert(
      'Sign out?',
      'Your words stay in your account. Sign in again to see them here.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
      ],
    );

  const save = async (share: boolean) => {
    try {
      const file = await exportAll();
      if (share) {
        await shareOrDownload(file, backupName(), 'Words backup');
      } else {
        downloadJson(file, backupName());
      }
    } catch (e) {
      showAlert('Export failed', errorText(e));
    }
  };

  const openExport = () => {
    if (!canShareFiles()) {
      void save(false);
      return;
    }
    showMenu({
      title: 'Export',
      items: [
        { label: 'Save to device', onPress: () => void save(false) },
        { label: 'Share', onPress: () => void save(true) },
      ],
    });
  };

  const startImport = async () => {
    setBusy(true);
    try {
      const file = await pickJsonFile();
      if (file === null) {
        return;
      }
      const { summary } = await previewImport(file);
      if (!importsAnything(summary)) {
        showAlert('Nothing to import', describeSummary(summary));
        return;
      }
      showAlert(
        'Import this backup?',
        `${describeSummary(
          summary,
        )}\n\nWords you already have get the translation and examples from the file. Nothing is deleted.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: () =>
              importBackup(file)
                .then(result =>
                  showAlert(
                    'Import finished',
                    describeSummary(result.summary) + languageNote(result, activeLanguage),
                  ),
                )
                .catch(e => showAlert('Import failed', errorText(e))),
          },
        ],
      );
    } catch (e) {
      showAlert(
        apiErrorCode(e) === 'BAD_BACKUP' ? 'Not a words backup' : 'Import failed',
        errorText(e),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" />
      <PageBody>
        <SectionHeader title="Account" />
        <div className="flex flex-col gap-2">
          <ListRow
            title={email}
            subtitle="Your words are saved in your account and sync with the phone app."
          />
          <ListRow title={<span className="text-danger">Sign out</span>} onPress={confirmSignOut} />
        </div>

        <SectionHeader title="Appearance" />
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          {THEME_OPTIONS.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => dispatch(settingsActions.themeModeChanged(mode))}
              className="flex w-full items-center justify-between border-b border-line px-4 py-3 text-left last:border-0 hover:bg-surface-2"
            >
              <span className="font-medium">{label}</span>
              {themeMode === mode ? <Check size={18} className="text-primary" /> : null}
            </button>
          ))}
        </div>

        <SectionHeader title="Backup" />
        <div className="flex flex-col gap-2">
          <ListRow
            title="Export"
            subtitle="All languages, folders, sets and words in one file"
            onPress={openExport}
          />
          <ListRow
            title={busy ? 'Reading the file…' : 'Import'}
            subtitle="Add words from a backup or a shared set file. Nothing is deleted."
            onPress={busy ? undefined : () => void startImport()}
          />
        </div>

        <SectionHeader title="About" />
        <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          <p>
            Backup files are the same as in the phone app, so you can move words
            between them either way.
          </p>
          <p className="mt-2">
            Dictionaries: Wiktionary (CC BY-SA 4.0), extracted by kaikki.org /
            wiktextract.
          </p>
          <p className="mt-2">Server: {API_URL}</p>
        </div>
      </PageBody>
    </>
  );
}
