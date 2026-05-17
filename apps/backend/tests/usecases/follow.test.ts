import { FollowUseCase } from '../../src/application/use-cases/educator/FollowUseCase';
import { UnfollowUseCase } from '../../src/application/use-cases/educator/UnfollowUseCase';

test('follow idempotent', async () => {
  const repo: any = {
    upsertFollow: jest.fn().mockResolvedValue(undefined),
  };
  const audit: any = { create: jest.fn().mockResolvedValue(undefined) };
  const uc = new FollowUseCase(repo, audit);
  await uc.execute({ followerId: 'c1', followType: 'EDUCATOR', educatorId: 'e1', notificationsEnabled: true });
  await uc.execute({ followerId: 'c1', followType: 'EDUCATOR', educatorId: 'e1', notificationsEnabled: true });
  expect(repo.upsertFollow).toHaveBeenCalledTimes(2);
});

test('unfollow idempotent', async () => {
  const repo: any = { deleteFollow: jest.fn().mockResolvedValue(undefined) };
  const audit: any = { create: jest.fn().mockResolvedValue(undefined) };
  const uc = new UnfollowUseCase(repo, audit);
  await uc.execute({ followerId: 'c1', followType: 'EDUCATOR', educatorId: 'e1' });
  await uc.execute({ followerId: 'c1', followType: 'EDUCATOR', educatorId: 'e1' });
  expect(repo.deleteFollow).toHaveBeenCalledTimes(2);
});

