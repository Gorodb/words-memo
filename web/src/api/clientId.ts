/**
 * This tab's id, sent as `X-Client-Id` with every request, so the backend's
 * live updates (`/events`) don't echo the tab's own changes back to it.
 */
export const CLIENT_ID: string =
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : // Plain http on a LAN address (dev): no secure context, no randomUUID.
      Array.from(crypto.getRandomValues(new Uint8Array(16)), b =>
        b.toString(16).padStart(2, '0'),
      ).join('');
