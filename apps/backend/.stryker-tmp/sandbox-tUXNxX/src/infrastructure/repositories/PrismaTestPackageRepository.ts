// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { prisma } from '../database/prisma';
import {
  ITestPackageRepository,
  TestPackageRecord,
  TestPackageTest,
  TestPackageQuestion,
  TestPackageQuestionOption,
  CreateTestPackageInput,
  UpdateTestPackageInput,
} from '../../domain/interfaces/ITestPackageRepository';

@Injectable()
export class PrismaTestPackageRepository implements ITestPackageRepository {
  private mapTest(t: any): TestPackageTest {
    const questions: TestPackageQuestion[] | undefined = t.questions?.map((q: any) => ({
      id: q.id,
      content: q.content,
      mediaUrl: q.mediaUrl ?? null,
      order: q.order,
      topicId: (q as any).topicId ?? null,
      options: ((q.options ?? []) as any[]).map((o: any): TestPackageQuestionOption => ({
        id: o.id,
        content: o.content,
        mediaUrl: o.mediaUrl ?? null,
        isCorrect: o.isCorrect,
      })),
    }));

    return {
      id: t.id,
      title: t.title,
      examTypeId: t.examTypeId ?? null,
      examTypeName: t.examType?.name ?? null,
      isTimed: t.isTimed,
      duration: t.duration ?? null,
      durationSec: t.durationSec ?? null,
      questionCount: t.questions?.length ?? t._count?.questions ?? t.questionCount ?? null,
      status: t.status,
      publishedAt: t.publishedAt ?? null,
      ...(questions !== undefined && { questions }),
    };
  }

  private mapRecord(pkg: any, includeTests = false): TestPackageRecord {
    return {
      id: pkg.id,
      tenantId: pkg.tenantId,
      educatorId: pkg.educatorId ?? null,
      title: pkg.title,
      description: pkg.description ?? null,
      priceCents: pkg.priceCents,
      difficulty: pkg.difficulty ?? 'medium',
      isActive: pkg.isActive,
      publishedAt: pkg.publishedAt ?? null,
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt,
      ...(includeTests && { tests: (pkg.tests ?? []).map((t: any) => this.mapTest(t)) }),
    };
  }

  async create(input: CreateTestPackageInput): Promise<TestPackageRecord> {
    const pkg = await (prisma.testPackage as any).create({
      data: {
        tenantId: input.tenantId,
        educatorId: input.educatorId,
        title: input.title,
        description: input.description ?? null,
        priceCents: input.priceCents,
        difficulty: input.difficulty ?? 'medium',
      },
    });
    return this.mapRecord(pkg);
  }

  async findById(id: string): Promise<TestPackageRecord | null> {
    const pkg = await (prisma.testPackage as any).findUnique({ where: { id } });
    return pkg ? this.mapRecord(pkg) : null;
  }

  async findByIdWithTests(id: string): Promise<TestPackageRecord | null> {
    const pkg = await (prisma.testPackage as any).findUnique({
      where: { id },
      include: {
        tests: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          include: {
            questions: {
              orderBy: { order: 'asc' },
              include: { options: true },
            },
          },
        },
      },
    });
    return pkg ? this.mapRecord(pkg, true) : null;
  }

  async findByEducatorId(educatorId: string): Promise<TestPackageRecord[]> {
    const pkgs = await (prisma.testPackage as any).findMany({
      where: { educatorId },
      include: {
        tests: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          include: {
            _count: { select: { questions: true } },
            examType: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return pkgs.map((p: any) => this.mapRecord(p, true));
  }

  async update(id: string, input: UpdateTestPackageInput): Promise<TestPackageRecord> {
    const pkg = await (prisma.testPackage as any).update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.priceCents !== undefined && { priceCents: input.priceCents }),
      },
    });
    return this.mapRecord(pkg);
  }

  async addTest(packageId: string, testId: string): Promise<void> {
    await prisma.examTest.update({
      where: { id: testId },
      data: { packageId },
    });
  }

  async removeTest(packageId: string, testId: string): Promise<void> {
    // Sadece bu pakete ait ise null'a çek
    await prisma.examTest.updateMany({
      where: { id: testId, packageId },
      data: { packageId: null },
    });
  }

  async publish(id: string): Promise<TestPackageRecord> {
    const now = new Date();
    // Paket fiyatını al
    const pkg = await (prisma.testPackage as any).findUnique({ where: { id } });

    // Her test için gerçek soru sayısını hesapla ve güncelle
    const tests = await prisma.examTest.findMany({
      where: { packageId: id, deletedAt: null },
      select: { id: true },
    });
    await Promise.all(
      tests.map(async (t) => {
        const cnt = await prisma.examQuestion.count({ where: { testId: t.id } });
        await prisma.examTest.update({
          where: { id: t.id },
          data: {
            publishedAt: now,
            status: 'PUBLISHED',
            priceCents: pkg?.priceCents ?? 0,
            questionCount: cnt,
          },
        });
      }),
    );

    // Paketi yayınla
    await (prisma.testPackage as any).update({
      where: { id },
      data: { publishedAt: now, isActive: true },
    });

    const updated = await (prisma.testPackage as any).findUnique({ where: { id } });
    return this.mapRecord(updated);
  }

  async unpublish(id: string): Promise<TestPackageRecord> {
    // Paketi ve pakete bağlı tüm ExamTest'leri aynı anda yayından kaldır
    await prisma.$transaction([
      (prisma.testPackage as any).update({
        where: { id },
        data: { publishedAt: null, isActive: false },
      }),
      prisma.examTest.updateMany({
        where: { packageId: id, deletedAt: null },
        data: { publishedAt: null, status: 'DRAFT' },
      }),
    ]);
    const pkg = await (prisma.testPackage as any).findUnique({ where: { id } });
    return this.mapRecord(pkg);
  }
}
