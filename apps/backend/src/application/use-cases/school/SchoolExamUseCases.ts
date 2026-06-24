/**
 * E-Sınıf — Sprint 2: Öğretmen sınav içeriği (özel) + havuz use-case'leri.
 * 3 tür: TEST/TUNNEL (şıklı, otomatik puanlanabilir), WRITTEN (açık uçlu).
 * Havuz görünürlüğü: DEPARTMENT (zümre) / SCHOOL (tüm okul).
 */
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { getDefaultTenantId } from '../../../common/tenant';
import { logger } from '../../../infrastructure/logger/logger';
import { resolveSchoolContext, requireSchoolRole, type SchoolContext } from './schoolHelpers';

type ExamType = 'TEST' | 'TUNNEL' | 'WRITTEN';
const EXAM_TYPES: ExamType[] = ['TEST', 'TUNNEL', 'WRITTEN'];
const MAX_TITLE = 200;

/** Sınavı düzenleyebilir mi: sahibi VEYA aynı zümrenin başkanı. */
function canManage(exam: { createdById: string; departmentId: string | null }, ctx: SchoolContext, actorId: string): boolean {
  if (exam.createdById === actorId) return true;
  if (ctx.schoolRole === 'DEPT_HEAD' && exam.departmentId && exam.departmentId === ctx.departmentId) return true;
  return false;
}

export class CreateSchoolExamUseCase {
  async execute(
    input: { examType: string; title: string; subject?: string; gradeLevel?: number; topic?: string; durationMinutes?: number; poolVisibility?: string },
    actorId?: string,
  ) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD');

    const examType = input.examType as ExamType;
    if (!EXAM_TYPES.includes(examType)) throw new AppError('INVALID_EXAM_TYPE', 'Geçersiz sınav türü', 400);
    const title = (input.title ?? '').trim();
    if (!title) throw new AppError('TITLE_REQUIRED', 'Sınav başlığı zorunlu', 400);
    if (title.length > MAX_TITLE) throw new AppError('TITLE_TOO_LONG', `Başlık en fazla ${MAX_TITLE} karakter`, 400);
    if (!ctx.departmentId) throw new AppError('NO_DEPARTMENT', 'Sınav oluşturmak için bir zümreye atanmış olmalısınız', 409);

    // Ders: verilmezse zümrenin dersinden türet
    let subject = (input.subject ?? '').trim();
    if (!subject) {
      const dept = await prisma.department.findUnique({ where: { id: ctx.departmentId }, select: { subject: true } });
      subject = dept?.subject ?? '';
    }
    if (!subject) throw new AppError('SUBJECT_REQUIRED', 'Ders zorunlu', 400);

    const grade = input.gradeLevel != null ? Math.floor(input.gradeLevel) : null;
    if (grade != null && (grade < 1 || grade > 12)) throw new AppError('INVALID_GRADE', 'Sınıf seviyesi 1-12 olmalı', 400);
    const visibility = input.poolVisibility === 'SCHOOL' ? 'SCHOOL' : 'DEPARTMENT';

    const created = await prisma.schoolExam.create({
      data: {
        schoolId: ctx.schoolId,
        departmentId: ctx.departmentId,
        createdById: actorId as string,
        examType: examType as any,
        subject,
        gradeLevel: grade,
        topic: (input.topic ?? '').trim() || null,
        title,
        durationMinutes: input.durationMinutes != null ? Math.max(0, Math.floor(input.durationMinutes)) || null : null,
        poolVisibility: visibility as any,
        tenantId: getDefaultTenantId(),
      },
    });
    logger.info('school.exam.created', { id: created.id, examType, schoolId: ctx.schoolId, actorId });
    return created;
  }
}

export class UpdateSchoolExamUseCase {
  async execute(
    examId: string,
    input: { title?: string; subject?: string; gradeLevel?: number | null; topic?: string | null; durationMinutes?: number | null; poolVisibility?: string },
    actorId?: string,
  ) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD');
    const exam = await prisma.schoolExam.findFirst({ where: { id: examId, schoolId: ctx.schoolId }, select: { id: true, createdById: true, departmentId: true } });
    if (!exam) throw new AppError('EXAM_NOT_FOUND', 'Sınav bulunamadı', 404);
    if (!canManage(exam, ctx, actorId as string)) throw new AppError('FORBIDDEN', 'Bu sınavı düzenleyemezsiniz', 403);

