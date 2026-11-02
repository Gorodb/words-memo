/**
 * Sharing and importing sets: Share code / Share as file in set menus,
 * Sets ⋯ → Import by code (also /s/<CODE> links), Settings → Import. The
 * server plans and applies imports with the app's merge rules.
 */
import { apiErrorCode } from '../../api/api';
import type { ImportPreview } from '../../api/types';
import type { ID, LanguageCode } from '../../domain/types';
import { safeFileName } from '../../features/backup/fileName';
import { describeSummary, importsAnything } from '../../features/backup/summary';
import {
  createShareCode,
  exportSet,
  importShare,
  previewShare,
} from '../../store/actions';
import { store } from '../../store';
import { libraryApi } from '../../api/api';
import { errorText, showAlert, type MenuItem } from '../../ui/dialogs';
import { shareOrDownload } from './files';

/** Share as file or by code. */
export function shareSetMenuItems(set: { id: ID; name: string }): MenuItem[] {
  return [
    { label: 'Share code', onPress: () => void shareSetByCode(set) },
    {
      label: 'Share as file',
      onPress: () =>
        exportSet(set.id)
          .then(file => shareOrDownload(file, `${safeFileName(set.name)}.json`, `Words: ${set.name}`))
          .catch(e => showAlert('Could not share the set', errorText(e))),
    },
  ];
}

/** Link that opens this site with the code filled in. */
export const shareLink = (code: string) => `${window.location.origin}/s/${code}`;

const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

async function shareSetByCode(set: { id: ID; name: string }): Promise<void> {
  try {
    const created = await createShareCode(set.id);
    const code = formatCode(created.code);
    const text = `Set "${set.name}" in Words: open ${shareLink(code)} or, in the app, Sets → ⋯ → Import by code and enter ${code}`;
    showAlert(
      code,
      `The other person opens ${shareLink(code)}, or enters the code in Sets → ⋯ → Import by code. It works once, until ${new Date(
        created.expiresAt,
      ).toLocaleDateString()}.\n\nLater changes to the set aren't included.`,
      [
        { text: 'Done', style: 'cancel' },
        {
          text: 'share' in navigator ? 'Send code' : 'Copy message',
          onPress: () => void sendText(set.name, text),
        },
      ],
    );
  } catch (e) {
    showAlert(
      apiErrorCode(e) === 'TOO_MANY_SHARES' ? 'Too many share codes' : 'Could not share the set',
      errorText(e),
    );
  }
}

async function sendText(setName: string, text: string): Promise<void> {
  if ('share' in navigator) {
    try {
      await navigator.share({ title: `Words: ${setName}`, text });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return;
      }
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    showAlert('Copied', 'The message with the code is on the clipboard.');
  } catch (e) {
    showAlert('Could not copy the message', errorText(e));
  }
}

/** Where the imported sets land, when it isn't the active language. */
export function languageNote(preview: ImportPreview, active: LanguageCode): string {
  const other = preview.languageCodes.find(code => code !== active);
  if (!other) {
    return '';
  }
  const languages = libraryApi.endpoints.getLanguages.select()(store.getState()).data ?? [];
  const name = languages.find(l => l.code === other)?.name ?? other;
  return `\n\nThe set is in ${name}: switch to it in Languages.`;
}

const setNames = (preview: ImportPreview) =>
  preview.setNames.map(n => `"${n}"`).join(', ') || 'this set';

/**
 * Previews the set behind the code (the code stays valid), then asks to
 * import. Only the confirmed import uses the code up. Throws for an unknown
 * code, so the code form stays open to fix it.
 */
export async function importSetByCode(code: string, activeLanguage: LanguageCode): Promise<void> {
  const clean = code.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(clean)) {
    throw new Error('A code has 8 letters and digits, like ABCD-EFGH.');
  }
  let preview: ImportPreview;
  try {
    preview = await previewShare(clean);
  } catch (e) {
    if (apiErrorCode(e) === 'SHARE_NOT_FOUND') {
      throw new Error(
        'No set has this code. It may be mistyped, already used or expired (codes work for 7 days).',
      );
    }
    throw e;
  }
  if (!importsAnything(preview.summary)) {
    showAlert('Nothing to import', describeSummary(preview.summary));
    return;
  }
  showAlert(
    `Import ${setNames(preview)}?`,
    `${describeSummary(
      preview.summary,
    )}\n\nWords you already have get the translation and examples from the shared set. Nothing is deleted. The code can't be used again.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Import',
        onPress: () =>
          importShare(clean)
            .then(result =>
              showAlert(
                'Import finished',
                describeSummary(result.summary) + languageNote(result, activeLanguage),
              ),
            )
            .catch(e => showAlert('Could not import', errorText(e))),
      },
    ],
  );
}

