// @ts-nocheck
import { ExamType } from '../entities/ExamType';

export interface IExamTypeRepository {
  create(input: { name: string; slug: string; description?: string | null; metadata?: Record<string, unknown> | null; active?: boolean }): Promise<ExamType>;
  findBySlug(slug: string): Promise<ExamType | null>;
  findById(id: string): Promise<ExamType | null>;
  list(filter?: { activeOnly?: boolean }): Promise<ExamType[]>;
  update(id: string, data: { name?: string; slug?: string; description?: string | null; active?: boolean }): Promise<ExamType | null>;
  delete(id: string): Promise<boolean>;
}

