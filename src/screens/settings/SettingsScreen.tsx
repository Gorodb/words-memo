import React, { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import {
  Check,
  Download,
  LogIn,
  LogOut,
  RefreshCw,
  Upload,
} from 'lucide-react-native';
import { useActionMenu } from '../../components/ActionMenuSheet';
import { signInForm } from '../../components/formSheet/forms';
import { useFormSheet } from '../../components/formSheet/FormSheet';
import { ListRow } from '../../components/ListRow';
import { SectionHeader } from '../../components/SectionHeader';
import { DICTIONARY_ATTRIBUTION } from '../../config/languages';
import {
  pickBackup,
  prepareImport,
  runImport,
  saveFullBackup,
  shareFullBackup,
} from '../../features/backup/backupFiles';
import {
  describeSummary,
  importsAnything,
} from '../../features/backup/merge';
import {
  register,
  signIn,
  signOut,
  syncNow,
  useSyncStore,
} from '../../features/sync/syncStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useAppTheme } from '../../theme/ThemeProvider';
import type { ThemeMode } from '../../domain/types';

const THEME_OPTIONS: Array<{ mode: ThemeMode; label: string }> = [
  { mode: 'system', label: 'System default' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
];

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function ask(
  title: string,
  message: string,
  confirm: string,
): Promise<boolean> {
  return new Promise(resolve =>
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirm, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

function syncedAt(time: number): string {
  const date = new Date(time);
  const clock = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  return date.toDateString() === new Date().toDateString()
    ? clock
    : `${date.toLocaleDateString()} ${clock}`;
}

function syncSubtitle({
  status,
  lastSyncedAt,
  message,
}: ReturnType<typeof useSyncStore.getState>): string {
  switch (status) {
    case 'syncing':
      return 'Syncing…';
    case 'offline':
      return 'Offline. Changes sync when the connection is back.';
    case 'error':
      return `Sync failed: ${message ?? 'unknown error'}. Retrying…`;
    default:
      return lastSyncedAt
        ? `Synced ${syncedAt(lastSyncedAt)}. Tap to sync now.`
        : 'Waiting to sync…';
  }
}

/** Sign in, or offer to create the account when the email is unknown. */
async function signInOrRegister(
  email: string,
  password: string,
): Promise<boolean> {
  if ((await signIn(email, password)) === 'signedIn') {
    return true;
  }
  const create = await ask(
    'No account with this email',
    `Create an account for ${email} with this password?`,
    'Create account',
  );
  if (!create) {
    return false; // keep the sheet open to fix the email
  }
  await register(email, password);
  return true;
}

export function SettingsScreen() {
  const { colors } = useAppTheme();
  const themeMode = useSettingsStore(s => s.themeMode);
  const setThemeMode = useSettingsStore(s => s.setThemeMode);
  const sync = useSyncStore();
  const menu = useActionMenu();
  const sheet = useFormSheet();
  const [busy, setBusy] = useState(false);

  const openSignIn = () =>
    sheet.open(signInForm({ onSubmit: signInOrRegister }));

  const confirmSignOut = () =>
    Alert.alert(
      'Sign out?',
      'Your words stay on this phone and the app keeps working offline. Sign in again to resume syncing.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: signOut },
      ],
    );

  /** Runs one backup action at a time and reports failures. */
  const run = async (title: string, action: () => Promise<void>) => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await action();
    } catch (e) {
      Alert.alert(title, errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const openExport = () =>
    menu.open({
      title: 'Export all words',
      items: [
        {
          label: 'Save to device',
          onPress: () =>
            run('Export failed', async () => {
              if (await saveFullBackup()) {
                Alert.alert('Backup saved');
              }
            }),
        },
        {
          label: 'Share',
          onPress: () => run('Export failed', shareFullBackup),
        },
      ],
    });

  const startImport = () =>
    run('Import failed', async () => {
      const backup = await pickBackup();
      if (!backup) {
        return; // cancelled
      }
      const plan = prepareImport(backup);
      const { summary } = plan;
      if (!importsAnything(summary)) {
        Alert.alert('Nothing to import', describeSummary(summary));
        return;
      }
      Alert.alert(
        'Import this backup?',
        `${describeSummary(
          summary,
        )}\n\nUpdated words get the translation and examples from the file. Nothing is deleted.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: () =>
              run('Import failed', async () => {
                await runImport(plan);
                Alert.alert('Import finished', describeSummary(summary));
              }),
          },
        ],
      );
    });

  return (
    <ScrollView>
      <SectionHeader title="Account" />
      {sync.email ? (
        <>
          <ListRow
            title={sync.email}
            subtitle={syncSubtitle(sync)}
            onPress={syncNow}
            right={<RefreshCw color={colors.textSecondary} size={20} />}
          />
          <ListRow
            title="Sign out"
            onPress={confirmSignOut}
            right={<LogOut color={colors.textSecondary} size={20} />}
          />
        </>
      ) : (
        <ListRow
          title="Sign in"
          subtitle={
            sync.message ??
            'Sync your words across devices. Without an account everything stays on this phone.'
          }
          onPress={openSignIn}
          right={<LogIn color={colors.textSecondary} size={20} />}
        />
      )}

      <SectionHeader title="Appearance" />
      {THEME_OPTIONS.map(({ mode, label }) => (
        <ListRow
          key={mode}
          title={label}
          onPress={() => setThemeMode(mode)}
          right={
            mode === themeMode ? (
              <Check color={colors.primary} size={22} />
            ) : null
          }
        />
      ))}

      <SectionHeader title="Backup" />
      <ListRow
        title="Export"
        subtitle="All languages, folders, sets and words in one file"
        onPress={openExport}
        right={<Upload color={colors.textSecondary} size={20} />}
      />
      <ListRow
        title="Import"
        subtitle="Add words from a backup or a shared set. Nothing is deleted."
        onPress={startImport}
        right={<Download color={colors.textSecondary} size={20} />}
      />

      <SectionHeader title="About" />
      <ListRow title="Dictionaries" subtitle={DICTIONARY_ATTRIBUTION} />
      {menu.element}
      {sheet.element}
    </ScrollView>
  );
}
