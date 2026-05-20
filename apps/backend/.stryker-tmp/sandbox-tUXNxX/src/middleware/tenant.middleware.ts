// @ts-nocheck
import type { Request, Response, NextFunction } from 'express';

export interface TenantContext {
  id?: string;
  slug?: string;
}

export function tenantMiddleware(req: Request, _res: Response, next: NextFunction) {
  const headerTenantId = (req.headers['x-tenant-id'] as string | undefined)?.trim();
  const host = req.headers.host || '';
  let subdomain: string | undefined;

  if (host) {
    const parts = host.split('.');
    if (parts.length > 2) {
      subdomain = parts[0];
    }
  }

  const tenant: TenantContext | undefined =
    headerTenantId || subdomain
      ? {
          id: headerTenantId,
          slug: subdomain,
        }
      : undefined;

  // Şimdilik sadece context'e ekliyoruz, ileride DB lookup + 404 enforcement eklenecek.
  (req as any).tenant = tenant;

  next();
}

