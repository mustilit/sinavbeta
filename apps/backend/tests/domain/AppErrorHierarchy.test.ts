/**
 * AppError sınıfı testleri
 *
 * Doğrulanan davranışlar:
 * - AppError bir Error'dır (instanceof)
 * - code, message, status, name doğru atanır
 * - details opsiyonel: verilirse saklanır
 * - Object.setPrototypeOf ile instanceof AppError çalışır
 * - Farklı status kodları desteklenir (400, 401, 403, 404, 409, 500)
 */

import { AppError } from '../../src/application/errors/AppError';

describe('AppError', () => {
  it('Error sınıfından kalıtılır', () => {
    const err = new AppError('TEST_ERROR', 'Test mesajı', 400);
    expect(err).toBeInstanceOf(Error);
  });

  it('instanceof AppError çalışır', () => {
    const err = new AppError('TEST_ERROR', 'Test mesajı', 400);
    expect(err).toBeInstanceOf(AppError);
  });

  it('code alanı doğru atanır', () => {
    const err = new AppError('USER_NOT_FOUND', 'Kullanıcı bulunamadı', 404);
    expect(err.code).toBe('USER_NOT_FOUND');
  });

  it('message alanı doğru atanır', () => {
    const err = new AppError('USER_NOT_FOUND', 'Kullanıcı bulunamadı', 404);
    expect(err.message).toBe('Kullanıcı bulunamadı');
  });

  it('status alanı doğru atanır', () => {
    const err = new AppError('FORBIDDEN', 'Erişim reddedildi', 403);
    expect(err.status).toBe(403);
  });

  it('name = "AppError" olur', () => {
    const err = new AppError('CONFLICT', 'Çakışma', 409);
    expect(err.name).toBe('AppError');
  });

  it('details opsiyonel: verilmezse undefined', () => {
    const err = new AppError('TEST_ERROR', 'Mesaj', 400);
    expect(err.details).toBeUndefined();
  });

  it('details verilirse saklanır', () => {
    const details = { field: 'email', reason: 'invalid' };
    const err = new AppError('VALIDATION_ERROR', 'Hata', 422, details);
    expect(err.details).toEqual(details);
  });

  it('400 status ile BadRequest benzeri hata oluşturulur', () => {
    const err = new AppError('INVALID_INPUT', 'Geçersiz girdi', 400);
    expect(err.status).toBe(400);
  });

  it('401 status ile Unauthorized benzeri hata oluşturulur', () => {
    const err = new AppError('UNAUTHORIZED', 'Kimlik doğrulama gerekli', 401);
    expect(err.status).toBe(401);
  });

  it('500 status ile InternalServer benzeri hata oluşturulur', () => {
    const err = new AppError('INTERNAL_ERROR', 'Sunucu hatası', 500);
    expect(err.status).toBe(500);
  });

  it('hata fırlatılıp yakalanabilir', () => {
    expect(() => {
      throw new AppError('THROWN_ERROR', 'Fırlatıldı', 400);
    }).toThrow(AppError);
  });
});
