/**
 * UpdateExamTypeUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Sınav türü bulunamazsa null döner
 * - Başka bir sınav türü aynı slug kullanıyorsa EXAMTYPE_SLUG_EXISTS
 * - Aynı ID ise slug çakışması değil (kendi slug'ı)
 * - Başarı: repo.update çağrılır ve audit log yazılır
 * - active false yapılabilir
 */

import { UpdateExamTypeUseCase } from '../../../src/application/use-cases/admin/UpdateExamTypeUseCase';

function makeExamTypeRepo(existing: any = null, bySlug: any = null, updateResult: any = null) {
  return {
    findById: jest.fn().mockResolvedValue(existing),
    findBySlug: jest.fn().mockResolvedValue(bySlug),
    update: jest.fn().mockResolvedValue(updateResult ?? existing),
  };
}

function makeAuditRepo() {
  return { create: jest.fn().mockResolvedValue({}) };
}

describe('UpdateExamTypeUseCase', () => {
  it('sınav türü bulunamazsa null döner', async () => {
    const repo = makeExamTypeRepo(null);
    const uc = new UpdateExamTypeUseCase(repo as any, makeAuditRepo() as any);
    const result = await uc.execute('bad-id', { name: 'KPSS' });
    expect(result).toBeNull();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('slug başka bir kayda aitse EXAMTYPE_SLUG_EXISTS fırlatır', async () => {
    const existing = { id: 'et-1', name: 'YKS', slug: 'yks' };
    const conflict = { id: 'et-2', name: 'KPSS', slug: 'kpss' };
    const repo = makeExamTypeRepo(existing, conflict);
    const uc = new UpdateExamTypeUseCase(repo as any, makeAuditRepo() as any);
    await expect(uc.execute('et-1', { name: 'KPSS' })).rejects.toMatchObject({
      code: 'EXAMTYPE_SLUG_EXISTS',
    });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('slug kendi ID\'siyse çakışma sayılmaz', async () => {
    const existing = { id: 'et-1', name: 'KPSS', slug: 'kpss' };
    const sameRecord = { id: 'et-1', name: 'KPSS', slug: 'kpss' }; // same ID
    const repo = makeExamTypeRepo(existing, sameRecord);
    const uc = new UpdateExamTypeUseCase(repo as any, makeAuditRepo() as any);
    await expect(uc.execute('et-1', { name: 'KPSS Updated' })).resolves.toBeDefined();
  });

  it('başarı: repo.update çağrılır', async () => {
    const existing = { id: 'et-1', name: 'KPSS', slug: 'kpss' };
    const repo = makeExamTypeRepo(existing, null);
    const uc = new UpdateExamTypeUseCase(repo as any, makeAuditRepo() as any);
    await uc.execute('et-1', { name: 'KPSS Güncel', active: false });
    expect(repo.update).toHaveBeenCalledWith(
      'et-1',
      expect.objectContaining({ active: false }),
    );
  });

  it('audit log EXAMTYPE_UPDATED action ile yazılır', async () => {
    const existing = { id: 'et-1', name: 'KPSS', slug: 'kpss' };
    const auditRepo = makeAuditRepo();
    const repo = makeExamTypeRepo(existing, null);
    const uc = new UpdateExamTypeUseCase(repo as any, auditRepo as any);
    await uc.execute('et-1', { name: 'KPSS' }, 'admin-1');
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EXAMTYPE_UPDATED', actorId: 'admin-1' }),
    );
  });

  it('slug verilmezse name\'den türetilir', async () => {
    const existing = { id: 'et-1', name: 'Eski Ad', slug: 'eski-ad' };
    const repo = makeExamTypeRepo(existing, null);
    const uc = new UpdateExamTypeUseCase(repo as any, makeAuditRepo() as any);
    await uc.execute('et-1', { name: 'Yeni Ad' });
    expect(repo.findBySlug).toHaveBeenCalledWith('yeni-ad');
  });
});
