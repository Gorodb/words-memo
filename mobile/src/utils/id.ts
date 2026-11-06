/** Locally unique id: time-ordered prefix + random suffix. */
export function createId(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10).padEnd(8, '0')
  );
}
