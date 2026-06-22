import { prisma } from '../../../infrastructure/database/prisma';

/**
 * Eğiticinin TÜNEL ve YAZILI içeriklerine gelen "soru hata bildirimleri"ni listeler.
 * Test Objection'larından AYRI hafif kayıtlar (TunnelQuestionReport /
 * WrittenQuestionReport). SLA/eskalasyon YOK; ama eğitici izahı + admin notu
 * eklenebilir (test Objection deseni). Eğitici "Hata Bildirimleri" sayfasında
 * test itirazlarıyla aynı listede gösterilir; `kind` ile yanıt yolu ayrışır.
 */
export interface EducatorContentReport {
  id: string;
  kind: 'tunnel' | 'written';
  reason: string;
  status: string; // OPEN | RESOLVED
  createdAt: Date;
  questionId: string | null;
  questionContent: string;
  testId: string; // tünel için tunnelId, yazılı için writtenTestId (filtre gruplaması)
  testTitle: string;
  reporterId: string;
  reporterName: string;
  answerable: true;
  // Eğitici izahı (test Objection.answerText karşılığı)
  answerText: string | null;
  answeredAt: Date | null;
  // Admin notu (test Objection.adminAnswerText karşılığı)
  adminAnswerText: string | null;
  adminAnsweredAt: Date | null;
  adminAnswererName: string | null;
}

const REPORT_SELECT = {
  id: true, questionId: true, candidateId: true, reason: true, status: true, createdAt: true,
  educatorAnswer: true, educatorAnsweredAt: true, adminNote: true, adminNotedAt: true, adminNotedById: true,
} as const;

export class ListEducatorContentReportsUseCase {
  async execute(educatorId: string): Promise<EducatorContentReport[]> {
    if (!educatorId) return [];
    const out: EducatorContentReport[] = [];
    const adminIds = new Set<string>();
    const stage: Array<{ r: any; kind: 'tunnel' | 'written'; testId: string; testTitle: string }> = [];

    // ─── Tünel ────────────────────────────────────────────────────────────
    const tunnels = await prisma.tunnel.findMany({ where: { educatorId }, select: { id: true, title: true } });
    if (tunnels.length) {
      const title = new Map(tunnels.map((t) => [t.id, t.title]));
      const reports = await (prisma as any).tunnelQuestionReport.findMany({
        where: { tunnelId: { in: tunnels.map((t) => t.id) } },
        orderBy: { createdAt: 'desc' },
        select: { ...REPORT_SELECT, tunnelId: true },
      });
      const qc = await contentMap(reports, (ids) => prisma.tunnelQuestion.findMany({ where: { id: { in: ids } }, select: { id: true, content: true } }));
      for (const r of reports) {
        if (r.adminNotedById) adminIds.add(r.adminNotedById);
        stage.push({ r: { ...r, _qContent: r.questionId ? (qc.get(r.questionId) ?? '') : '' }, kind: 'tunnel', testId: r.tunnelId, testTitle: title.get(r.tunnelId) ?? '(Tünel)' });
      }
    }

    // ─── Yazılı ───────────────────────────────────────────────────────────
    const pkgs = await prisma.writtenPackage.findMany({ where: { educatorId }, select: { id: true } });
    if (pkgs.length) {
      const tests = await prisma.writtenTest.findMany({ where: { packageId: { in: pkgs.map((p) => p.id) } }, select: { id: true, title: true } });
      if (tests.length) {
        const title = new Map(tests.map((t) => [t.id, t.title]));
        const reports = await prisma.writtenQuestionReport.findMany({
          where: { testId: { in: tests.map((t) => t.id) } },
          orderBy: { createdAt: 'desc' },
          select: { ...REPORT_SELECT, testId: true },
        });
        const qc = await contentMap(reports, (ids) => prisma.writtenQuestion.findMany({ where: { id: { in: ids } }, select: { id: true, content: true } }));
        for (const r of reports) {
          if (r.adminNotedById) adminIds.add(r.adminNotedById);
          stage.push({ r: { ...r, _qContent: r.questionId ? (qc.get(r.questionId) ?? '') : '' }, kind: 'written', testId: r.testId ?? '', testTitle: r.testId ? (title.get(r.testId) ?? '(Yazılı)') : '(Yazılı)' });
        }
      }
    }

    if (!stage.length) return out;
    const cName = await reporterMap(stage.map((s) => s.r));
    const aName = await nameMap([...adminIds]);

    for (const { r, kind, testId, testTitle } of stage) {
      out.push({
        id: r.id, kind, reason: r.reason, status: r.status, createdAt: r.createdAt,
        questionId: r.questionId ?? null, questionContent: r._qContent,
        testId, testTitle,
        reporterId: r.candidateId, reporterName: cName.get(r.candidateId) ?? 'Aday',
        answerable: true,
        answerText: r.educatorAnswer ?? null, answeredAt: r.educatorAnsweredAt ?? null,
        adminAnswerText: r.adminNote ?? null, adminAnsweredAt: r.adminNotedAt ?? null,
        adminAnswererName: r.adminNotedById ? (aName.get(r.adminNotedById) ?? null) : null,
      });
    }
    return out;
  }
}

async function contentMap(
  reports: Array<{ questionId: string | null }>,
  fetch: (ids: string[]) => Promise<Array<{ id: string; content: string }>>,
): Promise<Map<string, string>> {
  const ids = [...new Set(reports.map((r) => r.questionId).filter((x): x is string => !!x))];
  if (!ids.length) return new Map();
  return new Map((await fetch(ids)).map((q) => [q.id, q.content]));
}

async function reporterMap(reports: Array<{ candidateId: string }>): Promise<Map<string, string>> {
  return nameMap([...new Set(reports.map((r) => r.candidateId).filter(Boolean))]);
}

async function nameMap(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } });
  return new Map(users.map((u) => [u.id, u.username]));
}
