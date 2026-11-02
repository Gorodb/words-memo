import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { CircleEllipsis, ListPlus, Plus } from 'lucide-react';
import {
  useGetFolderQuery,
  useGetFolderSetsQuery,
  useGetSetsQuery,
} from '../../api/api';
import type { SetView } from '../../api/types';
import { PageBody, PageHeader } from '../../app/Layout';
import { useLanguageName } from '../../app/useLanguages';
import { createSet, setInFolder, setSetPinned } from '../../store/actions';
import { Button, IconButton } from '../../ui/Button';
import { EmptyState, ListRow, LoadState } from '../../ui/common';
import { attempt, showForm, showMenu } from '../../ui/dialogs';
import { nameForm } from '../../ui/forms';
import { pinLabel, togglePinned } from '../../ui/itemActions';
import { Sheet } from '../../ui/Sheet';
import { setContents } from '../../utils/plural';
import { folderMenu } from './FoldersPage';

/** Sets in one folder; add sets with the picker, remove them from the folder. */
export function FolderPage() {
  const { folderId = '' } = useParams();
  const navigate = useNavigate();
  const { data: folder, error, isLoading } = useGetFolderQuery(folderId);
  const { data: sets } = useGetFolderSetsQuery(folderId);
  const languageName = useLanguageName(folder?.languageCode);
  const [picking, setPicking] = useState(false);

  if (!folder) {
    // Deleted (maybe on another device): back to the list.
    return (error as { status?: number } | undefined)?.status === 404 ? (
      <Navigate to="/folders" replace />
    ) : (
      <>
        <PageHeader title="Folder" back="/folders" />
        <LoadState loading={isLoading} error={error} />
      </>
    );
  }

  const openCreate = () =>
    showForm(
      nameForm({
        title: 'New set',
        placeholder: 'Set name',
        onSubmit: name => createSet(folder.languageCode, name, folder.id),
      }),
    );

  const setMenu = (set: SetView) =>
    showMenu({
      title: set.name,
      items: [
        {
          label: pinLabel(set.pinnedAt),
          onPress: () => void togglePinned(setSetPinned, set),
        },
        {
          label: 'Remove from folder',
          destructive: true,
          onPress: () =>
            attempt('Could not remove the set', setInFolder(folder.id, set.id, false)),
        },
      ],
    });

  return (
    <>
      <PageHeader
        title={folder.name}
        subtitle={languageName}
        back="/folders"
        actions={
          <>
            <IconButton icon={ListPlus} label="Add sets" onClick={() => setPicking(true)} />
            <IconButton icon={Plus} label="New set in this folder" onClick={openCreate} />
            <IconButton
              icon={CircleEllipsis}
              label="Folder actions"
              onClick={() => folderMenu(folder, () => navigate('/folders', { replace: true }))}
            />
          </>
        }
      />
      <PageBody>
        {!sets ? (
          <LoadState loading />
        ) : sets.length === 0 ? (
          <EmptyState
            title="No sets in this folder"
            hint="Add existing sets, or create a new one here."
            action={
              <div className="flex gap-2">
                <Button variant="secondary" icon={ListPlus} onClick={() => setPicking(true)}>
                  Add sets
                </Button>
                <Button icon={Plus} onClick={openCreate}>
                  New set
                </Button>
              </div>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {sets.map(set => (
              <ListRow
                key={set.id}
                title={set.name}
                subtitle={setContents(set)}
                pinned={set.pinnedAt !== null}
                chevron
                onPress={() => navigate(`/sets/${set.id}`)}
                onMenu={() => setMenu(set)}
              />
            ))}
          </div>
        )}
      </PageBody>
      {picking ? (
        <SetPicker
          folderId={folder.id}
          folderName={folder.name}
          languageCode={folder.languageCode}
          inFolder={new Set(folder.setIds)}
          onClose={() => setPicking(false)}
          onCreate={openCreate}
        />
      ) : null}
    </>
  );
}

/** Every set of the folder's language with a checkbox; changes apply at once. */
function SetPicker({
  folderId,
  folderName,
  languageCode,
  inFolder,
  onClose,
  onCreate,
}: {
  folderId: string;
  folderName: string;
  languageCode: string;
  inFolder: ReadonlySet<string>;
  onClose: () => void;
  onCreate: () => void;
}) {
  const { data: sets } = useGetSetsQuery(languageCode);
  const [filter, setFilter] = useState('');
  /** Checked state while the request runs (the list refreshes after it). */
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const shown = (sets ?? []).filter(s =>
    s.name.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()),
  );
  const toggle = (setId: string, checked: boolean) => {
    setPending(p => ({ ...p, [setId]: checked }));
    setInFolder(folderId, setId, checked)
      .catch(() => setPending(p => ({ ...p, [setId]: !checked })))
      .finally(() =>
        setPending(({ [setId]: _done, ...rest }) => rest),
      );
  };
  return (
    <Sheet
      title={`Sets in "${folderName}"`}
      onDismiss={onClose}
      footer={
        <>
          <Button
            variant="secondary"
            icon={Plus}
            onClick={() => {
              onClose();
              onCreate();
            }}
          >
            New set
          </Button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      {(sets?.length ?? 0) > 6 ? (
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Find a set"
          className="mb-2 w-full rounded-xl border border-line bg-bg px-3 py-2 outline-none focus:border-primary"
        />
      ) : null}
      {!sets ? (
        <LoadState loading />
      ) : sets.length === 0 ? (
        <p className="py-6 text-center text-muted">No sets yet. Create one.</p>
      ) : (
        <div className="-mx-2 flex flex-col">
          {shown.map(set => (
            <label
              key={set.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-2"
            >
              <input
                type="checkbox"
                className="size-5 accent-primary"
                checked={pending[set.id] ?? inFolder.has(set.id)}
                onChange={e => toggle(set.id, e.target.checked)}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{set.name}</span>
                <span className="block text-sm text-muted">{setContents(set)}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </Sheet>
  );
}
