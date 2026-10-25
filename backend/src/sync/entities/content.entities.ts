import { Column, Entity } from 'typeorm';
import type { ExampleRecord } from '../protocol.ts';
import { SyncedEntity, ms } from './synced.entity.ts';

/**
 * The user's data, mirrored from the app (see its `src/db/migrations.ts`).
 * There are no foreign keys between these tables: each device pushes its rows
 * in any order, and the app skips rows whose parent it doesn't have.
 */

/** A custom language; `id` is its code. */
@Entity('languages')
export class LanguageEntity extends SyncedEntity {
  @Column({ type: 'varchar', length: 500 })
  name: string;

  @Column(ms('created_at'))
  createdAt: number;
}

@Entity('sets')
export class SetEntity extends SyncedEntity {
  @Column({ name: 'language_code', type: 'varchar', length: 100 })
  languageCode: string;

  @Column({ type: 'varchar', length: 500 })
  name: string;

  @Column(ms('pinned_at', true))
  pinnedAt: number | null;

  @Column(ms('created_at'))
  createdAt: number;

  @Column(ms('updated_at'))
  updatedAt: number;
}

@Entity('folders')
export class FolderEntity extends SyncedEntity {
  @Column({ name: 'language_code', type: 'varchar', length: 100 })
  languageCode: string;

  @Column({ type: 'varchar', length: 500 })
  name: string;

  /** Manual (drag and drop) order within the language. */
  @Column({ type: 'integer' })
  position: number;

  @Column(ms('pinned_at', true))
  pinnedAt: number | null;

  @Column(ms('created_at'))
  createdAt: number;

  @Column(ms('updated_at'))
  updatedAt: number;
}

/** A set in a folder; `id` is `folderId:setId`. */
@Entity('folder_sets')
export class FolderSetEntity extends SyncedEntity {
  @Column({ name: 'folder_id', type: 'varchar', length: 100 })
  folderId: string;

  @Column({ name: 'set_id', type: 'varchar', length: 100 })
  setId: string;

  @Column(ms('added_at'))
  addedAt: number;
}

@Entity('words')
export class WordEntity extends SyncedEntity {
  @Column({ name: 'set_id', type: 'varchar', length: 100 })
  setId: string;

  @Column({ name: 'language_code', type: 'varchar', length: 100 })
  languageCode: string;

  @Column({ type: 'text' })
  term: string;

  /** trim + collapse whitespace + NFC; case-sensitive (as in the app). */
  @Column({ name: 'term_norm', type: 'text' })
  termNorm: string;

  @Column({ type: 'text' })
  translation: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  examples: ExampleRecord[];

  /** Markdown; '' = none. */
  @Column({ type: 'text', default: '' })
  description: string;

  @Column(ms('learned_at', true))
  learnedAt: number | null;

  @Column(ms('sort_at'))
  sortAt: number;

  @Column(ms('created_at'))
  createdAt: number;

  @Column(ms('updated_at'))
  updatedAt: number;
}

@Entity('rules')
export class RuleEntity extends SyncedEntity {
  @Column({ name: 'set_id', type: 'varchar', length: 100 })
  setId: string;

  @Column({ name: 'language_code', type: 'varchar', length: 100 })
  languageCode: string;

  @Column({ type: 'text', default: '' })
  title: string;

  /** Markdown. */
  @Column({ type: 'text' })
  text: string;

  @Column(ms('created_at'))
  createdAt: number;

  @Column(ms('updated_at'))
  updatedAt: number;
}
