export interface TestPackageQuestionOption {
  id: string;
  content: string;
  mediaUrl: string | null;
  isCorrect: boolean;
}

export interface TestPackageQuestion {
  id: string;
  content: string;
  mediaUrl: string | null;
  order: number;
  topicId: string | null;
  options: TestPackageQuestionOption[];
}

export interface TestPackageTest {
  id: string;
  title: string;
  examTypeId: string | null;
  examTypeName: string | null;
  isTimed: boolean;
  duration: number | null;
  durationSec: number | null;
  questionCount: number | null;
  status: string;
  publishedAt: Date | null;
  questions?: TestPackageQuestion[];
}

export interface TestPackageRecord {
  id: string;
  tenantId: string;
  educatorId: string | null;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  priceCents: number;
  difficulty: string;
  language: string;
  isActive: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tests?: TestPackageTest[];
}

export interface CreateTestPackageInput {
  tenantId: string;
  educatorId: string;
  title: string;
  description?: string | null;
  priceCents: number;
  difficulty?: string;
  language?: string;
  coverImageUrl?: string | null;
}

export interface UpdateTestPackageInput {
  title?: string;
  description?: string | null;
  priceCents?: number;
  language?: string;
  coverImageUrl?: string | null;
}

export interface ITestPackageRepository {
  create(input: CreateTestPackageInput): Promise<TestPackageRecord>;
  findById(id: string): Promise<TestPackageRecord | null>;
  findByIdWithTests(id: string): Promise<TestPackageRecord | null>;
  findByEducatorId(educatorId: string): Promise<TestPackageRecord[]>;
  update(id: string, input: UpdateTestPackageInput): Promise<TestPackageRecord>;
  addTest(packageId: string, testId: string): Promise<void>;
  removeTest(packageId: string, testId: string): Promise<void>;
  publish(id: string): Promise<TestPackageRecord>;
  unpublish(id: string): Promise<TestPackageRecord>;
}
