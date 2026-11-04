/**
 * Server-sent events about account changes (`GET /events`). Pure, so the
 * format is unit tested and the clients' parsers can follow it.
 *
 * The stream sends, as `text/event-stream`:
 * - `event: changed` + `data: {"version":N,"tables":[...]}` whenever a request
 *   of another client commits rows (a phone's /sync push or a website write).
 *   The first event after connecting carries the current version and no
 *   tables, so a client that was offline can tell whether it missed anything.
 * - `: ping` comments every PING_INTERVAL_MS, so proxies keep the connection
 *   open and a dead one is noticed.
 */
import { SYNC_TABLES, type SyncTable } from '../sync/protocol.ts';

/** Postgres NOTIFY channel; payloads are ChangeNotice JSON. */
export const CHANGES_CHANNEL = 'account_changes';

/** Header a client sends with every request, so its own changes aren't echoed back. */
export const CLIENT_ID_HEADER = 'x-client-id';

export const PING_INTERVAL_MS = 25_000;

/** Client ids are random strings the clients make up; anything else is ignored. */
const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function validClientId(value: unknown): string | null {
  return typeof value === 'string' && CLIENT_ID.test(value) ? value : null;
}

export interface ChangeEvent {
  /** The account's sync version after the change (the phones' cursor). */
  version: number;
  /** Tables with written rows; empty in the event sent on connect. */
  tables: SyncTable[];
}

/** What one committed request tells every server process. */
export interface ChangeNotice extends ChangeEvent {
  userId: string;
  /** The client that made the change; it already knows. */
  origin: string | null;
}

export function encodeNotice(notice: ChangeNotice): string {
  return JSON.stringify(notice);
}

export function decodeNotice(payload: string): ChangeNotice | null {
  try {
    const value = JSON.parse(payload) as Partial<ChangeNotice>;
    if (
      typeof value.userId !== 'string' ||
      typeof value.version !== 'number' ||
      !Array.isArray(value.tables)
    ) {
      return null;
    }
    return {
      userId: value.userId,
      version: value.version,
      tables: value.tables.filter((t): t is SyncTable =>
        (SYNC_TABLES as readonly string[]).includes(t as string),
      ),
      origin: validClientId(value.origin),
    };
  } catch {
    return null;
  }
}

export function changedFrame(event: ChangeEvent): string {
  return `event: changed\ndata: ${JSON.stringify({
    version: event.version,
    tables: event.tables,
  })}\n\n`;
}

export const PING_FRAME = ': ping\n\n';
