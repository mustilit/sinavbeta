// @ts-nocheck
import { UpdateNotificationPreferencesUseCase } from '../../src/application/use-cases/notification/UpdateNotificationPreferencesUseCase';

test('update notification preferences creates or updates', async () => {
  const repo: any = {
    findByUserId: async () => null,
    updateByUserId: async (u, f) => ({ id: 'np1', userId: u, emailEnabled: f.emailEnabled ?? true }),
  };
  const uc = new UpdateNotificationPreferencesUseCase(repo);
  const res = await uc.execute('u1', { emailEnabled: false });
  expect(res.userId).toBe('u1');
});

