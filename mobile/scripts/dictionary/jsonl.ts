/// <reference types="node" />
import fs from 'node:fs';
import zlib from 'node:zlib';

/**
 * Yields the lines of a (optionally .gz) JSONL file. Splits on "\n" only:
 * node:readline also splits on a lone "\r", which appears inside some entries.
 */
export async function* jsonlLines(path: string): AsyncGenerator<string> {
  let stream: NodeJS.ReadableStream = fs.createReadStream(path);
  if (path.endsWith('.gz')) {
    stream = stream.pipe(zlib.createGunzip());
  }
  let buffer = '';
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    buffer += chunk.toString('utf8');
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      yield buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
    }
  }
  if (buffer) {
    yield buffer;
  }
}
