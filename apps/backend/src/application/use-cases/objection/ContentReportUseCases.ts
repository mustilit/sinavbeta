import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

/**
 * Tünel/Yazılı soru hata bildirimleri için eğitici izahı + admin notu + admin
 * tüm-liste. Test Objection akışının (answer / admin-answer / list-all) hafif
 * karşılığı — bu kayıtlarda SLA/eskalasyon yoktur.
 */

type Kind = 'tunnel' | 'written';

/** Bildirimin sahibi eğiticiyi (içerik üzerinden) çözer. */
async function resolveOwnerEducatorId(kind: Kind, reportId: string): Promise<{ educatorId: string | null } | null> {
  if (kind === 'tunnel') {
    const r = await (prisma as any).tunnelQuestionReport.findUnique({ where: { id: reportId }, select: { tunnelId: true } });
    if (!r) return null;
    const tn = await prisma.tunnel.findUnique({ where: { id: r.tunnelId }, select: { educatorId: true } });
    return { educatorId: tn?.educatorId ?? null };
  }
  const r = await prisma.writtenQuestionReport.findUnique({ where: { id: reportId }, select: { testId: true } });
  if (!r || !r.testId) return null;
  const tst = await prisma.writtenTest.findUnique({ where: { id: r.testId }, select: { packageId: true } });
  if (!tst?.packageId) return { educatorId: null };
  const pkg = await prisma.writtenPackage.findUnique({ where: { id: tst.packageId }, select: { educatorId: true } });
  return { educatorId: pkg?.educatorId ?? null };
}

function model(kind: Kind): any {
  return kind === 'tunnel' ? (prisma as any).tunnelQuestionReport : prisma.writtenQuestionReport;
}