    const data: Record<string, unknown> = {};
    if (input.title !== undefined) {
      const t = input.title.trim();
      if (!t) throw new AppError('TITLE_REQUIRED', 'Başlık zorunlu', 400);
      data.title = t;
    }
    if (input.subject !== undefined) data.subject = input.subject.trim() || undefined;
    if (input.gradeLevel !== undefined) {
      const g = input.gradeLevel == null ? null : Math.floor(input.gradeLevel);
      if (g != null && (g < 1 || g > 12)) throw new AppError('INVALID_GRADE', 'Sınıf seviyesi 1-12 olmalı', 400);
      data.gradeLevel = g;
    }
    if (input.topic !== undefined) data.topic = (input.topic ?? '').trim() || null;
    if (input.durationMinutes !== undefined) data.durationMinutes = input.durationMinutes == null ? null : Math.max(0, Math.floor(input.durationMinutes)) || null;
    if (input.poolVisibility !== undefined) data.poolVisibility = (input.poolVisibility === 'SCHOOL' ? 'SCHOOL' : 'DEPARTMENT') as any;

    const updated = await prisma.schoolExam.update({ where: { id: examId }, data });
    logger.info('school.exam.updated', { id: examId, actorId, changedFields: Object.keys(data) });
    return updated;
  }
}

/** Soruları + şıkları topluca kaydeder (replace). Tür bazlı doğrulama + totalPoints recompute. */
export class SaveSchoolExamQuestionsUseCase {
  async execute(
    examId: string,
    input: { questions: Array<{ content: string; mediaUrl?: string; points?: number; solutionText?: string; solutionMediaUrl?: string; options?: Array<{ content: string; isCorrect?: boolean }> }> },
    actorId?: string,
  ) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD');
    const exam = await prisma.schoolExam.findFirst({ where: { id: examId, schoolId: ctx.schoolId }, select: { id: true, createdById: true, departmentId: true, examType: true } });
    if (!exam) throw new AppError('EXAM_NOT_FOUND', 'Sınav bulunamadı', 404);
    if (!canManage(exam, ctx, actorId as string)) throw new AppError('FORBIDDEN', 'Bu sınavı düzenleyemezsiniz', 403);

    const qs = Array.isArray(input.questions) ? input.questions : [];
    if (qs.length === 0) throw new AppError('NO_QUESTIONS', 'En az bir soru gerekli', 400);

    const isChoice = exam.examType === 'TEST' || exam.examType === 'TUNNEL';
    let totalPoints = 0;
    // Doğrulama
    qs.forEach((q, i) => {
      if (!q.content || !q.content.trim()) throw new AppError('QUESTION_CONTENT_REQUIRED', `Soru ${i + 1}: içerik zorunlu`, 400);
      const pts = q.points != null ? Math.max(1, Math.floor(q.points)) : 1;
      totalPoints += pts;
      if (isChoice) {
        const opts = q.options ?? [];
        if (opts.length < 2) throw new AppError('TOO_FEW_OPTIONS', `Soru ${i + 1}: en az 2 şık gerekli`, 400);
        const correct = opts.filter((o) => o.isCorrect).length;
        if (correct !== 1) throw new AppError('ONE_CORRECT_REQUIRED', `Soru ${i + 1}: tam olarak 1 doğru şık olmalı`, 400);
        opts.forEach((o, j) => { if (!o.content || !o.content.trim()) throw new AppError('OPTION_CONTENT_REQUIRED', `Soru ${i + 1}, şık ${j + 1}: içerik zorunlu`, 400); });
      } else {
        // WRITTEN: çözüm referansı zorunlu
        if (!q.solutionText || !q.solutionText.trim()) throw new AppError('SOLUTION_REQUIRED', `Soru ${i + 1}: çözüm metni zorunlu`, 400);
      }
    });

    await prisma.$transaction(async (tx) => {
      await tx.schoolQuestion.deleteMany({ where: { examId } }); // cascade options
      for (let i = 0; i < qs.length; i++) {
        const q = qs[i];
        const created = await tx.schoolQuestion.create({
          data: {
            examId,
            content: q.content.trim(),
            mediaUrl: (q.mediaUrl ?? '').trim() || null,
            order: i + 1,
            points: q.points != null ? Math.max(1, Math.floor(q.points)) : 1,
            solutionText: (q.solutionText ?? '').trim() || null,
            solutionMediaUrl: (q.solutionMediaUrl ?? '').trim() || null,
          },
        });
        if (isChoice && q.options?.length) {
          await tx.schoolQuestionOption.createMany({
            data: q.options.map((o, j) => ({ questionId: created.id, content: o.content.trim(), isCorrect: !!o.isCorrect, order: j + 1 })),
          });
        }
      }
      await tx.schoolExam.update({ where: { id: examId }, data: { totalPoints } });
    });
    logger.info('school.exam.questions_saved', { examId, count: qs.length, totalPoints, actorId });
    return { saved: qs.length, totalPoints };
  }
}

