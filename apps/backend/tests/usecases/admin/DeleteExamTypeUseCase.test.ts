/**
 * DeleteExamTypeUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Sınav türü bulunamazsa NOT_FOUND
 * - Alt konuları varsa CONFLICT (delete false döner)
 * - Başarı: { deleted: true } döner ve audit log yazılır
 * - Audit log hatası fırlatmaz
 */

import { DeleteExamTypeUseCase } from '../../../src/application/use-cases/admin/DeleteExamTypeUseCase';

function makeExamTypeRepo(existing: any = null, deleteResult = true) {
  return {
    findById: jest.fn().mockResolvedValue(existing),
    delete: jest.fn().mockResolvedValue(deleteResult),
  };
}

function makeAuditRepo() {
  return { create: jest.fn().mockResolvedValue({}) };
}

describe('DeleteExamTypeUseCase', () => {
  it('sınav türü bulunamazsa NOT_FOUND fırlatır', async () => {
    const repo = makeExamTypeRepo(null);
    const uc = new DeleteExamTypeUseCase(repo as any, makeAuditRepo() as any);
    await expect(uc.execute('bad-id')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('alt konular varsa CONFLICT fırlatır', async () => {
    const repo = makeExamTypeRepo({ id: 'et-1', name: 'KPSS' }, false);
    const uc = new DeleteExamTypeUseCase(repo as any, makeAuditRepo() as any);
    await expect(uc.execute('et-1')).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('başarı: { deleted: true } döner', async () => {
    const repo = makeExamTypeRepo({ id: 'et-1', name: 'KPSS' }, true);
    const uc = new DeleteExamTypeUseCase(repo as any, makeAuditRepo() as any);
    const result = await uc.execute('et-1');
    expect(result).toEqual({ deleted: true });
  });

  it('başarı: audit log EXAMTYPE_DELETED action ile yazılır', async () => {
    const repo = makeExamTypeRepo({ id: 'et-1', name: 'KPSS' }, true);
    const auditRepo = makeAuditRepo();
    const uc = new DeleteExamTypeUseCase(repo as any, auditRepo as any);
    await uc.execute('et-1', 'admin-1');
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EXAMTYPE_DELETED', actorId: 'admin-1', entityId: 'et-1' }),
    );
  });

  it('audit log hatası fırlatmaz (best-effort)', async () => {
    const repo = makeExamTypeRepo({ id: 'et-1' }, true);
    const auditRepo = { create: jest.fn().mockRejectedValue(new Error('AUDIT_FAIL')) };
    const uc = new DeleteExamTypeUseCase(repo as any, auditRepo as any);
    await expect(uc.execute('et-1')).resolves.toEqual({ deleted: true });
  });
});
