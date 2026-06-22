import { prisma } from '../../infrastructure/database/prisma';
import { runWithoutTenantFilter } from '../../common/tenantContext';

/**
 * AuditLog kayıtlarındaki (entityType, entityId) çiftlerini insan-okunabilir
 * label + frontend link'e çevirir. Admin AdminUserActivity sayfasında
 * "Varlık ID" sütunu yerine başlık/isim göstermek için kullanılır.
 *
 * Tek bir audit log listesi için en fazla N farklı entityType × M id sorgusu
 * çalışır — her tip için TEK batch query (findMany IN). N+1 yok.
 *
 * Tenant bypass: Admin cross-tenant inceleme yapar; bazı entity'ler
 * (TestPackage, User, Purchase) tenant-scoped olduğu için bypass kullanılır.
 */

export type ResolvedEntity = {
  /** İnsan-okunabilir kısa etiket (örn. paket başlığı, kullanıcı adı). */
  label: string;
  /** Frontend route'u — tıklanırsa nereye götüreceği. Null ise sadece label. */
  link: string | null;
};

export type AuditEntityRef = {
  entityType: string | null | undefined;
  entityId: string | null | undefined;
};

/** Bir (entityType, entityId) çifti için map key'i. */
function keyOf(type: string, id: string): string {
  return `${type}::${id}`;
}

/**
 * Verilen audit log referans listesinden, her benzersiz (type, id) için
 * resolve edilmiş entity döner. Bilinmeyen veya silinmiş kayıtlar
 * Map'te yer almaz — caller fallback gösterimi yapar.
 */
