/**
 * EscalateOverdueObjectionsUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Hiç itiraz yoksa { count: 0 } döner, audit log yazılmaz
 * - Itirazlar varsa markEscalated çağrılır
 * - count: updatedCount ile döner
 * - Audit log yazılır (ilk ID ile)
 * - Varsayılan gün sayısı 10
 * - Özel gün sayısı geçilebilir
 */

import { EscalateOverdueObjectionsUseCase } from '../../../src/application/use-cases/objection/EscalateOverdueObjectionsUseCase';

function makeObjectionRepo(rows: any[] = [], updatedCount = 0) {
  return {
    findOverdueOpenObjections: jest.fn().mockResolvedValue(rows),
    markEscalated: jest.fn().mockResolvedValue(updatedCount),
  };
}

function makeAuditRepo() {
  return { create: jest.fn().mockResolvedValue({}) };
}

function makeObjection(id: string) {
  return { id, status: 'OPEN', createdAt: new Date() };
}

describe('EscalateOverdueObjectionsUseCase', () => {
  it('itiraz yoksa count: 0 döner ve audit log yazılmaz', async () => {
    const objectionRepo = makeObjectionRepo([], 0);
    const auditRepo = makeAuditRepo();
    const uc = new EscalateOverdueObjectionsUseCase(objectionRepo as any, auditRepo as any);
    const result = await uc.execute();
    expect(result.count).toBe(0);
    expect(auditRepo.create).not.toHaveBeenCalled();
  });

  it('itirazlar varsa markEscalated çağrılır', async () => {
    const rows = [makeObjection('obj-1'), makeObjection('obj-2')];
    const objectionRepo = makeObjectionRepo(rows, 2);
    const auditRepo = makeAuditRepo();
    const uc = new EscalateOverdueObjectionsUseCase(objectionRepo as any, auditRepo as any);
    const result = await uc.execute();
    expect(objectionRepo.markEscalated).toHaveBeenCalledWith(['obj-1', 'obj-2']);
    expect(result.count).toBe(2);
  });

  it('audit log OBJECTION_ESCALATED action ile yazılır', async () => {
    const rows = [makeObjection('obj-1')];
    const objectionRepo = makeObjectionRepo(rows, 1);
    const auditRepo = makeAuditRepo();
    const uc = new EscalateOverdueObjectionsUseCase(objectionRepo as any, auditRepo as any);
    await uc.execute();
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OBJECTION_ESCALATED',
        entityType: 'Objection',
        entityId: 'obj-1',
        actorId: null,
      }),
    );
  });

  it('varsayılan 10 gün ile çağrılır', async () => {
    const objectionRepo = makeObjectionRepo([], 0);
    const uc = new EscalateOverdueObjectionsUseCase(objectionRepo as any, makeAuditRepo() as any);
    await uc.execute();
    expect(objectionRepo.findOverdueOpenObjections).toHaveBeenCalledWith(10);
  });

  it('özel gün sayısı geçilebilir', async () => {
    const objectionRepo = makeObjectionRepo([], 0);
    const uc = new EscalateOverdueObjectionsUseCase(objectionRepo as any, makeAuditRepo() as any);
    await uc.execute(5);
    expect(objectionRepo.findOverdueOpenObjections).toHaveBeenCalledWith(5);
  });

  it('dönen ids listesi tüm ID\'leri içerir', async () => {
    const rows = [makeObjection('obj-1'), makeObjection('obj-2'), makeObjection('obj-3')];
    const objectionRepo = makeObjectionRepo(rows, 3);
    const uc = new EscalateOverdueObjectionsUseCase(objectionRepo as any, makeAuditRepo() as any);
    const result = await uc.execute();
    expect(result.ids).toEqual(['obj-1', 'obj-2', 'obj-3']);
  });
});
