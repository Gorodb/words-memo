/**
 * The shared content is the app's own backup file of kind 'sets'
 * (`src/features/backup/format.ts` in the app): `{app, version, kind,
 * exportedAt, languages: [{code, name?, folders, sets}]}`. The app validates
 * it fully when it imports; the server only checks the outline and the size.
 */
export const MAX_SHARE_BYTES = 5 * 1024 * 1024;

export class SharePayloadError extends Error {}

export interface SharePayload {
  kind: 'sets';
  languages: unknown[];
  [key: string]: unknown;
}

export function parseSharePayload(value: unknown): SharePayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SharePayloadError('payload must be an object');
  }
  const payload = value as Record<string, unknown>;
  if (payload.kind !== 'sets') {
    throw new SharePayloadError("payload.kind must be 'sets'");
  }
  if (!Array.isArray(payload.languages) || payload.languages.length === 0) {
    throw new SharePayloadError('payload.languages must be a non-empty list');
  }
  if (Buffer.byteLength(JSON.stringify(payload)) > MAX_SHARE_BYTES) {
    throw new SharePayloadError('The set is too large to share by code');
  }
  return payload as SharePayload;
}
