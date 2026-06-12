/**
 * JoinLiveSessionUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Oturum bulunamazsa → SESSION_NOT_FOUND
 * - ENDED oturum → SESSION_ENDED
 * - DRAFT oturum → katılıma izin verir (beklemeye alınır — artık reddedilmez)
 * - Aynı IP'den katılım limiti aşıldı → DEVICE_QUOTA_EXCEEDED (kapatma saldırısı)
 * - Kullanıcı bulunamazsa → USER_NOT_FOUND
 * - Kullanıcı aktif değilse → USER_NOT_ACTIVE
 * - Round 2 ve round 1 katılımı yoksa → NOT_IN_ROUND1
 * - Kapasite dolu → SESSION_FULL (race condition: updateMany count=0)
 * - Başarı: participant oluşturulur, sessionId + participantId döner
 * - Mevcut katılımcı → upsert idempotent, kapasite artırılmaz
 * - Misafir akışı: displayName gerekli, guestToken döner, round2 yasak
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    liveSession: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    liveParticipant: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { JoinLiveSessionUseCase } from '../../../src/application/use-cases/live/JoinLiveSessionUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';
import { AppError } from '../../../src/application/errors/AppError';

const mockPrisma = prisma as any;

function makeSession(overrides: Record<string, any> = {}) {
  return {
    id: 'sess-1',
    educatorId: 'edu-1',
    joinCode: 'ABC123',
    status: 'ACTIVE',
    maxParticipants: null,
    currentParticipantCount: 5,
    roundNumber: 1,
    parentSessionId: null,
    ...overrides,
  };
}

function makeUser(overrides: Record<string, any> = {}) {
  return { id: 'u1', status: 'ACTIVE', ...overrides };
}

function makeParticipant(overrides: Record<string, any> = {}) {
  return { id: 'part-1', sessionId: 'sess-1', userId: 'u1', ...overrides };
}

describe('JoinLiveSessionUseCase', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockPrisma.liveSession.findUnique.mockResolvedValue(makeSession());
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());
    mockPrisma.liveParticipant.findUnique.mockResolvedValue(null);
    mockPrisma.liveSession.update.mockResolvedValue(makeSession());
    mockPrisma.liveSession.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.liveParticipant.upsert.mockResolvedValue(makeParticipant());
    mockPrisma.liveParticipant.create.mockResolvedValue({ id: 'part-guest', sessionId: 'sess-1', userId: null });
    // IP limiti sorgusu — varsayılan: 0 katılım (limit aşılmadı)
    mockPrisma.$queryRaw.mockResolvedValue([{ cnt: 0n }]);
    mockPrisma.$executeRaw.mockResolvedValue(0);
    mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  });

  // ── Oturum hataları ────────────────────────────────────────────────────────

  it('oturum bulunamazsa SESSION_NOT_FOUND fırlatır', async () => {
    mockPrisma.liveSession.findUnique.mockResolvedValue(null);
    const uc = new JoinLiveSessionUseCase();
    await expect(uc.execute('BADCODE', { userId: 'u1' })).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  it('ENDED oturum → SESSION_ENDED fırlatır', async () => {
    mockPrisma.liveSession.findUnique.mockResolvedValue(makeSession({ status: 'ENDED' }));
    const uc = new JoinLiveSessionUseCase();
    await expect(uc.execute('ABC123', { userId: 'u1' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('DRAFT oturum → katılıma izin verir (beklemeye alınır, reddedilmez)', async () => {
    mockPrisma.liveSession.findUnique.mockResolvedValue(makeSession({ status: 'DRAFT' }));
    const uc = new JoinLiveSessionUseCase();
    const result = await uc.execute('ABC123', { userId: 'u1' });
    expect(mockPrisma.liveParticipant.upsert).toHaveBeenCalledTimes(1);
    expect(result.sessionId).toBe('sess-1');
  });

  // ── IP kota koruması ───────────────────────────────────────────────────────

  it('aynı IP\'den limit (3) aşıldıysa → DEVICE_QUOTA_EXCEEDED (kapatma saldırısı)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ cnt: 3n }]);
    const uc = new JoinLiveSessionUseCase();
    await expect(uc.execute('ABC123', { userId: 'u-new', ip: '203.0.113.5' })).rejects.toMatchObject({
      response: { code: 'DEVICE_QUOTA_EXCEEDED' },
    });
    expect(mockPrisma.liveParticipant.upsert).not.toHaveBeenCalled();
  });

  it('kota aşımında DEVICE_QUOTA_EXCEEDED audit log yazılır (forensic iz)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ cnt: 3n }]);
    const uc = new JoinLiveSessionUseCase();
    await expect(
      uc.execute('ABC123', { userId: 'u-new', ip: '203.0.113.5' }),
    ).rejects.toMatchObject({ response: { code: 'DEVICE_QUOTA_EXCEEDED' } });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'DEVICE_QUOTA_EXCEEDED',
          entityType: 'LiveSession',
          entityId: 'sess-1',
          actorId: 'u-new',
          metadata: expect.objectContaining({ ip: '203.0.113.5', sameIpCount: 3, max: 3 }),
        }),
      }),
    );
  });

  it('audit log yazımı patlasa bile kota reddi korunur (best-effort)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ cnt: 3n }]);
    mockPrisma.auditLog.create.mockRejectedValue(new Error('db down'));
    const uc = new JoinLiveSessionUseCase();
    await expect(
      uc.execute('ABC123', { userId: 'u-new', ip: '203.0.113.5' }),
    ).rejects.toMatchObject({ response: { code: 'DEVICE_QUOTA_EXCEEDED' } });
  });

  it('normal katılımda audit log yazılmaz', async () => {
    const uc = new JoinLiveSessionUseCase();
    await uc.execute('ABC123', { userId: 'u1', ip: '203.0.113.5' });
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('aynı IP\'den limit altındaysa katılıma izin verir + join_ip kaydeder', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ cnt: 1n }]);
    const uc = new JoinLiveSessionUseCase();
    const result = await uc.execute('ABC123', { userId: 'u1', ip: '203.0.113.5' });
    expect(result.sessionId).toBe('sess-1');
    expect(mockPrisma.$executeRaw).toHaveBeenCalled();
  });

  it('IP yoksa kota kontrolü atlanır (limit sorgusu çağrılmaz)', async () => {
    const uc = new JoinLiveSessionUseCase();
    await uc.execute('ABC123', { userId: 'u1' });
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  // ── Kullanıcı hataları ─────────────────────────────────────────────────────

  it('kullanıcı bulunamazsa USER_NOT_FOUND fırlatır', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const uc = new JoinLiveSessionUseCase();
    await expect(uc.execute('ABC123', { userId: 'u-missing' })).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('kullanıcı SUSPENDED ise USER_NOT_ACTIVE fırlatır', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ status: 'SUSPENDED' }));
    const uc = new JoinLiveSessionUseCase();
    await expect(uc.execute('ABC123', { userId: 'u1' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Round 2 için round 1 katılımı yoksa NOT_IN_ROUND1 fırlatır', async () => {
    mockPrisma.liveSession.findUnique.mockResolvedValue(
      makeSession({ roundNumber: 2, parentSessionId: 'sess-parent' }),
    );
    mockPrisma.liveParticipant.findUnique.mockResolvedValue(null);
    const uc = new JoinLiveSessionUseCase();
    await expect(uc.execute('ABC123', { userId: 'u1' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ── Kapasite ──────────────────────────────────────────────────────────────

  it('kapasite dolu (updateMany count=0) → SESSION_FULL fırlatır', async () => {
    mockPrisma.liveSession.findUnique.mockResolvedValue(
      makeSession({ maxParticipants: 5, currentParticipantCount: 5 }),
    );
    mockPrisma.liveSession.updateMany.mockResolvedValue({ count: 0 });
    const uc = new JoinLiveSessionUseCase();
    await expect(uc.execute('ABC123', { userId: 'u1' })).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── Başarı yolları ────────────────────────────────────────────────────────

  it('başarı: participant oluşturulur, sessionId + participantId döner', async () => {
    const uc = new JoinLiveSessionUseCase();
    const result = await uc.execute('ABC123', { userId: 'u1' });
    expect(mockPrisma.liveParticipant.upsert).toHaveBeenCalledTimes(1);
    expect(result.sessionId).toBe('sess-1');
    expect(result.participantId).toBe('part-1');
  });

  it('mevcut katılımcı → liveSession.update çağrılmaz (kapasite artırılmaz)', async () => {
    mockPrisma.liveParticipant.findUnique.mockResolvedValue(makeParticipant());
    const uc = new JoinLiveSessionUseCase();
    await uc.execute('ABC123', { userId: 'u1' });
    expect(mockPrisma.liveSession.update).not.toHaveBeenCalled();
    expect(mockPrisma.liveSession.updateMany).not.toHaveBeenCalled();
  });

  it('limitsiz oturum → liveSession.update increment çağrılır', async () => {
    mockPrisma.liveSession.findUnique.mockResolvedValue(makeSession({ maxParticipants: null }));
    const uc = new JoinLiveSessionUseCase();
    await uc.execute('ABC123', { userId: 'u1' });
    expect(mockPrisma.liveSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentParticipantCount: { increment: 1 } }),
      }),
    );
  });

  // ── Misafir (guest) akışı ─────────────────────────────────────────────────

  it('misafir: displayName verilmezse DISPLAY_NAME_REQUIRED fırlatır', async () => {
    const uc = new JoinLiveSessionUseCase();
    await expect(uc.execute('ABC123', {})).rejects.toMatchObject({
      response: { code: 'DISPLAY_NAME_REQUIRED' },
    });
  });

  it('misafir: 1 karakter displayName → DISPLAY_NAME_REQUIRED fırlatır', async () => {
    const uc = new JoinLiveSessionUseCase();
    await expect(uc.execute('ABC123', { displayName: 'X' })).rejects.toMatchObject({
      response: { code: 'DISPLAY_NAME_REQUIRED' },
    });
  });

  it('misafir: geçerli displayName ile katılım başarılı, guestToken döner', async () => {
    const uc = new JoinLiveSessionUseCase();
    const result = await uc.execute('ABC123', { displayName: 'Ali Veli' });
    expect(result.sessionId).toBe('sess-1');
    expect(result.participantToken).toBeDefined();
    expect(typeof result.participantToken).toBe('string');
  });

  it('misafir: round2 oturumuna katılamaz → GUEST_NOT_ALLOWED_ROUND2', async () => {
    mockPrisma.liveSession.findUnique.mockResolvedValue(
      makeSession({ roundNumber: 2, parentSessionId: 'sess-parent' }),
    );
    const uc = new JoinLiveSessionUseCase();
    await expect(uc.execute('ABC123', { displayName: 'Ali Veli' })).rejects.toMatchObject({
      response: { code: 'GUEST_NOT_ALLOWED_ROUND2' },
    });
  });

  it('misafir: user.findUnique çağrılmaz (kullanıcı sorgulaması yok)', async () => {
    const uc = new JoinLiveSessionUseCase();
    await uc.execute('ABC123', { displayName: 'Misafir Biri' });
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('misafir: her katılımda yeni participant create çağrılır (upsert değil)', async () => {
    const uc = new JoinLiveSessionUseCase();
    await uc.execute('ABC123', { displayName: 'Misafir' });
    expect(mockPrisma.liveParticipant.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.liveParticipant.upsert).not.toHaveBeenCalled();
  });
});
