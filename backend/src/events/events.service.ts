import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';
import type { EntityManager } from 'typeorm';
import type { SyncTable } from '../sync/protocol.ts';
import {
  CHANGES_CHANNEL,
  decodeNotice,
  encodeNotice,
  type ChangeEvent,
} from './protocol.ts';
import { currentClientId } from './request-context.ts';

export interface Subscriber {
  userId: string;
  clientId: string | null;
  send: (event: ChangeEvent) => void;
}

const RECONNECT_MS = 5_000;

/**
 * Tells open clients that their account changed.
 *
 * Writes publish a Postgres NOTIFY inside their transaction, so it goes out
 * only when the rows are committed, and reaches every server process (the
 * host may run several). Each process LISTENs on one dedicated connection and
 * passes the notice to its own subscribers (the `/events` streams).
 */
@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private readonly subscribers = new Map<string, Set<Subscriber>>();
  private client: pg.Client | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    void this.listen();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.retry) {
      clearTimeout(this.retry);
    }
    const client = this.client;
    this.client = null;
    await client?.end().catch(() => undefined);
  }

  /** Publishes a change of `userId` when `manager`'s transaction commits. */
  async publish(
    manager: EntityManager,
    userId: string,
    version: number,
    tables: SyncTable[],
  ): Promise<void> {
    await manager.query('SELECT pg_notify($1, $2)', [
      CHANGES_CHANNEL,
      encodeNotice({ userId, version, tables, origin: currentClientId() }),
    ]);
  }

  /** Returns the unsubscribe function. */
  subscribe(subscriber: Subscriber): () => void {
    let set = this.subscribers.get(subscriber.userId);
    if (!set) {
      set = new Set();
      this.subscribers.set(subscriber.userId, set);
    }
    const own = set;
    own.add(subscriber);
    return () => {
      own.delete(subscriber);
      if (own.size === 0 && this.subscribers.get(subscriber.userId) === own) {
        this.subscribers.delete(subscriber.userId);
      }
    };
  }

  private deliver(payload: string | undefined): void {
    const notice = payload ? decodeNotice(payload) : null;
    if (!notice) {
      return;
    }
    for (const subscriber of this.subscribers.get(notice.userId) ?? []) {
      if (notice.origin === null || subscriber.clientId !== notice.origin) {
        subscriber.send({ version: notice.version, tables: notice.tables });
      }
    }
  }

  private async listen(): Promise<void> {
    const client = new pg.Client({
      connectionString: this.config.getOrThrow<string>('DATABASE_URL'),
    });
    const reconnect = (error: unknown) => {
      if (this.client !== client) {
        return;
      }
      this.client = null;
      client.end().catch(() => undefined);
      if (!this.stopped) {
        this.logger.warn(`LISTEN connection lost, retrying: ${String(error)}`);
        this.retry = setTimeout(() => void this.listen(), RECONNECT_MS);
      }
    };
    this.client = client;
    client.on('error', reconnect);
    client.on('end', () => reconnect('connection ended'));
    client.on('notification', message => {
      if (message.channel === CHANGES_CHANNEL) {
        this.deliver(message.payload);
      }
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANGES_CHANNEL}`);
    } catch (error) {
      reconnect(error);
    }
  }
}