/** Sınav detayı (sahibi/zümre/admin) — sorular + şıklar dahil (düzenleme için). */
export class GetSchoolExamUseCase {
  async execute(examId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    const exam = await prisma.schoolExam.findFirst({
      where: { id: examId, schoolId: ctx.schoolId },
      include: { questions: { orderBy: { order: 'asc' }, include: { options: { orderBy: { order: 'asc' } } } }, department: { select: { name: true } }, createdBy: { select: { username: true } } },
    });
    if (!exam) throw new AppError('EXAM_NOT_FOUND', 'Sınav bulunamadı', 404);
    // Görünürlük: yönetici tümünü; öğretmen/başkan zümre veya SCHOOL veya kendi
    const isManagerView = ctx.schoolRole === 'SCHOOL_ADMIN' || ctx.schoolRole === 'BRANCH_ADMIN';
    const visible = isManagerView || exam.poolVisibility === 'SCHOOL' || exam.departmentId === ctx.departmentId || exam.createdById === actorId;
    if (!visible) throw new AppError('FORBIDDEN', 'Bu sınava erişiminiz yok', 403);
    return {
      ...exam,
      canManage: canManage(exam, ctx, actorId as string),
      editable: !isManagerView,
    };
  }
}

/** Havuz listesi — rol bazlı görünürlük. */
export class ListSchoolExamPoolUseCase {
  async execute(input: { examType?: string; gradeLevel?: number; includeArchived?: boolean; q?: string }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    const isManagerView = ctx.schoolRole === 'SCHOOL_ADMIN' || ctx.schoolRole === 'BRANCH_ADMIN';
    const text = (input.q ?? '').trim();

    const visibilityWhere = isManagerView
      ? {}
      : { OR: [{ departmentId: ctx.departmentId ?? '__none__' }, { poolVisibility: 'SCHOOL' as any }, { createdById: actorId }] };

    const rows = await prisma.schoolExam.findMany({
      where: {
        schoolId: ctx.schoolId,
        ...(input.includeArchived ? {} : { isArchived: false }),
        ...(input.examType && EXAM_TYPES.includes(input.examType as ExamType) ? { examType: input.examType as any } : {}),
        ...(input.gradeLevel != null ? { gradeLevel: Math.floor(input.gradeLevel) } : {}),
        ...(text ? { title: { contains: text, mode: 'insensitive' as const } } : {}),
        ...visibilityWhere,
      },
      orderBy: [{ createdAt: 'desc' }],
      include: { department: { select: { name: true } }, createdBy: { select: { username: true } }, _count: { select: { questions: true } } },
    });
    return rows.map((e) => ({
      id: e.id,
      title: e.title,
      examType: e.examType,
      subject: e.subject,
      gradeLevel: e.gradeLevel,
      topic: e.topic,
      durationMinutes: e.durationMinutes,
      totalPoints: e.totalPoints,
      questionCount: e._count.questions,
      poolVisibility: e.poolVisibility,
      isArchived: e.isArchived,
      departmentName: e.department?.name ?? null,
      createdByUsername: e.createdBy?.username ?? null,
      canManage: canManage(e, ctx, actorId as string),
      createdAt: e.createdAt,
    }));
  }
}

export class ArchiveSchoolExamUseCase {
  async execute(examId: string, input: { isArchived: boolean }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD');
    const exam = await prisma.schoolExam.findFirst({ where: { id: examId, schoolId: ctx.schoolId }, select: { id: true, createdById: true, departmentId: true } });
    if (!exam) throw new AppError('EXAM_NOT_FOUND', 'Sınav bulunamadı', 404);
    if (!canManage(exam, ctx, actorId as string)) throw new AppError('FORBIDDEN', 'Yetkiniz yok', 403);
    const updated = await prisma.schoolExam.update({ where: { id: examId }, data: { isArchived: !!input.isArchived } });
    logger.info('school.exam.archive', { examId, isArchived: updated.isArchived, actorId });
    return { id: updated.id, isArchived: updated.isArchived };
  }
}

export class DeleteSchoolExamUseCase {
  async execute(examId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD');
    const exam = await prisma.schoolExam.findFirst({ where: { id: examId, schoolId: ctx.schoolId }, select: { id: true, createdById: true, departmentId: true } });
    if (!exam) throw new AppError('EXAM_NOT_FOUND', 'Sınav bulunamadı', 404);
    if (!canManage(exam, ctx, actorId as string)) throw new AppError('FORBIDDEN', 'Yetkiniz yok', 403);
    await prisma.schoolExam.delete({ where: { id: examId } }); // cascade questions+options
    logger.info('school.exam.deleted', { examId, actorId });
    return { ok: true };
  }
}
