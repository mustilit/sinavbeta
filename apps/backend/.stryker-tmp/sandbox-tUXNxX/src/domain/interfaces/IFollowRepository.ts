// @ts-nocheck
export interface Follow {
  id: string;
  followerId: string;
  followType: 'EDUCATOR' | 'EXAM_TYPE';
  educatorId?: string | null;
  examTypeId?: string | null;
}

export interface IFollowRepository {
  listFollowersForEducator(educatorId: string): Promise<string[]>; // userIds
  listFollowersForExamType(examTypeId: string): Promise<string[]>;
  listFollowedEducatorIds(followerId: string): Promise<string[]>;
  listFollowedExamTypeIds(followerId: string): Promise<string[]>;
  upsertFollow(input: { followerId: string; followType: 'EDUCATOR' | 'EXAM_TYPE'; educatorId?: string | null; examTypeId?: string | null; notificationsEnabled?: boolean }): Promise<void>;
  deleteFollow(input: { followerId: string; followType: 'EDUCATOR' | 'EXAM_TYPE'; educatorId?: string | null; examTypeId?: string | null }): Promise<void>;
  listFollowsByFollower(followerId: string, followType?: 'EDUCATOR' | 'EXAM_TYPE'): Promise<Follow[]>;
  listFollowerIdsByEducator(educatorId: string): Promise<string[]>;
  listFollowerIdsByExamType(examTypeId: string): Promise<string[]>;
}

