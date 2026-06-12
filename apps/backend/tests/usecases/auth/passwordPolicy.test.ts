import { assertPasswordPolicy } from '../../../src/application/use-cases/auth/passwordPolicy';

// Pure function testi — Prisma mock gerekmez.
// AAA pattern: her test tek davranışı doğrular.

describe('assertPasswordPolicy', () => {
  describe('geçerli şifreler', () => {
    it('büyük harf + küçük harf + rakam + 8 karakter varsa hata fırlatmaz', () => {
      expect(() => assertPasswordPolicy('Securepass1')).not.toThrow();
    });

    it('tam 8 karakter → geçerli', () => {
      expect(() => assertPasswordPolicy('Abcde1fg')).not.toThrow();
    });

    it('uzun şifre geçerli', () => {
      expect(() => assertPasswordPolicy('SuperSecure123!!')).not.toThrow();
    });
  });

  describe('geçersiz şifreler → WEAK_PASSWORD', () => {
    it('7 karakter → WEAK_PASSWORD', () => {
      expect(() => assertPasswordPolicy('Short1A')).toThrow(
        expect.objectContaining({ code: 'WEAK_PASSWORD', status: 400 }),
      );
    });

    it('büyük harf yoksa → WEAK_PASSWORD', () => {
      expect(() => assertPasswordPolicy('alllower1')).toThrow(
        expect.objectContaining({ code: 'WEAK_PASSWORD' }),
      );
    });

    it('küçük harf yoksa → WEAK_PASSWORD', () => {
      expect(() => assertPasswordPolicy('ALLUPPER1')).toThrow(
        expect.objectContaining({ code: 'WEAK_PASSWORD' }),
      );
    });

    it('rakam yoksa → WEAK_PASSWORD', () => {
      expect(() => assertPasswordPolicy('NoDigitsHere')).toThrow(
        expect.objectContaining({ code: 'WEAK_PASSWORD' }),
      );
    });

    it('boş string → WEAK_PASSWORD', () => {
      expect(() => assertPasswordPolicy('')).toThrow(
        expect.objectContaining({ code: 'WEAK_PASSWORD' }),
      );
    });

    it('undefined → WEAK_PASSWORD', () => {
      expect(() => assertPasswordPolicy(undefined)).toThrow(
        expect.objectContaining({ code: 'WEAK_PASSWORD' }),
      );
    });

    it('null → WEAK_PASSWORD', () => {
      expect(() => assertPasswordPolicy(null)).toThrow(
        expect.objectContaining({ code: 'WEAK_PASSWORD' }),
      );
    });

    it('hata mesajı 8 karakter koşulunu içerir', () => {
      expect(() => assertPasswordPolicy('short')).toThrow(
        expect.objectContaining({ message: expect.stringContaining('8') }),
      );
    });
  });
});
