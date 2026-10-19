/// <reference types="node" />
/** Downloads the Wiktionary sources into dictionaries/source/ (skips existing files). */
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { SOURCE_DIR, SOURCES } from './sources.ts';

fs.mkdirSync(SOURCE_DIR, { recursive: true });

for (const { url, file } of Object.values(SOURCES)) {
  if (fs.existsSync(file)) {
    console.log(`exists: ${file}`);
    continue;
  }
  console.log(`downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  const part = `${file}.part`;
  await pipeline(
    Readable.fromWeb(response.body as never),
    fs.createWriteStream(part),
  );
  fs.renameSync(part, file);
  console.log(`saved ${file} (${(fs.statSync(file).size / 1e6).toFixed(0)} MB)`);
}
