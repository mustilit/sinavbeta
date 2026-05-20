// @ts-nocheck
export interface UserPreferenceRecord {
  id: string;
  userId: string;
  preferences: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserPreferenceRepository {
  findByUserId(userId: string): Promise<UserPreferenceRecord | null>;
  upsert(userId: string, preferences: Record<string, unknown>): Promise<UserPreferenceRecord>;
}
