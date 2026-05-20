// @ts-nocheck
import { Topic } from '../entities/Topic';

export interface CreateTopicInput {
  examTypeId: string;
  name: string;
  slug: string;
  active?: boolean;
}

export interface ITopicRepository {
  create(input: CreateTopicInput): Promise<Topic>;
  findById(id: string): Promise<Topic | null>;
  listByExamType(examTypeId: string, activeOnly?: boolean): Promise<Topic[]>;
  findByExamTypeAndSlug(examTypeId: string, slug: string): Promise<Topic | null>;
  update(id: string, data: { name?: string; slug?: string; active?: boolean }): Promise<Topic | null>;
  delete(id: string): Promise<boolean>;
}
