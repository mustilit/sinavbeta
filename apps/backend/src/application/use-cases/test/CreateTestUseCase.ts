import { IExamRepository } from '../../../domain/interfaces/IExamRepository';
import { IExamTypeRepository } from '../../../domain/interfaces/IExamTypeRepository';
import { ITopicRepository } from '../../../domain/interfaces/ITopicRepository';
import { ExamTest, ExamQuestion } from '../../../domain/entities/Exam';
import { AppError } from '../../errors/AppError';
import { randomUUID } from 'crypto';
import { prisma } from '../../../infrastructure/database/prisma';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CreateTestUseCase {
  constructor(
    private readonly examRepository: IExamRepository,
    private readonly examTypeRepository: IExamTypeRepository,
    private readonly topicRepository: ITopicRepository,
  ) {}

  async execute(input: {
    title: string;
    isTimed?: boolean;
    duration?: number;
    price?: number;
    educatorId?: string;
    examTypeId?: string | null;
    gradeLevelId?: string | null;
    topicId?: string | null;
    questions?: (ExamQuestion & { options: any[] })[];
  }) {
    // Kill-switch: package/test creation disabled
    const settings = await prisma.adminSettings.findFirst({ where: { id: 1 } });
    if (settings && settings.packageCreationEnabled === false) {
      throw new AppError('PACKAGE_CREATION_DISABLED', 'Test oluşturma geçici olarak durdurulmuştur', 503);
    }

    let examTypeId: string | null = input.examTypeId ?? null;
    let topicId: string | null = input.topicId ?? null;

    // If topicId given but no examTypeId: set examTypeId from topic
    if (topicId && !examTypeId) {
      const topic = await this.topicRepository.findById(topicId);
      if (!topic) {
        throw new AppError('TOPIC_NOT_FOUND', 'Topic not found', 404);
      }
      examTypeId = topic.examTypeId;
    }

    // If examTypeId given: must exist
    if (examTypeId) {
      if (!UUID_REGEX.test(examTypeId)) {
        throw new AppError('INVALID_UUID', 'Invalid examTypeId', 400);
      }
      const examType = await this.examTypeRepository.findById(examTypeId);
      if (!examType) {
        throw new AppError('EXAMTYPE_NOT_FOUND', 'Exam type not found', 404);
      }
    }

    // If topicId given: must exist and topic.examTypeId must match examTypeId
    if (topicId) {
      if (!UUID_REGEX.test(topicId)) {
        throw new AppError('INVALID_UUID', 'Invalid topicId', 400);
      }
      const topic = await this.topicRepository.findById(topicId);
      if (!topic) {
        throw new AppError('TOPIC_NOT_FOUND', 'Topic not found', 404);
      }
      if (examTypeId && topic.examTypeId !== examTypeId) {
        throw new AppError('TOPIC_EXAMTYPE_MISMATCH', 'Topic does not belong to the given exam type', 409);
      }
    }

    // Eğitici sınav türü/konu seçmediyse sistem "Diğer" fallback'ini atar.
    // ("Diğer" satırları seed + migration ile garanti edilir; bulunamazsa null kalır.)
    if (!examTypeId) {
      const other = await prisma.examType.findUnique({ where: { slug: 'diger' } });
      if (other) examTypeId = other.id;
    }
    if (!topicId) {
      const otherTopic = await prisma.topic.findFirst({ where: { slug: 'diger' } });
      if (otherTopic) topicId = otherTopic.id;
    }

    // Sınıf (GradeLevel): eğitici seçmediyse "Genel" fallback.
    let gradeLevelId: string | null = input.gradeLevelId ?? null;
    if (!gradeLevelId) {
      const genel = await prisma.gradeLevel.findUnique({ where: { slug: 'genel' } });
      if (genel) gradeLevelId = genel.id;
    }

    const id = randomUUID();
    const test: ExamTest = {
      id,
      title: input.title,
      isTimed: !!input.isTimed,
      duration: input.duration ?? null,
      status: 'DRAFT',
      educatorId: input.educatorId ?? null,
      examTypeId: examTypeId ?? undefined,
      gradeLevelId: gradeLevelId ?? undefined,
      topicId: topicId ?? undefined,
      metadata: {},
      price: input.price,
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    const questions = (input.questions ?? []).map((q) => ({ ...q, id: q.id ?? randomUUID() }));
    return this.examRepository.save(test, questions);
  }
}
