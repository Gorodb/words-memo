import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, QueryFailedError, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js';
import {
  newShareCode,
  normalizeShareCode,
  SHARE_TTL_MS,
} from './share-code.ts';
import type { SharePayload } from './share-payload.ts';
import { SharedSet } from './shared-set.entity.ts';

/** Machine-readable `code` in error bodies; the app branches on these. */
export const ShareErrorCode = {
  notFound: 'SHARE_NOT_FOUND',
  tooMany: 'TOO_MANY_SHARES',
  badPayload: 'BAD_SHARE_PAYLOAD',
} as const;

/** Live (unused, unexpired) codes one account may hold at a time. */
export const MAX_LIVE_SHARES = 100;
/** Expired codes are deleted this often (and once on start). */
export const CLEANUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

const UNIQUE_VIOLATION = '23505';
const CODE_ATTEMPTS = 5;

export interface ShareCreated {
  code: string;
  /** ISO time. */
  expiresAt: string;
}

export interface ShareContent {
  payload: SharePayload;
  /** ISO time. */
  expiresAt: string;
}

@Injectable()
export class SharesService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SharesService.name);
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(SharedSet)
    private readonly shares: Repository<SharedSet>,
  ) {}

  async create(userId: string, payload: SharePayload): Promise<ShareCreated> {
    const live = await this.shares.countBy({
      userId,
      expiresAt: MoreThan(new Date()),
    });
    if (live >= MAX_LIVE_SHARES) {
      throw new HttpException(
        {
          code: ShareErrorCode.tooMany,
          message: `You already have ${MAX_LIVE_SHARES} unused codes. Try again when some are used or expired.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const expiresAt = new Date(Date.now() + SHARE_TTL_MS);
    for (let attempt = 1; ; attempt++) {
      const code = newShareCode();
      try {
        await this.shares.insert({
          code,
          userId,
          // Stored as is (jsonb); TypeORM's partial type can't map `unknown`.
          payload: payload as QueryDeepPartialEntity<SharePayload>,
          expiresAt,
        });
        return { code, expiresAt: expiresAt.toISOString() };
      } catch (e) {
        const taken =
          e instanceof QueryFailedError &&
          (e.driverError as { code?: string }).code === UNIQUE_VIOLATION;
        if (!taken || attempt >= CODE_ATTEMPTS) {
          throw e;
        }
      }
    }
  }

  /** Reads a live share without using it up (the app previews the import). */
  async peek(input: string): Promise<ShareContent> {
    const code = normalizeShareCode(input);
    const share = code
      ? await this.shares.findOneBy({ code, expiresAt: MoreThan(new Date()) })
      : null;
    if (!share) {
      throw notFound();
    }
    return {
      payload: share.payload,
      expiresAt: share.expiresAt.toISOString(),
    };
  }

  /**
   * Uses the code up: deletes it and returns its content in one statement,
   * so two devices can't both redeem it.
   */
  async redeem(input: string): Promise<ShareContent> {
    const code = normalizeShareCode(input);
    if (!code) {
      throw notFound();
    }
    const [rows] = (await this.shares.query(
      `DELETE FROM "shared_sets" WHERE "code" = $1 AND "expires_at" > now()
       RETURNING "payload", "expires_at"`,
      [code],
    )) as [{ payload: SharePayload; expires_at: Date }[], number];
    const row = rows[0];
    if (!row) {
      throw notFound();
    }
    return {
      payload: row.payload,
      expiresAt: new Date(row.expires_at).toISOString(),
    };
  }

  /** Deletes expired codes; returns how many. */
  async deleteExpired(): Promise<number> {
    const result = await this.shares
      .createQueryBuilder()
      .delete()
      .where('expires_at <= now()')
      .execute();
    return result.affected ?? 0;
  }

  /**
   * Expired codes already stop working; the cleanup only keeps the table
   * small. It also runs on start: hosts that idle or restart the app
   * (Passenger) may never let a week-long timer fire.
   */
  onApplicationBootstrap(): void {
    void this.cleanup();
    this.cleanupTimer = setInterval(
      () => void this.cleanup(),
      CLEANUP_INTERVAL_MS,
    );
    this.cleanupTimer.unref();
  }

  onApplicationShutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private async cleanup(): Promise<void> {
    try {
      const deleted = await this.deleteExpired();
      if (deleted) {
        this.logger.log(`Deleted ${deleted} expired share codes`);
      }
    } catch (e) {
      this.logger.error(
        'Could not delete expired share codes',
        e instanceof Error ? e.stack : String(e),
      );
    }
  }
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: ShareErrorCode.notFound,
    message: 'This code is wrong, already used or expired',
  });
}
