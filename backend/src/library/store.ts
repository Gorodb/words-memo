/**
 * Reads and writes the user's rows for the website's routes, in the same
 * tables and the same way `/sync` does (see SyncService):
 *
 * - every row written by one request gets the user's next sync `version`,
 *   under the same row lock on the user, so phones pull website changes with
 *   their next sync;
 * - deletions are tombstones (`deleted = true`);
 * - cascades (a set's words, rules and folder links) are written explicitly,
 *   since the content tables have no foreign keys.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, type EntityManager, type FindOptionsWhere } from 'typeorm';
import { EventsService } from '../events/events.service.ts';
import { User } from '../users/user.entity.ts';
import {
  FolderEntity,
  FolderSetEntity,
  LanguageEntity,
  RuleEntity,
  SetEntity,
  WordEntity,
} from '../sync/entities/content.entities.ts';
import type { SyncedEntity } from '../sync/entities/synced.entity.ts';
import { recordKey, type SyncRecords, type SyncTable } from '../sync/protocol.ts';
import { chunks, toRecord, toRow } from '../sync/records.ts';

const ENTITY: { [T in SyncTable]: new () => SyncedEntity } = {
  languages: LanguageEntity,
  sets: SetEntity,
  folders: FolderEntity,
  folderSets: FolderSetEntity,
  words: WordEntity,
  rules: RuleEntity,
};

const CHUNK = 500;

export const LibraryErrorCode = {
  notFound: 'NOT_FOUND',
  pinLimit: 'PIN_LIMIT',
  languageNameTaken: 'LANGUAGE_NAME_TAKEN',
  badBackup: 'BAD_BACKUP',
} as const;

/** Filter on a record's own fields (camelCase, as in the entities). */
type Where<T extends SyncTable> = Partial<Record<keyof SyncRecords[T], unknown>>;

/** Live (not deleted) rows of one user. */
export class Reader {
  constructor(
    protected readonly manager: EntityManager,
    readonly userId: string,
  ) {}

  async list<T extends SyncTable>(
    table: T,
    where: Where<T> = {},
  ): Promise<SyncRecords[T][]> {
    const filter: Record<string, unknown> = { userId: this.userId, deleted: false };
    for (const [key, value] of Object.entries(where)) {
      filter[key === 'code' ? 'id' : key] = Array.isArray(value) ? In(value) : value;
    }
    const rows = await this.manager
      .getRepository(ENTITY[table])
      .find({ where: filter as FindOptionsWhere<SyncedEntity> });
    return rows.map(row =>
      toRecord(table, row as unknown as Record<string, unknown>),
    );
  }

  /** The row, or null when it doesn't exist (or was deleted). */
  async find<T extends SyncTable>(
    table: T,
    key: string,
  ): Promise<SyncRecords[T] | null> {
    const row = await this.manager.getRepository(ENTITY[table]).findOne({
      where: { userId: this.userId, id: key, deleted: false },
    });
    return row ? toRecord(table, row as unknown as Record<string, unknown>) : null;
  }

  /** The row, or 404 NOT_FOUND. */
  async get<T extends SyncTable>(table: T, key: string): Promise<SyncRecords[T]> {
    const record = await this.find(table, key);
    if (!record) {
      throw new NotFoundException({
        code: LibraryErrorCode.notFound,
        message: 'It was deleted, maybe on another device',
      });
    }
    return record;
  }

  /** Live rows per value of `column` (e.g. words per set). */
  async countBy<T extends SyncTable>(
    table: T,
    column: 'setId' | 'folderId',
    where: Where<T> = {},
  ): Promise<Map<string, number>> {
    let query = this.manager
      .getRepository(ENTITY[table])
      .createQueryBuilder('e')
      .select(`e.${column}`, 'key')
      .addSelect('COUNT(*)', 'n')
      .where('e.userId = :userId AND e.deleted = false', { userId: this.userId })
      .groupBy(`e.${column}`);
    for (const [key, value] of Object.entries(where)) {
      query = query.andWhere(`e.${key} = :${key}`, { [key]: value });
    }
    const rows = await query.getRawMany<{ key: string; n: string }>();
    return new Map(rows.map(r => [r.key, Number(r.n)]));
  }
}

/** Reader that can also write, inside one transaction with one version. */
export class Writer extends Reader {
  private readonly written = new Set<SyncTable>();

  constructor(
    manager: EntityManager,
    userId: string,
    readonly version: number,
  ) {
    super(manager, userId);
  }

  get changed(): boolean {
    return this.written.size > 0;
  }

  /** Tables this transaction wrote rows to. */
  get tables(): SyncTable[] {
    return [...this.written];
  }

  /** Inserts or replaces rows (as /sync does for a phone's push). */
  async put<T extends SyncTable>(table: T, ...records: SyncRecords[T][]): Promise<void> {
    if (records.length === 0) {
      return;
    }
    this.written.add(table);
    const repository = this.manager.getRepository(ENTITY[table]);
    for (const part of chunks(records, CHUNK)) {
      await repository.upsert(
        part.map(record => toRow(table, record, this.userId, this.version)),
        { conflictPaths: ['userId', 'id'], skipUpdateIfNoValuesChanged: false },
      );
    }
  }

  /** Tombstones rows by key. */
  async remove(table: SyncTable, keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }
    this.written.add(table);
    const repository = this.manager.getRepository(ENTITY[table]);
    for (const part of chunks(keys, CHUNK)) {
      await repository.update(
        { userId: this.userId, id: In(part), deleted: false },
        { deleted: true, version: this.version },
      );
    }
  }

  /** Deletes a set with its words, rules and folder links (the app's ON DELETE CASCADE). */
  async removeSets(setIds: string[]): Promise<void> {
    if (setIds.length === 0) {
      return;
    }
    for (const table of ['words', 'rules', 'folderSets'] as const) {
      const rows = await this.list(table, { setId: setIds });
      await this.remove(
        table,
        rows.map(r => recordKey(table, r)),
      );
    }
    await this.remove('sets', setIds);
  }

  /** Deletes folders with their set links; the sets stay. */
  async removeFolders(folderIds: string[]): Promise<void> {
    if (folderIds.length === 0) {
      return;
    }
    const links = await this.list('folderSets', { folderId: folderIds });
    await this.remove(
      'folderSets',
      links.map(l => recordKey('folderSets', l)),
    );
    await this.remove('folders', folderIds);
  }
}

@Injectable()
export class LibraryStore {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly events: EventsService,
  ) {}

  read<R>(userId: string, work: (reader: Reader) => Promise<R>): Promise<R> {
    return work(new Reader(this.dataSource.manager, userId));
  }

  /**
   * Runs `work` in a transaction that holds the user's row lock (requests of
   * one user, including /sync, run one at a time). Rows it writes get the
   * next sync version; the user's version only moves when something changed.
   */
  write<R>(userId: string, work: (writer: Writer) => Promise<R>): Promise<R> {
    return this.dataSource.transaction(async manager => {
      const user = await manager
        .getRepository(User)
        .createQueryBuilder('u')
        .setLock('pessimistic_write')
        .where('u.id = :userId', { userId })
        .getOneOrFail();
      const writer = new Writer(manager, userId, user.syncVersion + 1);
      const result = await work(writer);
      if (writer.changed) {
        await manager.update(User, { id: userId }, { syncVersion: writer.version });
        // Phones and other tabs hear about it once the transaction commits.
        await this.events.publish(manager, userId, writer.version, writer.tables);
      }
      return result;
    });
  }
}