/** Eğitici, kendi içeriğine gelen hata bildirimine izah yazar (status → RESOLVED). */
export class AnswerContentReportUseCase {
  async execute(input: { kind: Kind; id: string; answerText: string }, educatorId?: string | null) {
    if (!educatorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
    const text = (input.answerText ?? '').trim();
    if (text.length < 5) throw new AppError('ANSWER_TOO_SHORT', 'Yanıt en az 5 karakter olmalı', 400);
    const owner = await resolveOwnerEducatorId(input.kind, input.id);
    if (!owner) throw new AppError('REPORT_NOT_FOUND', 'Bildirim bulunamadı', 404);
    if (owner.educatorId !== educatorId) throw new AppError('FORBIDDEN', 'Bu bildirim size ait değil', 403);
    await model(input.kind).update({
      where: { id: input.id },
      data: { educatorAnswer: text.slice(0, 2000), educatorAnsweredAt: new Date(), status: 'RESOLVED' },
    });
    return { ok: true };
  }
}

/** Admin, hata bildirimine not ekler (eğitici akışından bağımsız; durumu değiştirmez). */
export class NoteContentReportUseCase {
  async execute(input: { kind: Kind; id: string; adminNote: string }, adminId?: string | null) {
    if (!adminId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
    const text = (input.adminNote ?? '').trim();
    if (text.length < 5) throw new AppError('NOTE_TOO_SHORT', 'Not en az 5 karakter olmalı', 400);
    const exists = await model(input.kind).findUnique({ where: { id: input.id }, select: { id: true } });
    if (!exists) throw new AppError('REPORT_NOT_FOUND', 'Bildirim bulunamadı', 404);
    await model(input.kind).update({
      where: { id: input.id },
      data: { adminNote: text.slice(0, 2000), adminNotedAt: new Date(), adminNotedById: adminId },
    });
    return { ok: true };
  }
}

export interface ContentReportItem {
  id: string;
  kind: Kind;
  reason: string;
  status: string;
  createdAt: Date;
  questionId: string | null;
  questionContent: string;
  testId: string;
  testTitle: string;
  reporterId: string;
  reporterName: string;
  educatorId: string | null;
  educatorName: string | null;
  answerText: string | null;
  answeredAt: Date | null;
  adminAnswerText: string | null;
  adminAnsweredAt: Date | null;
  adminAnswererName: string | null;
  answerable: true;
}

/** Admin: TÜM eğiticilerin tünel/yazılı hata bildirimleri (Hata Bildirimleri yönetimi). */
export class ListAllContentReportsUseCase {
  async execute(filters?: { status?: string }): Promise<ContentReportItem[]> {
    const statusWhere = filters?.status && filters.status !== 'ALL' ? { status: filters.status } : {};
    const out: ContentReportItem[] = [];
    const userIds = new Set<string>();

    // Tünel
    const tReports = await (prisma as any).tunnelQuestionReport.findMany({
      where: statusWhere, orderBy: { createdAt: 'desc' },
      select: { id: true, tunnelId: true, questionId: true, candidateId: true, reason: true, status: true, createdAt: true, educatorAnswer: true, educatorAnsweredAt: true, adminNote: true, adminNotedAt: true, adminNotedById: true },
    });
    const tunIds = [...new Set(tReports.map((r: any) => r.tunnelId))] as string[];
    const tuns = tunIds.length ? await prisma.tunnel.findMany({ where: { id: { in: tunIds } }, select: { id: true, title: true, educatorId: true } }) : [];
    const tunById = new Map(tuns.map((t) => [t.id, t]));
    const tQc = await contentMap(tReports, (ids) => prisma.tunnelQuestion.findMany({ where: { id: { in: ids } }, select: { id: true, content: true } }));

    // Yazılı
    const wReports = await prisma.writtenQuestionReport.findMany({
      where: statusWhere, orderBy: { createdAt: 'desc' },
      select: { id: true, testId: true, questionId: true, candidateId: true, reason: true, status: true, createdAt: true, educatorAnswer: true, educatorAnsweredAt: true, adminNote: true, adminNotedAt: true, adminNotedById: true },
    });
    const wTestIds = [...new Set(wReports.map((r) => r.testId).filter((x): x is string => !!x))];
    const wTests = wTestIds.length ? await prisma.writtenTest.findMany({ where: { id: { in: wTestIds } }, select: { id: true, title: true, packageId: true } }) : [];
    const wTestById = new Map(wTests.map((t) => [t.id, t]));
    const wPkgIds = [...new Set(wTests.map((t) => t.packageId).filter((x): x is string => !!x))];
    const wPkgs = wPkgIds.length ? await prisma.writtenPackage.findMany({ where: { id: { in: wPkgIds } }, select: { id: true, educatorId: true } }) : [];
    const wPkgEdu = new Map(wPkgs.map((p) => [p.id, p.educatorId]));
    const wQc = await contentMap(wReports, (ids) => prisma.writtenQuestion.findMany({ where: { id: { in: ids } }, select: { id: true, content: true } }));

    for (const r of tReports as any[]) {
      const tn = tunById.get(r.tunnelId);
      if (r.candidateId) userIds.add(r.candidateId);
      if (tn?.educatorId) userIds.add(tn.educatorId);
      if (r.adminNotedById) userIds.add(r.adminNotedById);
      out.push(stageItem(r, 'tunnel', r.tunnelId, tn?.title ?? '(Tünel)', tn?.educatorId ?? null, r.questionId ? (tQc.get(r.questionId) ?? '') : ''));
    }
    for (const r of wReports) {
      const tst = r.testId ? wTestById.get(r.testId) : null;
      const eduId = tst?.packageId ? (wPkgEdu.get(tst.packageId) ?? null) : null;
      if (r.candidateId) userIds.add(r.candidateId);
      if (eduId) userIds.add(eduId);
      if (r.adminNotedById) userIds.add(r.adminNotedById);
      out.push(stageItem(r, 'written', r.testId ?? '', tst?.title ?? '(Yazılı)', eduId, r.questionId ? (wQc.get(r.questionId) ?? '') : ''));
    }

    const names = await nameMap([...userIds]);
    for (const it of out) {
      it.reporterName = names.get(it.reporterId) ?? 'Aday';
      it.educatorName = it.educatorId ? (names.get(it.educatorId) ?? null) : null;
      it.adminAnswererName = it.adminAnswererName ? (names.get(it.adminAnswererName) ?? null) : null;
    }
    out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return out;
  }
}

function stageItem(r: any, kind: Kind, testId: string, testTitle: string, educatorId: string | null, questionContent: string): ContentReportItem {
  return {
    id: r.id, kind, reason: r.reason, status: r.status, createdAt: r.createdAt,
    questionId: r.questionId ?? null, questionContent, testId, testTitle,
    reporterId: r.candidateId, reporterName: '', educatorId, educatorName: null,
    answerText: r.educatorAnswer ?? null, answeredAt: r.educatorAnsweredAt ?? null,
    adminAnswerText: r.adminNote ?? null, adminAnsweredAt: r.adminNotedAt ?? null,
    adminAnswererName: r.adminNotedById ?? null, // ad sonradan map'lenir
    answerable: true,
  };
}

async function contentMap(
  reports: Array<{ questionId: string | null }>,
  fetch: (ids: string[]) => Promise<Array<{ id: string; content: string }>>,
): Promise<Map<string, string>> {
  const ids = [...new Set(reports.map((r) => r.questionId).filter((x): x is string => !!x))];
  if (!ids.length) return new Map();
  return new Map((await fetch(ids)).map((q) => [q.id, q.content]));
}

async function nameMap(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } });
  return new Map(users.map((u) => [u.id, u.username]));
}
