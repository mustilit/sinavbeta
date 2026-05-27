/**
 * CreateExamTypeUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Aynı slug varsa EXAMTYPE_SLUG_EXISTS (409)
 * - Slug verilmezse isimden üretilir
 * - Türkçe karakterler normalize edilir (ç→c, ş→s, vb.)
 * - active varsayılan true
 * - Audit log yazılır (best-effort: hata fırlatmaz)
 * - actorId olmasa da çalışır
 */

import { CreateExamTypeUseCase } from '../../../src/application/use-cases/admin/CreateExamTypeUseCase';

function makeExamTypeRepo(existing: any = null) {
  return {
    findBySlug: jest.fn().mockResolvedValue(existing),
    create: jest.fn().mockImplementation(async (data: any) => ({ id: 'et-1', ...data })),
  };
}

function makeAuditRepo() {
  return { create: jest.fn().mockResolvedValue({}) };
}

describe('CreateExamTypeUseCase', () => {
  it('aynı slug zaten varsa EXAMTYPE_SLUG_EXISTS fırlatır', async () => {
    const repo = makeExamTypeRepo({ id: 'existing', slug: 'kpss' });
    const uc = new CreateExamTypeUseCase(repo as any, makeAuditRepo() as any);
    await expect(uc.execute({ name: 'KPSS' })).rejects.toMatchObject({ code: 'EXAMTYPE_SLUG_EXISTS' });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('slug verilmezse isimden üretilir', async () => {
    const repo = makeExamTypeRepo(null);
    const uc = new CreateExamTypeUseCase(repo as any, makeAuditRepo() as any);
    await uc.execute({ name: 'KPSS Sınavı' });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'kpss-sinavi' }));
  });

  it('Türkçe karakterler normalize edilir', async () => {
    const repo = makeExamTypeRepo(null);
    const uc = new CreateExamTypeUseCase(repo as any, makeAuditRepo() as any);
    await uc.execute({ name: 'Şehir Güzelliği' });
    const call = repo.create.mock.calls[0][0];
    expect(call.slug).not.toContain('ş');
    expect(call.slug).not.toContain('ü');
    expect(call.slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('active varsayılan true olarak ayarlanır', async () => {
    const repo = makeExamTypeRepo(null);
    const uc = new CreateExamTypeUseCase(repo as any, makeAuditRepo() as any);
    await uc.execute({ name: 'YKS' });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ active: true }));
  });

  it('active false geçilirse false saklanır', async () => {
    const repo = makeExamTypeRepo(null);
    const uc = new CreateExamTypeUseCase(repo as any, makeAuditRepo() as any);
    await uc.execute({ name: 'Pasif Sınav', active: false });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
  });

  it('başarı: audit log EXAMTYPE_CREATED action ile yazılır', async () => {
    const repo = makeExamTypeRepo(null);
    const auditRepo = makeAuditRepo();
    const uc = new CreateExamTypeUseCase(repo as any, auditRepo as any);
    await uc.execute({ name: 'ALES' }, 'admin-1');
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EXAMTYPE_CREATED', actorId: 'admin-1' }),
    );
  });

  it('audit log hatası fırlatmaz (best-effort)', async () => {
    const repo = makeExamTypeRepo(null);
    const auditRepo = { create: jest.fn().mockRejectedValue(new Error('AUDIT_FAIL')) };
    const uc = new CreateExamTypeUseCase(repo as any, auditRepo as any);
    await expect(uc.execute({ name: 'DGS' })).resolves.toBeDefined();
  });
});
