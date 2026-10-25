import type { ValueTransformer } from 'typeorm';

/**
 * pg returns BIGINT as a string. Every bigint we store (ms timestamps, sync
 * versions) fits a JS number exactly.
 */
export const bigintNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};
