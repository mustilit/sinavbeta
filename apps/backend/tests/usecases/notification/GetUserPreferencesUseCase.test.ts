/**
 * GetUserPreferencesUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - userId yoksa UNAUTHORIZED
 * - Tercih kaydı yoksa boş obje ({}) döner
 * - preferences null ise boş obje döner
 * - Başarı: preferences objesi döner
 */

jest.mock('../../../src/application/use-cases/notification/UpdateUserPreferencesUseCase', () => ({
  decryptPreferencesPII: jest.fn().mockImplementation((prefs: any) => prefs),
}));

import { GetUserPreferencesUseCase } from '../../../src/application/use-cases/notification/GetUserPreferencesUseCase';

function makeRepo(pref: any = null) {
  return { findByUserId: jest.fn().mockResolvedValue(pref) };
}

describe('GetUserPreferencesUseCase', () => {
  it('userId yoksa UNAUTHORIZED fırlatır', async () => {
    const uc = new GetUserPreferencesUseCase(makeRepo() as any);
    await expect(uc.execute(undefined)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('tercih kaydı yoksa boş obje döner', async () => {
    const uc = new GetUserPreferencesUseCase(makeRepo(null) as any);
    const result = await uc.execute('user-1');
    expect(result).toEqual({});
  });

  it('preferences null ise boş obje döner', async () => {
    const uc = new GetUserPreferencesUseCase(makeRepo({ userId: 'user-1', preferences: null }) as any);
    const result = await uc.execute('user-1');
    expect(result).toEqual({});
  });

  it('başarı: preferences objesi döner', async () => {
    const prefs = { theme: 'dark', language: 'tr', marketing: false };
    const uc = new GetUserPreferencesUseCase(
      makeRepo({ userId: 'user-1', preferences: prefs }) as any,
    );
    const result = await uc.execute('user-1');
    expect(result).toMatchObject({ theme: 'dark', language: 'tr' });
  });

  it('repo.findByUserId userId ile çağrılır', async () => {
    const repo = makeRepo(null);
    const uc = new GetUserPreferencesUseCase(repo as any);
    await uc.execute('user-42');
    expect(repo.findByUserId).toHaveBeenCalledWith('user-42');
  });
});
