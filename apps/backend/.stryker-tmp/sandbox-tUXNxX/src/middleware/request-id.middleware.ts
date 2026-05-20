// @ts-nocheck
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { incrementRequestCount } from '../infrastructure/metrics/metrics';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const existing = (req.headers['x-request-id'] as string | undefined)?.trim();
  const id = existing || randomUUID();

  (req as any).requestId = id;
  res.setHeader('X-Request-Id', id);

  incrementRequestCount();

  next();
}

