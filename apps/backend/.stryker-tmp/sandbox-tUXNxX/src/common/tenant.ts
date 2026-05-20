// @ts-nocheck
export function getDefaultTenantId(): string {
  return process.env.DEFAULT_TENANT_ID || 'dev-tenant';
}

