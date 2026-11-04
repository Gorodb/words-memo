import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';
import { CLIENT_ID_HEADER, validClientId } from './protocol.ts';

/**
 * The client id of the request being handled, so the change notice of a
 * write can name its origin without passing it through every service.
 */
const context = new AsyncLocalStorage<{ clientId: string | null }>();

export function requestContextMiddleware(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  context.run({ clientId: validClientId(request.header(CLIENT_ID_HEADER)) }, next);
}

export function currentClientId(): string | null {
  return context.getStore()?.clientId ?? null;
}
