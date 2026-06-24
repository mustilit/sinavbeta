/**
 * schoolHelpers — saf yardımcılar (prisma'sız):
 * username format + geçici şifre üretimi.
 */
import { formatSchoolUsername, generateTempPassword } from '../../../src/application/use-cases/school/schoolHelpers';

describe('formatSchoolUsername', () => {
  it('KOD-ROL-0000 formatı (4 hane sıfır dolgulu)', () => {
    expect(formatSchoolUsername('ANK', 'TEACHER', 42)).toBe('ANK-T-0042');
    expect(formatSchoolUsername('IST', 'DEPT_HEAD', 7)).toBe('IST-D-0007');
    expect(formatSchoolUsername('ank', 'STUDENT', 1138)).toBe('ANK-S-1138');
    expect(formatSchoolUsername('ANK', 'SCHOOL_ADMIN', 1)).toBe('ANK-A-0001');
    expect(formatSchoolUsername('ANK', 'BRANCH_ADMIN', 3)).toBe('ANK-B-0003');
  });

  it('1000+ sıra numarasında dolgu büyür', () => {
    expect(formatSchoolUsername('ANK', 'STUDENT', 12345)).toBe('ANK-S-12345');
  });
});

describe('generateTempPassword', () => {
  it('varsayılan 8 karakter', () => {
    expect(generateTempPassword()).toHaveLength(8);
  });
  it('karışabilen karakter içermez (0,O,1,l,I)', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTempPassword(12)).not.toMatch(/[0O1lI]/);
    }
  });
  it('istenen uzunlukta üretir', () => {
    expect(generateTempPassword(16)).toHaveLength(16);
  });
});
