import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, type EntityManager } from 'typeorm';
import { User } from '../users/user.entity.ts';
import {
  FolderEntity,
  FolderSetEntity,
  LanguageEntity,
  RuleEntity,
  SetEntity,
  WordEntity,
} from './entities/content.entities.ts';
import type { SyncedEntity } from './entities/synced.entity.ts';
import {
  emptyChanges,
  SYNC_TABLES,
  type SyncRequest,
  type SyncResponse,
  type SyncTable,
} from './protocol.ts';
import { chunks, dedupe, toRecord, toRow } from './records.ts';

const ENTITY: { [T in SyncTable]: new () => SyncedEntity } = {
  languages: LanguageEntity,
  sets: SetEntity,
  folders: FolderEntity,
  folderSets: FolderSetEntity,
  words: WordEntity,
  rules: RuleEntity,
};

/** Rows per statement; keeps bound parameters far below Postgres' 65535. */
const CHUNK = 500;

export const SyncErrorCode = {
  /** The cursor is newer than the server (its DB was reset): sync in full. */
  cursorAhead: 'SYNC_CURSOR_AHEAD',
} as const;

/**
 * One request = push the phone's changes, then pull the other devices'.
 *
 * - The phone is the source of truth: pushed rows overwrite the server's,
 *   whatever their state.
 * - Every row written by one request gets the same new `version`
 *   (`users.sync_version + 1`). Requests of one user are serialized by a row
 *   lock on the user, so `version > cursor` returns exactly what other
 *   requests wrote since the device's last sync.
 * - Rows written by this request are left out of the pull, so the phone's
 *   version of them wins.
 */
@Injectable()
export class SyncService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  sync(userId: string, request: SyncRequest): Promise<SyncResponse> {
    return this.dataSource.transaction(async manager => {
      const user = await manager
        .getRepository(User)
        .createQueryBuilder('u')
        .setLock('pessimistic_write')
        .where('u.id = :userId', { userId })
        .getOneOrFail();

      if (request.cursor !== null && request.cursor > user.syncVersion) {
        throw new ConflictException({
          code: SyncErrorCode.cursorAhead,
          message: 'The server lost the sync history; sync everything again',
        });
      }

      const pushes = SYNC_TABLES.some(
        t =>
          request.changes[t].upserts.length > 0 ||
          request.changes[t].deletes.length > 0,
      );
      const version = user.syncVersion + 1;
      if (pushes) {
        for (const table of SYNC_TABLES) {
          await this.push(manager, table, userId, version, request);
        }
        await manager.update(User, { id: userId }, { syncVersion: version });
      }

      const changes = emptyChanges();
      for (const table of SYNC_TABLES) {
        await this.pull(manager, table, userId, request.cursor, version, changes);
      }
      return { cursor: pushes ? version : user.syncVersion, changes };
    });
  }

  private async push(
    manager: EntityManager,
    table: SyncTable,
    userId: string,
    version: number,
    request: SyncRequest,
  ): Promise<void> {
    const repository = manager.getRepository(ENTITY[table]);
    const { upserts, deletes } = dedupe(table, request.changes[table]);
    for (const part of chunks(upserts, CHUNK)) {
      await repository.upsert(
        part.map(record => toRow(table, record, userId, version)),
        { conflictPaths: ['userId', 'id'], skipUpdateIfNoValuesChanged: false },
      );
    }
    // Unknown keys are ignored: no other device can have those rows.
    for (const part of chunks(deletes, CHUNK)) {
      await repository.update(
        { userId, id: In(part), deleted: false },
        { deleted: true, version },
      );
    }
  }

  private async pull(
    manager: EntityManager,
    table: SyncTable,
    userId: string,
    cursor: number | null,
    version: number,
    changes: SyncResponse['changes'],
  ): Promise<void> {
    const query = manager
      .getRepository(ENTITY[table])
      .createQueryBuilder('e')
      .where('e.userId = :userId', { userId })
      .andWhere('e.version > :cursor', { cursor: cursor ?? 0 })
      .andWhere('e.version <> :version', { version });
    if (cursor === null) {
      // A full sync only needs what exists.
      query.andWhere('e.deleted = false');
    }
    for (const row of await query.getMany()) {
      if (row.deleted) {
        changes[table].deletes.push(row.id);
      } else {
        (changes[table].upserts as unknown[]).push(
          toRecord(table, row as unknown as Record<string, unknown>),
        );
      }
    }
  }
}
