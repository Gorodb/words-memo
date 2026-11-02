import { useNavigate } from 'react-router';
import { CircleEllipsis, Layers, Plus } from 'lucide-react';
import { PageBody, PageHeader } from '../../app/Layout';
import { useGetSetsQuery } from '../../api/api';
import type { SetView } from '../../api/types';
import { useActiveLanguage } from '../../app/useLanguages';
import { createSet, deleteSet, renameSet, setSetPinned } from '../../store/actions';
import { Button, IconButton } from '../../ui/Button';
import { EmptyState, ListRow, LoadState } from '../../ui/common';
import { showForm, showMenu } from '../../ui/dialogs';
import { nameForm, shareCodeForm } from '../../ui/forms';
import { confirmDelete, pinLabel, togglePinned } from '../../ui/itemActions';
import { setContents } from '../../utils/plural';
import { importSetByCode, shareSetMenuItems } from './shareActions';

export function openImportByCode(languageCode: string, initialCode?: string) {
  showForm(
    shareCodeForm({
      initialCode,
      onSubmit: code => importSetByCode(code, languageCode),
    }),
  );
}

/** Menu of a set row: Pin / Rename / Share / Delete. */
export function setRowMenu(set: SetView, onDeleted?: () => void) {
  showMenu({
    title: set.name,
    items: [
      {
        label: pinLabel(set.pinnedAt),
        onPress: () => togglePinned(setSetPinned, set),
      },
      {
        label: 'Rename',
        onPress: () =>
          showForm(
            nameForm({
              title: 'Rename set',
              placeholder: 'Set name',
              initialValue: set.name,
              onSubmit: name => renameSet(set.id, name),
            }),
          ),
      },
      {
        label: 'Share',
        disabled: set.wordCount === 0 && set.ruleCount === 0,
        onPress: () =>
          showMenu({ title: `Share "${set.name}"`, items: shareSetMenuItems(set) }),
      },
      {
        label: 'Delete',
        destructive: true,
        onPress: () =>
          confirmDelete(
            set.name,
            set.wordCount > 0 || set.ruleCount > 0
              ? `${setContents(set)} will be deleted, and the set will be removed from all folders.`
              : 'The set will be removed from all folders.',
            async () => {
              await deleteSet(set.id);
              onDeleted?.();
            },
          ),
      },
    ],
  });
}

/** All sets of the active language, whether in folders or not. Pinned sets first. */
export function SetsPage() {
  const language = useActiveLanguage();
  const { data: sets, isLoading, error } = useGetSetsQuery(language.code);
  const navigate = useNavigate();

  const openCreate = () =>
    showForm(
      nameForm({
        title: `New ${language.name} set`,
        placeholder: 'Set name',
        onSubmit: async name => {
          const set = await createSet(language.code, name);
          navigate(`/sets/${set.id}`);
        },
      }),
    );

  return (
    <>
      <PageHeader
        title={`Sets · ${language.name}`}
        actions={
          <>
            <IconButton icon={Plus} label="Create set" onClick={openCreate} />
            <IconButton
              icon={CircleEllipsis}
              label="Sets actions"
              onClick={() =>
                showMenu({
                  title: `${language.name} sets`,
                  items: [
                    {
                      label: 'Import by code',
                      onPress: () => openImportByCode(language.code),
                    },
                  ],
                })
              }
            />
          </>
        }
      />
      <PageBody>
        {!sets ? (
          <LoadState loading={isLoading} error={error} />
        ) : sets.length === 0 ? (
          <EmptyState
            title={`No ${language.name} sets yet`}
            hint="A set is a list of words (and grammar rules) you learn together."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button icon={Plus} onClick={openCreate}>
                  New set
                </Button>
                <Button variant="secondary" onClick={() => openImportByCode(language.code)}>
                  Import by code
                </Button>
              </div>
            }
          />
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {sets.map(set => (
              <ListRow
                key={set.id}
                title={set.name}
                subtitle={setContents(set)}
                pinned={set.pinnedAt !== null}
                chevron
                left={<Layers size={20} className="shrink-0 text-primary" />}
                onPress={() => navigate(`/sets/${set.id}`)}
                onMenu={() => setRowMenu(set)}
              />
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
