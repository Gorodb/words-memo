import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../users/user.entity.ts';
import type { SharePayload } from './share-payload.ts';

/**
 * A set shared by code: a snapshot taken when it was shared. Redeeming it
 * deletes the row; unused rows expire (SHARE_TTL_MS) and a weekly job removes
 * them.
 */
@Entity('shared_sets')
export class SharedSet {
  @PrimaryColumn({
    type: 'varchar',
    length: 16,
    primaryKeyConstraintName: 'PK_shared_sets',
  })
  code: string;

  /** Who shared it; their quota of live codes is counted by this. */
  @Index('IDX_shared_sets_user_id')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_shared_sets_user',
  })
  user?: User;

  /** The app's backup file of kind 'sets'. */
  @Column({ type: 'jsonb' })
  payload: SharePayload;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Index('IDX_shared_sets_expires_at')
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}
