/**
 * Incremental parser of a `text/event-stream` body (the backend's
 * `GET /events`). Pure: feed it text as it arrives, get whole events back.
 * Copy of the website's `web/src/api/sse.ts`; keep them in step.
 */
export interface ServerEvent {
  /** `event:` field; 'message' when absent. */
  event: string;
  data: string;
}

export interface ChangedEvent {
  version: number;
  /** Sync tables with changes; empty in the first event after connecting. */
  tables: string[];
}

export class EventStreamParser {
  private buffer = '';
  private event = '';
  private data: string[] = [];

  /** Returns the events completed by `chunk`. */
  feed(chunk: string): ServerEvent[] {
    this.buffer += chunk;
    const events: ServerEvent[] = [];
    let end: number;
    while ((end = this.buffer.search(/\r\n|\r|\n/)) !== -1) {
      const line = this.buffer.slice(0, end);
      const breakLength = this.buffer.startsWith('\r\n', end) ? 2 : 1;
      // A lone \r at the very end may be the first half of \r\n.
      if (breakLength === 1 && this.buffer[end] === '\r' && end === this.buffer.length - 1) {
        break;
      }
      this.buffer = this.buffer.slice(end + breakLength);
      this.line(line, events);
    }
    return events;
  }

  private line(line: string, events: ServerEvent[]): void {
    if (line === '') {
      if (this.data.length > 0) {
        events.push({ event: this.event || 'message', data: this.data.join('\n') });
      }
      this.event = '';
      this.data = [];
      return;
    }
    if (line.startsWith(':')) {
      return; // comment (ping)
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }
    if (field === 'event') {
      this.event = value;
    } else if (field === 'data') {
      this.data.push(value);
    }
  }
}

/** The payload of a `changed` event, or null when it isn't one. */
export function parseChanged(event: ServerEvent): ChangedEvent | null {
  if (event.event !== 'changed') {
    return null;
  }
  try {
    const value = JSON.parse(event.data) as Partial<ChangedEvent>;
    return typeof value.version === 'number' && Array.isArray(value.tables)
      ? { version: value.version, tables: value.tables.filter(t => typeof t === 'string') }
      : null;
  } catch {
    return null;
  }
}
