import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Folder as FolderIcon, GripVertical, Plus } from 'lucide-react';
import { PageBody, PageHeader } from '../../app/Layout';
import {
  createFolder,
  deleteFolder,
  renameFolder,
  reorderFolders,
  setFolderPinned,
} from '../../store/actions';
import { useGetFoldersQuery } from '../../api/api';
import type { FolderView } from '../../api/types';
import { useActiveLanguage } from '../../app/useLanguages';
import { Button, IconButton } from '../../ui/Button';
import { EmptyState, ListRow, LoadState } from '../../ui/common';
import { attempt, showForm, showMenu } from '../../ui/dialogs';
import { nameForm } from '../../ui/forms';
import { confirmDelete, pinLabel, togglePinned } from '../../ui/itemActions';
import { plural } from '../../utils/plural';

export function folderMenu(folder: FolderView, onDeleted?: () => void) {
  showMenu({
    title: folder.name,
    items: [
      {
        label: pinLabel(folder.pinnedAt),
        onPress: () => togglePinned(setFolderPinned, folder),
      },
      {
        label: 'Rename',
        onPress: () =>
          showForm(
            nameForm({
              title: 'Rename folder',
              placeholder: 'Folder name',
              initialValue: folder.name,
              onSubmit: name => renameFolder(folder.id, name),
            }),
          ),
      },
      {
        label: 'Remove',
        destructive: true,
        onPress: () =>
          confirmDelete(
            folder.name,
            'The folder is removed. Its sets and words stay in the Sets tab.',
            async () => {
              await deleteFolder(folder.id);
              onDeleted?.();
            },
          ),
      },
    ],
  });
}

/** Folders of the active language, pinned first, in the user's manual order (drag to reorder). */
export function FoldersPage() {
  const language = useActiveLanguage();
  const { data, isLoading, error } = useGetFoldersQuery(language.code);
  const folders = data ?? [];
  const navigate = useNavigate();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const openCreate = useCallback(
    () =>
      showForm(
        nameForm({
          title: `New ${language.name} folder`,
          placeholder: 'Folder name',
          onSubmit: name => createFolder(language.code, name),
        }),
      ),
    [language],
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }
    const ids = folders.map(f => f.id);
    attempt(
      'Could not save the order',
      reorderFolders(
        language.code,
        arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))),
      ),
    );
  };

  return (
    <>
      <PageHeader
        title={`Folders · ${language.name}`}
        actions={<IconButton icon={Plus} label="Create folder" onClick={openCreate} />}
      />
      <PageBody>
        {!data ? (
          <LoadState loading={isLoading} error={error} />
        ) : folders.length === 0 ? (
          <EmptyState
            title={`No ${language.name} folders yet`}
            hint="Folders group your sets. A set can be in several folders."
            action={
              <Button icon={Plus} onClick={openCreate}>
                New folder
              </Button>
            }
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={folders.map(f => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-2">
                {folders.map(folder => (
                  <SortableFolder
                    key={folder.id}
                    folder={folder}
                    onOpen={() => navigate(`/folders/${folder.id}`)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
        {folders.length > 1 ? (
          <p className="px-1 pt-4 text-center text-xs text-muted">
            Drag the handle to reorder. Right click or long press for more.
          </p>
        ) : null}
      </PageBody>
    </>
  );
}

function SortableFolder({
  folder,
  onOpen,
}: {
  folder: FolderView;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: folder.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'relative z-10 opacity-90 shadow-lg' : ''}
    >
      <ListRow
        title={folder.name}
        subtitle={plural(folder.setCount, 'set')}
        pinned={folder.pinnedAt !== null}
        chevron
        onPress={onOpen}
        onMenu={() => folderMenu(folder)}
        left={
          <>
            <button
              type="button"
              aria-label={`Reorder ${folder.name}`}
              className="-ml-2 cursor-grab touch-none rounded-lg p-1 text-muted hover:text-fg active:cursor-grabbing"
              onClick={e => e.stopPropagation()}
              {...attributes}
              {...listeners}
            >
              <GripVertical size={18} />
            </button>
            <FolderIcon size={20} className="shrink-0 text-primary" />
          </>
        }
      />
    </div>
  );
}
