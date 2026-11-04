import { EventStreamParser, parseChanged } from '../src/features/sync/sse';

describe('EventStreamParser', () => {
  it('parses events split across chunks and skips pings', () => {
    const parser = new EventStreamParser();
    expect(parser.feed(': ping\n\nevent: chan')).toEqual([]);
    expect(parser.feed('ged\ndata: {"version":2,"tables":[]}\n')).toEqual([]);
    expect(parser.feed('\n')).toEqual([
      { event: 'changed', data: '{"version":2,"tables":[]}' },
    ]);
  });

  it('handles CRLF, a CR split from its LF, and multi-line data', () => {
    const parser = new EventStreamParser();
    expect(parser.feed('data: a\r')).toEqual([]);
    expect(parser.feed('\ndata: b\r\n\r\n')).toEqual([{ event: 'message', data: 'a\nb' }]);
  });
});

describe('parseChanged', () => {
  it('reads changed events only', () => {
    expect(
      parseChanged({ event: 'changed', data: '{"version":5,"tables":["words"]}' }),
    ).toEqual({ version: 5, tables: ['words'] });
    expect(parseChanged({ event: 'message', data: '{}' })).toBeNull();
    expect(parseChanged({ event: 'changed', data: 'oops' })).toBeNull();
  });
});
