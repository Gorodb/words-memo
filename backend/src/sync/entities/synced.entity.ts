import { Column, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { bigintNumber } from '../../database/columns.ts';
import { User } from '../../users/user.entity.ts';

/**
 * Columns every synced table has. Rows are keyed by (user, the app's own id).
 * Deletions stay as tombstones so other devices can pull them, and `version`
 * orders changes for pulls (`version > cursor`).
 */
@Index(['userId', 'version'])
export abstract class SyncedEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  /** The app's id; `folderId:setId` for folder links, the code for languages. */
  @PrimaryColumn({ type: 'varchar', length: 201 })
  id: string;

  @Column({ type: 'bigint', transformer: bigintNumber })
  version: number;

  @Column({ type: 'boolean', default: false })
  deleted: boolean;
}

/** Column options for epoch milliseconds. */
export const ms = (name: string, nullable = false) =>
  ({
    name,
    type: 'bigint',
    nullable,
    transformer: bigintNumber,
  }) as const;
