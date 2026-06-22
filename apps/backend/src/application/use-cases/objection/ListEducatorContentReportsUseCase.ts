import { prisma } from '../../../infrastructure/database/prisma';

/**
 * Eğiticinin TÜNEL ve YAZILI içeriklerine gelen "soru hata bildirimleri"ni listeler.
 * Bunlar test Objection'larından ayrı, hafif kayıtlardır (TunnelQuestionReport /
 * WrittenQuestionReport) — yanıt/eskalasyon akışı YOKTUR (salt görüntüleme).
 * Eğitici "Hata Bildirimleri" sayfasında test itirazlarıyla aynı listede gösterilir;
 * `kind` ayracı ile frontend yanıt butonunu gizler.
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
  answerable: false;
}

export class ListEducatorContentReportsUseCase {
  async execute(educatorId: string): Promise<EducatorContentReport[]> {
    if (!educatorId) return [];
    const out: EducatorContentReport[] = [];

    // ─── Tünel hata bildirimleri ────────────────────────────────────────────
    const tunnels = await prisma.tunnel.findMany({ where: { educatorId }, select: { id: true, title: true } });
    if (tunnels.length) {
      const tunnelTitle = new Map(tunnels.map((t) => [t.id, t.title]));
      const reports = await (prisma as any).tunnelQuestionReport.findMany({
        where: { tunnelId: { in: tunnels.map((t) => t.id) } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, tunnelId: true, questionId: true, candidateId: true, reason: true, status: true, createdAt: true },
      });
      const qContent = await contentMap(reports, (id) => prisma.tunnelQuestion.findMany({ where: { id: { in: id } }, select: { id: true, content: true } }));
      const cName = await reporterMap(reports);
      for (const r of reports) {
        out.push({
          id: r.id, kind: 'tunnel', reason: r.reason, status: r.status, createdAt: r.createdAt,
          questionId: r.questionId ?? null, questionContent: r.questionId ? (qContent.get(r.questionId) ?? '') : '',
          testId: r.tunnelId, testTitle: tunnelTitle.get(r.tunnelId) ?? '(Tünel)',
          reporterId: r.candidateId, reporterName: cName.get(r.candidateId) ?? 'Aday', answerable: false,
        });
      }
    }

    // ─── Yazılı hata bildirimleri ───────────────────────────────────────────
    const pkgs = await prisma.writtenPackage.findMany({ where: { educatorId }, select: { id: true } });
    if (pkgs.length) {
      const tests = await prisma.writtenTest.findMany({
        where: { packageId: { in: pkgs.map((p) => p.id) } },
        select: { id: true, title: true },
      });
      if (tests.length) {
        const testTitle = new Map(tests.map((t) => [t.id, t.title]));
        const reports = await prisma.writtenQuestionReport.findMany({
          where: { testId: { in: tests.map((t) => t.id) } },
          orderBy: { createdAt: 'desc' },
          select: { id: true, testId: true, questionId: true, candidateId: true, reason: true, status: true, createdAt: true },
        });
        const qContent = await contentMap(reports, (id) => prisma.writtenQuestion.findMany({ where: { id: { in: id } }, select: { id: true, content: true } }));
        const cName = await reporterMap(reports);
        for (const r of reports) {
          out.push({
            id: r.id, kind: 'written', reason: r.reason, status: r.status, createdAt: r.createdAt,
            questionId: r.questionId ?? null, questionContent: r.questionId ? (qContent.get(r.questionId) ?? '') : '',
            testId: r.testId ?? '', testTitle: r.testId ? (testTitle.get(r.testId) ?? '(Yazılı)') : '(Yazılı)',
            reporterId: r.candidateId, reporterName: cName.get(r.candidateId) ?? 'Aday', answerable: false,
          });
        }
      }
    }

    return out;
  }
}

/** Soru id'lerini içerik metnine batch çözer (questionId null olanlar atlanır). */
async function contentMap(
  reports: Array<{ questionId: string | null }>,
  fetch: (ids: string[]) => Promise<Array<{ id: string; content: string }>>,
): Promise<Map<string, string>> {
  const ids = [...new Set(reports.map((r) => r.questionId).filter((x): x is string => !!x))];
  if (!ids.length) return new Map();
  const rows = await fetch(ids);
  return new Map(rows.map((q) => [q.id, q.content]));
}

/** Bildiren aday id'lerini username'e batch çözer. */
async function reporterMap(reports: Array<{ candidateId: string }>): Promise<Map<string, string>> {
  const ids = [...new Set(reports.map((r) => r.candidateId).filter(Boolean))];
  if (!ids.length) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } });
  return new Map(users.map((u) => [u.id, u.username]));
}