export async function resolveAuditEntities(
  refs: AuditEntityRef[],
): Promise<Map<string, ResolvedEntity>> {
  // Tip başına benzersiz id seti
  const byType: Record<string, Set<string>> = {};
  for (const r of refs) {
    if (!r.entityType || !r.entityId) continue;
    (byType[r.entityType] ??= new Set()).add(r.entityId);
  }

  const result = new Map<string, ResolvedEntity>();

  await runWithoutTenantFilter(async () => {
    await Promise.all(
      Object.entries(byType).map(async ([type, idSet]) => {
        const ids = [...idSet];
        if (ids.length === 0) return;
        try {
          switch (type) {
            // ── Test paketi ────────────────────────────────────────────
            case 'TestPackage':
            case 'ExamTestPackage': {
              const rows = await prisma.testPackage.findMany({
                where: { id: { in: ids } },
                select: { id: true, title: true },
              });
              for (const r of rows) {
                result.set(keyOf(type, r.id), {
                  label: r.title || '(Adsız paket)',
                  link: `/TestDetail?id=${r.id}`,
                });
              }
              break;
            }
            // ── Tekil test (ExamTest) ──────────────────────────────────
            case 'ExamTest':
            case 'Test': {
              const rows = await prisma.examTest.findMany({
                where: { id: { in: ids } },
                select: { id: true, title: true, packageId: true },
              });
              for (const r of rows) {
                result.set(keyOf(type, r.id), {
                  label: r.title || '(Adsız test)',
                  link: r.packageId ? `/TestDetail?id=${r.packageId}` : null,
                });
              }
              break;
            }
            // ── Test denemesi ───────────────────────────────────────────
            case 'TestAttempt':
            case 'Attempt':
            case 'AttemptAnswer': {
              const rows = await prisma.testAttempt.findMany({
                where: { id: { in: ids } },
                select: {
                  id: true,
                  status: true,
                  test: { select: { id: true, title: true, packageId: true } },
                },
              });
              for (const r of rows) {
                const testTitle = r.test?.title ?? '(Bilinmeyen test)';
                result.set(keyOf(type, r.id), {
                  label:
                    type === 'AttemptAnswer'
                      ? `Cevap: ${testTitle}`
                      : `Deneme: ${testTitle} (${r.status})`,
                  link: r.test?.id
                    ? `/TakeTest?id=${r.test.id}&attemptId=${r.id}&review=true`
                    : null,
                });
              }
              break;
            }
            // ── Satın alma ──────────────────────────────────────────────
            case 'Purchase': {
              const rows = await prisma.purchase.findMany({
                where: { id: { in: ids } },
                select: {
                  id: true,
                  amountCents: true,
                  package: { select: { id: true, title: true } },
                },
              });
              for (const r of rows) {
                const pkg = r.package?.title ?? '(Paket silinmiş)';
                const amount = r.amountCents != null
                  ? `₺${(r.amountCents / 100).toFixed(2)}`
                  : '';
                result.set(keyOf(type, r.id), {
                  label: `Satın alma: ${pkg}${amount ? ' — ' + amount : ''}`,
                  link: r.package?.id ? `/TestDetail?id=${r.package.id}` : null,
                });
              }
              break;
            }
            // ── Tünel satın alma ────────────────────────────────────────
            case 'TunnelPurchase': {
              const rows = await prisma.tunnelPurchase.findMany({
                where: { id: { in: ids } },
                select: {
                  id: true,
                  amountCents: true,
                  tunnel: { select: { id: true, title: true } },
                },
              });
              for (const r of rows) {
                const title = r.tunnel?.title ?? '(Tünel silinmiş)';
                const amount = r.amountCents != null ? `₺${(r.amountCents / 100).toFixed(2)}` : '';
                result.set(keyOf(type, r.id), {
                  label: `Satın alma (Tünel): ${title}${amount ? ' — ' + amount : ''}`,
                  link: r.tunnel?.id ? `/TunnelDetail?id=${r.tunnel.id}` : null,
                });
              }
              break;
            }
            // ── Yazılı paket satın alma (scalar — iki adımlı çözüm) ──────
            case 'WrittenPurchase': {
              const rows = await prisma.writtenPurchase.findMany({
                where: { id: { in: ids } },
                select: { id: true, amountCents: true, packageId: true },
              });
              const pkgIds = [...new Set(rows.map((r) => r.packageId))];
              const pkgs = pkgIds.length
                ? await prisma.writtenPackage.findMany({
                    where: { id: { in: pkgIds } },
                    select: { id: true, title: true },
                  })
                : [];
              const titleById = new Map(pkgs.map((p) => [p.id, p.title]));
              for (const r of rows) {
                const title = titleById.get(r.packageId) ?? '(Yazılı paket silinmiş)';
                const amount = r.amountCents != null ? `₺${(r.amountCents / 100).toFixed(2)}` : '';
                result.set(keyOf(type, r.id), {
                  label: `Satın alma (Yazılı): ${title}${amount ? ' — ' + amount : ''}`,
                  link: `/WrittenTestDetail?id=${r.packageId}`,
                });
              }
              break;
            }
            // ── Kullanıcı ───────────────────────────────────────────────
            case 'User': {
              const rows = await prisma.user.findMany({
                where: { id: { in: ids } },
                select: { id: true, username: true, email: true, role: true },
              });
              for (const r of rows) {
                result.set(keyOf(type, r.id), {
                  label: `${r.username || r.email} (${r.role})`,
                  link: null,
                });
              }
              break;
            }
            // ── İade ────────────────────────────────────────────────────
            case 'Refund': {
              const rows = await (prisma as any).refund?.findMany?.({
                where: { id: { in: ids } },
                select: {
                  id: true,
                  amountCents: true,
                  purchase: { select: { package: { select: { title: true, id: true } } } },
                },
              }) ?? [];
              for (const r of rows) {
                const pkg = r.purchase?.package?.title ?? '(Paket bilinmiyor)';
                const amount = r.amountCents != null
                  ? `₺${(r.amountCents / 100).toFixed(2)}`
                  : '';
                result.set(keyOf(type, r.id), {
                  label: `İade: ${pkg}${amount ? ' — ' + amount : ''}`,
                  link: r.purchase?.package?.id
                    ? `/TestDetail?id=${r.purchase.package.id}`
                    : null,
                });
              }
              break;
            }
            // ── İtiraz ──────────────────────────────────────────────────
            case 'Objection': {
              const rows = await (prisma as any).objection?.findMany?.({
                where: { id: { in: ids } },
                select: {
                  id: true,
                  status: true,
                  attempt: { select: { test: { select: { id: true, title: true } } } },
                },
              }) ?? [];
              for (const r of rows) {
                const testTitle = r.attempt?.test?.title ?? '(Test bilinmiyor)';
                result.set(keyOf(type, r.id), {
                  label: `İtiraz: ${testTitle} (${r.status})`,
                  link: null,
                });
              }
              break;
            }
            // ── Değerlendirme ───────────────────────────────────────────
            case 'Review': {
              const rows = await (prisma as any).review?.findMany?.({
                where: { id: { in: ids } },
                select: {
                  id: true,
                  testRating: true,
                  package: { select: { id: true, title: true } },
                },
              }) ?? [];
              for (const r of rows) {
                const pkg = r.package?.title ?? '(Paket bilinmiyor)';
                result.set(keyOf(type, r.id), {
                  label: `Değerlendirme: ${pkg} — ${r.testRating}/5`,
                  link: r.package?.id ? `/TestDetail?id=${r.package.id}` : null,
                });
              }
              break;
            }
            // ── İndirim kodu ────────────────────────────────────────────
            case 'DiscountCode': {
              const rows = await (prisma as any).discountCode?.findMany?.({
                where: { id: { in: ids } },
                select: { id: true, code: true, discountPercent: true },
              }) ?? [];
              for (const r of rows) {
                result.set(keyOf(type, r.id), {
                  label: `İndirim: ${r.code} (%${r.discountPercent})`,
                  link: null,
                });
              }
              break;
            }
            // ── Sınav türü ──────────────────────────────────────────────
            case 'ExamType': {
              const rows = await (prisma as any).examType?.findMany?.({
                where: { id: { in: ids } },
                select: { id: true, name: true },
              }) ?? [];
              for (const r of rows) {
                result.set(keyOf(type, r.id), {
                  label: `Sınav türü: ${r.name}`,
                  link: null,
                });
              }
              break;
            }
            // ── Konu ────────────────────────────────────────────────────
            case 'Topic': {
              const rows = await (prisma as any).topic?.findMany?.({
                where: { id: { in: ids } },
                select: { id: true, name: true },
              }) ?? [];
              for (const r of rows) {
                result.set(keyOf(type, r.id), {
                  label: `Konu: ${r.name}`,
                  link: null,
                });
              }
              break;
            }
            // ── Email log ───────────────────────────────────────────────
            case 'EmailLog': {
              const rows = await (prisma as any).emailLog?.findMany?.({
                where: { id: { in: ids } },
                select: { id: true, templateKey: true, recipientEmail: true },
              }) ?? [];
              for (const r of rows) {
                result.set(keyOf(type, r.id), {
                  label: `Email: ${r.templateKey} → ${r.recipientEmail}`,
                  link: null,
                });
              }
              break;
            }
            // ── Abonelik ────────────────────────────────────────────────
            case 'Subscription': {
              const rows = await (prisma as any).subscription?.findMany?.({
                where: { id: { in: ids } },
                select: { id: true, tier: true, status: true },
              }) ?? [];
              for (const r of rows) {
                result.set(keyOf(type, r.id), {
                  label: `Abonelik: ${r.tier} (${r.status})`,
                  link: null,
                });
              }
              break;
            }
            // Bilinmeyen tip: resolve etme — caller fallback gösterir
            default:
              break;
          }
        } catch {
          // Tek tipte hata olursa diğer tipleri etkileme — sessiz geç.
        }
      }),
    );
  });

  return result;
}
