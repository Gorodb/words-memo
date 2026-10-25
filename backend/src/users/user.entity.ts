import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { bigintNumber } from '../database/columns.ts';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stored trimmed and lower-cased; unique. */
  @Column({ type: 'varchar', length: 320, unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  /** Last sync version handed out to this user's rows (see SyncService). */
  @Column({
    name: 'sync_version',
    type: 'bigint',
    default: 0,
    transformer: bigintNumber,
  })
  syncVersion: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
