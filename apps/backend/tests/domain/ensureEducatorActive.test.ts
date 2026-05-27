/**
 * ensureEducatorActive policy testleri
 *
 * Doğrulanan davranışlar:
 * - CANDIDATE rolü → USER_NOT_EDUCATOR
 * - ADMIN rolü → USER_NOT_EDUCATOR
 * - SUSPENDED educator → EDUCATOR_SUSPENDED
 * - educatorApprovedAt = null → EDUCATOR_NOT_APPROVED
 * - Aktif ve onaylı educator → hata fırlatmaz
 */

import { ensureEducatorActive } from '../../src/application/policies/ensureEducatorActive';
import { AppError } from '../../src/application/errors/AppError';

function makeEducator(overrides: Record<string, any> = {}) {
  return {
    id: 'edu-1',
    role: 'EDUCATOR' as const,
    status: 'ACTIVE' as const,
    educatorApprovedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

describe('ensureEducatorActive', () => {
  it('CANDIDATE rolü → USER_NOT_EDUCATOR AppError fırlatır', () => {
    expect(() => ensureEducatorActive(makeEducator({ role: 'CANDIDATE' }))).toThrow(AppError);
    expect(() => ensureEducatorActive(makeEducator({ role: 'CANDIDATE' }))).toThrow(
      expect.objectContaining({ code: 'USER_NOT_EDUCATOR' }),
    );
  });

  it('ADMIN rolü → USER_NOT_EDUCATOR AppError fırlatır', () => {
    expect(() => ensureEducatorActive(makeEducator({ role: 'ADMIN' }))).toThrow(
      expect.objectContaining({ code: 'USER_NOT_EDUCATOR' }),
    );
  });

  it('WORKER rolü → USER_NOT_EDUCATOR AppError fırlatır', () => {
    expect(() => ensureEducatorActive(makeEducator({ role: 'WORKER' }))).toThrow(
      expect.objectContaining({ code: 'USER_NOT_EDUCATOR' }),
    );
  });

  it('SUSPENDED educator → EDUCATOR_SUSPENDED AppError fırlatır', () => {
    expect(() => ensureEducatorActive(makeEducator({ status: 'SUSPENDED' }))).toThrow(
      expect.objectContaining({ code: 'EDUCATOR_SUSPENDED' }),
    );
  });

  it('educatorApprovedAt = null → EDUCATOR_NOT_APPROVED AppError fırlatır', () => {
    expect(() => ensureEducatorActive(makeEducator({ educatorApprovedAt: null }))).toThrow(
      expect.objectContaining({ code: 'EDUCATOR_NOT_APPROVED' }),
    );
  });

  it('educatorApprovedAt = undefined → EDUCATOR_NOT_APPROVED AppError fırlatır', () => {
    expect(() => ensureEducatorActive(makeEducator({ educatorApprovedAt: undefined }))).toThrow(
      expect.objectContaining({ code: 'EDUCATOR_NOT_APPROVED' }),
    );
  });

  it('aktif ve onaylı educator → hata fırlatmaz', () => {
    expect(() => ensureEducatorActive(makeEducator())).not.toThrow();
  });

  it('AppError status 403 döner (role hatası)', () => {
    try {
      ensureEducatorActive(makeEducator({ role: 'CANDIDATE' }));
    } catch (e: any) {
      expect(e.status).toBe(403);
    }
  });

  it('AppError status 403 döner (suspended)', () => {
    try {
      ensureEducatorActive(makeEducator({ status: 'SUSPENDED' }));
    } catch (e: any) {
      expect(e.status).toBe(403);
    }
  });
});
