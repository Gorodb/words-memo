/**
 * Share-by-code flows with their alerts: Set screen ⋯ → Share set → Share code,
 * and Sets tab ⋯ → Import by code.
 */
import { Alert } from 'react-native';
import {
  prepareImport,
  runImport,
  shareSet,
} from '../../features/backup/backupFiles';
import {
  describeSummary,
  importsAnything,
} from '../../features/backup/merge';
import {
  createShareCode,
  fetchSharedSet,
  NotSignedInError,
  redeemSharedSet,
  sendShareCode,
} from '../../features/sharing/shareByCode';
import type { BackupFile, ID, LanguageCode } from '../../domain/types';
import { useSettingsStore } from '../../store/settingsStore';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Share as file or by code (code needs an account). */
export function shareSetMenuItems(set: { id: ID; name: string }) {
  return [
    {
      label: 'Share code',
      onPress: () => shareSetByCode(set),
    },
    {
      label: 'Share as file',
      onPress: () =>
        shareSet(set.id, set.name).catch(e =>
          Alert.alert('Could not share the set', errorText(e)),
        ),
    },
  ];
}

async function shareSetByCode(set: { id: ID; name: string }): Promise<void> {
  try {
    const shared = await createShareCode(set.id);
    Alert.alert(
      shared.code,
      `The other person enters this code in Sets → ⋯ → Import by code. It works once, until ${shared.expiresAt.toLocaleDateString()}.\n\nLater changes to the set aren't included.`,
      [
        { text: 'Done', style: 'cancel' },
        {
          text: 'Send code',
          onPress: () =>
            sendShareCode(set.name, shared).catch(e =>
              Alert.alert('Could not send the code', errorText(e)),
            ),
        },
      ],
    );
  } catch (e) {
    Alert.alert(
      e instanceof NotSignedInError
        ? 'Sign in to share by code'
        : 'Could not share the set',
      e instanceof NotSignedInError
        ? `${e.message} Without an account you can share the set as a file.`
        : errorText(e),
    );
  }
}

function setNames(backup: BackupFile): string {
  const names = backup.languages.flatMap(l => l.sets.map(s => `"${s.name}"`));
  return names.join(', ') || 'this set';
}

/** Where the imported set lands, when it isn't the active language. */
function languageNote(backup: BackupFile, active: LanguageCode): string {
  const other = backup.languages.find(
    l => l.sets.length > 0 && l.code !== active,
  );
  if (!other) {
    return '';
  }
  const name =
    useSettingsStore.getState().languages.find(l => l.code === other.code)
      ?.name ??
    other.name ??
    other.code;
  return `\n\nThe set is in ${name}: switch to it in Languages.`;
}

/**
 * Previews the set behind the code (the code stays valid), then asks to
 * import. Only the confirmed import uses the code up. Throws for an invalid
 * or unknown code, so the code sheet stays open to fix it.
 */
export async function importSetByCode(
  code: string,
  activeLanguage: LanguageCode,
): Promise<void> {
  const backup = await fetchSharedSet(code);
  const { summary } = prepareImport(backup);
  if (!importsAnything(summary)) {
    Alert.alert('Nothing to import', describeSummary(summary));
    return;
  }
  Alert.alert(
    `Import ${setNames(backup)}?`,
    `${describeSummary(
      summary,
    )}\n\nWords you already have get the translation and examples from the shared set. Nothing is deleted. The code can't be used again.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Import',
        onPress: () => redeemAndImport(code, activeLanguage),
      },
    ],
  );
}

async function redeemAndImport(
  code: string,
  activeLanguage: LanguageCode,
): Promise<void> {
  let backup: BackupFile;
  try {
    backup = await redeemSharedSet(code);
  } catch (e) {
    Alert.alert('Could not import', errorText(e));
    return;
  }
  await importRedeemed(backup, activeLanguage);
}

/** The code is used up now, so a failed write offers to retry with the same data. */
async function importRedeemed(
  backup: BackupFile,
  activeLanguage: LanguageCode,
): Promise<void> {
  try {
    // Planned again: the data may have changed while the alert was open.
    const plan = prepareImport(backup);
    await runImport(plan);
    Alert.alert(
      'Import finished',
      describeSummary(plan.summary) + languageNote(backup, activeLanguage),
    );
  } catch (e) {
    Alert.alert('Could not import', errorText(e), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Try again',
        onPress: () => importRedeemed(backup, activeLanguage),
      },
    ]);
  }
}
