import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContext {
  requestId: string;
  startedAt: number;
}

const storage = new AsyncLocalStorage<RequestContext>();

// The id for the request being handled on this async stack, if any.
export const currentRequestId = (): string | undefined =>
  storage.getStore()?.requestId;

// Accepts an inbound x-request-id so a trace survives across services, and
// mints one otherwise. Everything logged downstream can then be tied together.
export const requestContextMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const inbound = req.headers['x-request-id'];
  const requestId =
    (Array.isArray(inbound) ? inbound[0] : inbound)?.slice(0, 200) ||
    randomUUID();

  res.setHeader('x-request-id', requestId);
  storage.run({ requestId, startedAt: Date.now() }, () => next());
};
