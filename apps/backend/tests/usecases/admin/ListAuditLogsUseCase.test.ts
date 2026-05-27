/**
 * ListAuditLogsUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - auditRepo.list çağrılır
 * - runWithoutTenantFilter ile tenant bypass yapılır
 * - Filtreler repo'ya iletilir
 * - items boşsa enrichment atlanır
 * - Başarı: items döner
 */

jest.mock('../../../src/common/tenantContext', () => ({
  runWithoutTenantFilter: jest.fn().mockImplementation(async (fn: () => any) => fn()),
}));

jest.mock('../../../src/application/services/AuditEntityResolver', () => ({
  resolveAuditEntities: jest.fn().mockResolvedValue(new Map()),
}));

import { ListAuditLogsUseCase } from '../../../src/application/use-cases/admin/ListAuditLogsUseCase';
import { runWithoutTenantFilter } from '../../../src/common/tenantContext';

function makeAuditRepo(items: any[] = []) {
  return {
    list: jest.fn().mockResolvedValue({ items, total: items.length }),
  };
}

function makeLog(overrides: any = {}) {
  return {
    id: 'log-1',
    action: 'EDUCATOR_APPROVED',
    entityType: 'User',
    entityId: 'edu-1',
    actorId: 'admin-1',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('ListAuditLogsUseCase', () => {
  it('auditRepo.list çağrılır', async () => {
    const auditRepo = makeAuditRepo();
    const uc = new ListAuditLogsUseCase(auditRepo as any);
    await uc.execute();
    expect(auditRepo.list).toHaveBeenCalled();
  });

  it('runWithoutTenantFilter ile tenant bypass yapılır', async () => {
    const auditRepo = makeAuditRepo();
    const uc = new ListAuditLogsUseCase(auditRepo as any);
    await uc.execute();
    expect(runWithoutTenantFilter).toHaveBeenCalled();
  });

  it('filtreler auditRepo.list\'e iletilir', async () => {
    const auditRepo = makeAuditRepo();
    const uc = new ListAuditLogsUseCase(auditRepo as any);
    await uc.execute({ action: 'EDUCATOR_APPROVED', actorId: 'admin-1', page: 2, limit: 10 });
    expect(auditRepo.list).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EDUCATOR_APPROVED', actorId: 'admin-1' }),
    );
  });

  it('from/to string tarihleri Date\'e dönüştürülür', async () => {
    const auditRepo = makeAuditRepo();
    const uc = new ListAuditLogsUseCase(auditRepo as any);
    await uc.execute({ from: '2025-01-01', to: '2025-12-31' });
    const call = auditRepo.list.mock.calls[0][0];
    expect(call.from).toBeInstanceOf(Date);
    expect(call.to).toBeInstanceOf(Date);
  });

  it('items boşsa enrichment yapılmaz', async () => {
    const { resolveAuditEntities } = require('../../../src/application/services/AuditEntityResolver');
    const auditRepo = makeAuditRepo([]);
    const uc = new ListAuditLogsUseCase(auditRepo as any);
    await uc.execute();
    expect(resolveAuditEntities).not.toHaveBeenCalled();
  });

  it('items varsa entityLabel ve entityLink eklenir', async () => {
    const { resolveAuditEntities } = require('../../../src/application/services/AuditEntityResolver');
    const resolved = new Map([['User::edu-1', { label: 'Ahmet Hoca', link: '/educator/edu-1' }]]);
    resolveAuditEntities.mockResolvedValue(resolved);

    const auditRepo = makeAuditRepo([makeLog()]);
    const uc = new ListAuditLogsUseCase(auditRepo as any);
    const result = (await uc.execute()) as any;
    const item = result.items[0];
    expect(item.entityLabel).toBe('Ahmet Hoca');
    expect(item.entityLink).toBe('/educator/edu-1');
  });
});
