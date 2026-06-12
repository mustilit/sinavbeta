/**
 * resolveLiveParticipant — pure async function, Prisma mock gerekli.
 *
 * Davranışlar:
 * - actor yoksa null döner
 * - userId verilince sessionId_userId composite key ile findUnique
 * - guestToken verilince guestToken unique ile findUnique; aynı session ise katılımcı döner
 * - guestToken başka sessionId'ye aitse null döner
 * - ne userId ne guestToken yoksa null döner
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    liveParticipant: {
      findUnique: jest.fn(),
    },
  },
}));

import { resolveLiveParticipant } from '../../../src/application/use-cases/live/resolveLiveParticipant';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockPrisma = prisma as any;

const SESSION_ID = 'session-1';
const PARTICIPANT = { id: 'part-1', sessionId: SESSION_ID, userId: 'u1', guestToken: null };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveLiveParticipant', () => {
  describe('actor yoksa', () => {
    it('undefined actor → null döner, findUnique çağrılmaz', async () => {
      const result = await resolveLiveParticipant(SESSION_ID, undefined);
      expect(result).toBeNull();
      expect(mockPrisma.liveParticipant.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('userId yolu', () => {
    it('userId verilince sessionId_userId composite key ile aranır', async () => {
      mockPrisma.liveParticipant.findUnique.mockResolvedValue(PARTICIPANT);

      const result = await resolveLiveParticipant(SESSION_ID, { userId: 'u1' });

      expect(mockPrisma.liveParticipant.findUnique).toHaveBeenCalledWith({
        where: { sessionId_userId: { sessionId: SESSION_ID, userId: 'u1' } },
      });
      expect(result).toEqual(PARTICIPANT);
    });

    it('kayıt yoksa null döner', async () => {
      mockPrisma.liveParticipant.findUnique.mockResolvedValue(null);

      const result = await resolveLiveParticipant(SESSION_ID, { userId: 'u-missing' });

      expect(result).toBeNull();
    });
  });

  describe('guestToken yolu', () => {
    it('guestToken verilince token ile aranır ve aynı session ise katılımcı döner', async () => {
      const guest = { id: 'part-g', sessionId: SESSION_ID, userId: null, guestToken: 'tok-abc' };
      mockPrisma.liveParticipant.findUnique.mockResolvedValue(guest);

      const result = await resolveLiveParticipant(SESSION_ID, { guestToken: 'tok-abc' });

      expect(mockPrisma.liveParticipant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ guestToken: 'tok-abc' }) }),
      );
      expect(result).toEqual(guest);
    });

    it('guestToken başka sessionId\'ye aitse null döner', async () => {
      const guest = { id: 'part-g', sessionId: 'other-session', userId: null, guestToken: 'tok-xyz' };
      mockPrisma.liveParticipant.findUnique.mockResolvedValue(guest);

      const result = await resolveLiveParticipant(SESSION_ID, { guestToken: 'tok-xyz' });

      expect(result).toBeNull();
    });

    it('token kayıt yoksa null döner', async () => {
      mockPrisma.liveParticipant.findUnique.mockResolvedValue(null);

      const result = await resolveLiveParticipant(SESSION_ID, { guestToken: 'no-such-token' });

      expect(result).toBeNull();
    });
  });

  describe('ne userId ne guestToken', () => {
    it('boş actor → null döner, findUnique çağrılmaz', async () => {
      const result = await resolveLiveParticipant(SESSION_ID, {});
      expect(result).toBeNull();
      expect(mockPrisma.liveParticipant.findUnique).not.toHaveBeenCalled();
    });
  });
});
