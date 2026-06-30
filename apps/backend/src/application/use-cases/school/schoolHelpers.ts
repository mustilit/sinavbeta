import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import type { Prisma } from '@prisma/client';
import { AuditAction } from '@prisma/client';
import { AuditLogger } from '../../../infrastructure/audit/AuditLogger';

// E-Sınıf audit kayıtları için paylaşılan logger (DI'sız; prisma singleton kullanır).
const _schoolAuditLogger = new AuditLogger();

/** SchoolRole → username harf kısaltması (ANK-T-0042 deseni). */
const ROLE_PREFIX: Record<string, string> = {
  SCHOOL_ADMIN: 'A',
  BRANCH_ADMIN: 'B',
  DEPT_HEAD: 'D',
  TEACHER: 'T',
  STUDENT: 'S',
};

export type SchoolRoleStr = 'SCHOOL_ADMIN' | 'BRANCH_ADMIN' | 'DEPT_HEAD' | 'TEACHER' | 'STUDENT';

/** `{KOD}-{ROL}-{0000}` benzersiz okul kullanıcı adı üretir. */
export function formatSchoolUsername(schoolCode: string, role: SchoolRoleStr, seq: number): string {
  const prefix = ROLE_PREFIX[role] ?? 'X';
  return `${schoolCode.toUpperCase()}-${prefix}-${String(seq).padStart(4, '0')}`;
}

/**
 * Okul + rol bazında bir sonraki sıra numarasını race-safe üretir.
 * tx içinde mevcut sayıyı alıp +1 ile dener; çakışma (unique) olursa artırarak
 * yeniden dener (boşluk bırakmaz, eşzamanlı eklemede atlamaz).
 */
export async function nextSchoolUsername(
  tx: Prisma.TransactionClient,
  schoolId: string,
  schoolCode: string,
  role: SchoolRoleStr,
): Promise<string> {
  const base = await tx.schoolUser.count({ where: { schoolId, schoolRole: role as any } });
  for (let attempt = 1; attempt <= 50; attempt++) {
    const candidate = formatSchoolUsername(schoolCode, role, base + attempt);
    const clash = await tx.schoolUser.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!clash) return candidate;
  }
  throw new AppError('USERNAME_GENERATION_FAILED', 'Kullanıcı adı üretilemedi', 500);
}

/** 8 karakter alfanümerik geçici şifre (karışık karakter yok: 0/O, 1/l/I hariç). */
export function generateTempPassword(len = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export type SchoolContext = {
  schoolUserId: string;
  userId: string; // actor User.id (designation kontrolleri için: adminUserId/headUserId)
  schoolId: string;
  schoolRole: SchoolRoleStr;
  branchId: string | null;
  departmentId: string | null;
  classroomId: string | null;
};

/**
 * Giriş yapmış kullanıcının aktif okul bağlamını çözer (E-Sınıf endpoint'leri için).
 * SchoolUser kaydı yoksa → 403 NOT_SCHOOL_USER.
 */
export async function resolveSchoolContext(userId: string | undefined): Promise<SchoolContext> {
  if (!userId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
  const su = await prisma.schoolUser.findFirst({
    where: { userId, isActive: true },
    select: { id: true, schoolId: true, schoolRole: true, branchId: true, departmentId: true, classroomId: true },
  });
  if (!su) throw new AppError('NOT_SCHOOL_USER', 'Bu hesap bir okula bağlı değil', 403);
  return {
    schoolUserId: su.id,
    userId,
    schoolId: su.schoolId,
    schoolRole: su.schoolRole as SchoolRoleStr,
    branchId: su.branchId,
    departmentId: su.departmentId,
    classroomId: su.classroomId,
  };
}

/** Verilen rollerden biri değilse 403 fırlatır. */
export function requireSchoolRole(ctx: SchoolContext, ...roles: SchoolRoleStr[]): void {
  if (!roles.includes(ctx.schoolRole)) {
    throw new AppError('FORBIDDEN_SCHOOL_ROLE', 'Bu işlem için yetkiniz yok', 403);
  }
}

/**
 * E-Sınıf hassas işlem AUDIT kaydı. Best-effort (akışı bloklamaz; hata yutulmaz,
 * AuditLogger içinde logger.warn ile görünür). actor: SchoolContext (userId+schoolId+
 * schoolRole) veya yalnız actorId string'i. schoolId/schoolRole metadata'ya konur.
 */
export function schoolAudit(
  actor: SchoolContext | { userId?: string } | string | undefined,
  entry: { action: AuditAction | string; entityType: string; entityId: string; before?: unknown; after?: unknown; metadata?: Record<string, unknown> },
): void {
  const userId = typeof actor === 'string' ? actor : actor?.userId;
  const schoolId = typeof actor === 'object' && actor ? (actor as SchoolContext).schoolId : undefined;
  const schoolRole = typeof actor === 'object' && actor ? (actor as SchoolContext).schoolRole : undefined;
  _schoolAuditLogger.logAsync(
    { userId, role: schoolRole },
    {
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before,
      after: entry.after,
      metadata: { ...(entry.metadata ?? {}), schoolId, schoolRole, module: 'E-SINIF' },
    },
  );
}

/** Okulun GÜNCEL dönemi (School.periodId). Dönemsel kayıtlar bununla damgalanır/süzülür. */
export async function currentPeriodId(schoolId: string): Promise<string | null> {
  const s = await prisma.school.findUnique({ where: { id: schoolId }, select: { periodId: true } });
  return s?.periodId ?? null;
}

/**
 * Liste için dönem süzme değeri: input.periodId verilmişse o (eski dönem çağrısı),
 * yoksa okulun güncel dönemi (yeni döneme sıfır sayfa). null → süzme yok (tüm dönemler).
 */
export async function resolvePeriodFilter(schoolId: string, inputPeriodId?: string | null): Promise<string | null> {
  if (inputPeriodId) return inputPeriodId;
  return currentPeriodId(schoolId);
}

/** Okul/şube yöneticisi mi (verilen şube için)? Sınırlı yönetim yetki kontrollerinde temel. */
export function isManagerForBranch(ctx: SchoolContext, branchId: string | null): boolean {
  if (ctx.schoolRole === 'SCHOOL_ADMIN') return true;
  if (ctx.schoolRole === 'BRANCH_ADMIN') return !!branchId && ctx.branchId === branchId;
  return false;
}

/**
 * Görüntüleme kapsamı — kullanıcının yetkili olduğu alan(lar).
 * SCHOOL_ADMIN tüm okulu; diğerleri designation'larına göre alt küme görür:
 *  - BRANCH_ADMIN → kendi şubesi (fullBranch)
 *  - Seviye Sorumlusu (SchoolLevel.adminUserId) → kendi seviyesi (fullLevel)
 *  - Zümre Başkanı (Department.headUserId / DEPT_HEAD üyeliği) → zümresinin kapsamı
 *    (level zümresi → fullLevel; şube zümresi → fullBranch; okul geneli → tüm okul)
 *  - Sınıf Öğretmeni (Classroom.adminUserId) → kendi sınıfı (soloClassroom)
 * Bir kullanıcı birden çok designation taşıyabilir; küme birleşimi alınır.
 */
export type SchoolScope = {
  schoolUserId: string;
  schoolId: string;
  schoolRole: SchoolRoleStr;
  isSchoolAdmin: boolean;
  wholeSchool: boolean; // SCHOOL_ADMIN veya okul-geneli zümre başkanı
  fullBranchIds: string[]; // tamamı görünen şubeler
  fullLevelIds: string[]; // tamamı görünen seviyeler
  soloClassroomIds: string[]; // tekil görünen sınıflar
  departmentIds: string[]; // başkanı/üyesi olunan zümreler (rapor konu filtresi)
  subjects: string[]; // zümre başkanının branşları (department.subject)
};

export async function resolveSchoolScope(userId: string | undefined): Promise<SchoolScope> {
  const ctx = await resolveSchoolContext(userId);
  const schoolId = ctx.schoolId;
  const isSchoolAdmin = ctx.schoolRole === 'SCHOOL_ADMIN';

  const fullBranchIds = new Set<string>();
  const fullLevelIds = new Set<string>();
  const soloClassroomIds = new Set<string>();
  const departmentIds = new Set<string>();
  const subjects = new Set<string>();
  let wholeSchool = isSchoolAdmin;

  if (ctx.schoolRole === 'BRANCH_ADMIN' && ctx.branchId) fullBranchIds.add(ctx.branchId);

  const su = await prisma.schoolUser.findUnique({ where: { id: ctx.schoolUserId }, select: { userId: true, departmentId: true } });
  const uid = su?.userId;

  if (!isSchoolAdmin && uid) {
    // Seviye sorumlusu
    const levels = await prisma.schoolLevel.findMany({ where: { schoolId, adminUserId: uid }, select: { id: true } });
    levels.forEach((l) => fullLevelIds.add(l.id));
    // Sınıf öğretmeni
    const classes = await prisma.classroom.findMany({ where: { schoolId, adminUserId: uid }, select: { id: true } });
    classes.forEach((c) => soloClassroomIds.add(c.id));
    // Zümre başkanlığı / üyeliği
    const deptIds = new Set<string>();
    if (su?.departmentId) deptIds.add(su.departmentId);
    const headed = await prisma.department.findMany({ where: { schoolId, headUserId: uid }, select: { id: true } });
    headed.forEach((d) => deptIds.add(d.id));
    if (deptIds.size) {
      const depts = await prisma.department.findMany({ where: { id: { in: [...deptIds] } }, select: { id: true, branchId: true, levelId: true, subject: true } });
      for (const d of depts) {
        departmentIds.add(d.id);
        if (d.subject) subjects.add(d.subject);
        if (d.levelId) fullLevelIds.add(d.levelId);
        else if (d.branchId) fullBranchIds.add(d.branchId);
        else wholeSchool = true; // okul geneli zümre
      }
    }
  }

  return {
    schoolUserId: ctx.schoolUserId,
    schoolId,
    schoolRole: ctx.schoolRole,
    isSchoolAdmin,
    wholeSchool,
    fullBranchIds: [...fullBranchIds],
    fullLevelIds: [...fullLevelIds],
    soloClassroomIds: [...soloClassroomIds],
    departmentIds: [...departmentIds],
    subjects: [...subjects],
  };
}

/** Kapsam tamamen boş mu (hiçbir alana yetkisi yok)? */
export function scopeIsEmpty(scope: SchoolScope): boolean {
  return !scope.wholeSchool && !scope.fullBranchIds.length && !scope.fullLevelIds.length && !scope.soloClassroomIds.length;
}

/** Kapsama uygun Classroom where parçası (schoolId dahil). wholeSchool → tüm okul. */
export function scopedClassroomWhere(scope: SchoolScope): Record<string, unknown> {
  if (scope.wholeSchool) return { schoolId: scope.schoolId };
  const or: Array<Record<string, unknown>> = [];
  if (scope.fullBranchIds.length) or.push({ branchId: { in: scope.fullBranchIds } });
  if (scope.fullLevelIds.length) or.push({ levelId: { in: scope.fullLevelIds } });
  if (scope.soloClassroomIds.length) or.push({ id: { in: scope.soloClassroomIds } });
  if (!or.length) return { id: '__none__' }; // hiçbir şey
  return { schoolId: scope.schoolId, OR: or };
}

/**
 * RAPOR erişim kapsamı — designation tabanlı (üyelik DEĞİL), hiyerarşide YUKARI yok:
 *  - SCHOOL_ADMIN → tüm okul, tüm dersler
 *  - BRANCH_ADMIN → kendi şubesi, tüm dersler
 *  - Seviye Sorumlusu (SchoolLevel.adminUserId) → kendi seviye(ler)i, tüm dersler
 *  - Sınıf Öğretmeni (Classroom.adminUserId) → kendi sınıf(lar)ı, tüm dersler
 *  - Zümre Başkanı (Department.headUserId / DEPT_HEAD) → zümresinin sınıf span'ı, YALNIZ kendi branşı
 * `allSubjectWhere`: tüm-ders erişimi olan sınıf WHERE parçaları (OR).
 * `subjectSpanWhere` + `subjectDeptIds`: branşa kısıtlı (yalnız bu zümrelerin sınavları) sınıf span'ı.
 * Düz zümre ÜYELİĞİ (başkan değil) rapor erişimi vermez — kimse yukarıyı görmez.
 */
export type ReportScope = {
  schoolId: string;
  isSchoolAdmin: boolean;
  empty: boolean;
  allSubjectWhere: Array<Record<string, unknown>>;
  subjectSpanWhere: Array<Record<string, unknown>>;
  subjectDeptIds: string[];
  // Öğretmenin kendi oluşturduğu ödevler için kapsam (designation'dan bağımsız):
  // sınıf öğretmeni/seviye/zümre başkanı olmasa da kendi verdiği ödevleri raporlarda görür.
  ownTeacherId: string | null;
};

/**
 * Öğretmenin kendi oluşturduğu (createdById) ödevlerin sınıf id'leri — primary prisma'dan.
 * Rapor use-case'lerinde çağrılır (resolveReportScope'a sorgu eklemeden; başka tüketicileri etkilemez).
 */
export async function ownAssignmentClassIds(schoolId: string, teacherId: string | null): Promise<string[]> {
  if (!teacherId) return [];
  const rows = await prisma.schoolAssignment.findMany({ where: { schoolId, createdById: teacherId }, select: { classroomId: true }, distinct: ['classroomId'] });
  return [...new Set(rows.map((r) => r.classroomId))];
}

/** Canlı sınav oluşturanın kapsam snapshot'ı (en dar designation; üst roller görsün diye parent'lar da set edilir). */
export async function resolveLiveCreatorScope(ctx: SchoolContext): Promise<{ schoolBranchId: string | null; schoolLevelId: string | null; schoolClassroomId: string | null; schoolDepartmentId: string | null }> {
  const empty = { schoolBranchId: null, schoolLevelId: null, schoolClassroomId: null, schoolDepartmentId: null };
  if (ctx.schoolRole === 'SCHOOL_ADMIN') return empty;
  if (ctx.schoolRole === 'BRANCH_ADMIN') return { ...empty, schoolBranchId: ctx.branchId ?? null };
  const cls = await prisma.classroom.findFirst({ where: { schoolId: ctx.schoolId, adminUserId: ctx.userId }, select: { id: true, levelId: true, branchId: true } });
  if (cls) return { schoolBranchId: cls.branchId, schoolLevelId: cls.levelId ?? null, schoolClassroomId: cls.id, schoolDepartmentId: null };
  const lvl = await prisma.schoolLevel.findFirst({ where: { schoolId: ctx.schoolId, adminUserId: ctx.userId }, select: { id: true, branchId: true } });
  if (lvl) return { schoolBranchId: lvl.branchId, schoolLevelId: lvl.id, schoolClassroomId: null, schoolDepartmentId: null };
  let deptId = ctx.departmentId ?? null;
  if (!deptId) { const h = await prisma.department.findFirst({ where: { schoolId: ctx.schoolId, headUserId: ctx.userId }, select: { id: true } }); deptId = h?.id ?? null; }
  if (deptId) { const d = await prisma.department.findUnique({ where: { id: deptId }, select: { branchId: true, levelId: true } }); return { schoolBranchId: d?.branchId ?? null, schoolLevelId: d?.levelId ?? null, schoolClassroomId: null, schoolDepartmentId: deptId }; }
  return empty;
}

/** Canlı sınav görünürlük/erişim where parçası: viewer'ın hiyerarşisi + kendi oluşturduğu. null = tüm okul (admin). */
export async function liveScopeWhere(ctx: SchoolContext): Promise<Record<string, unknown> | null> {
  if (ctx.schoolRole === 'SCHOOL_ADMIN') return null;
  const or: Array<Record<string, unknown>> = [{ educatorId: ctx.userId }];
  if (ctx.schoolRole === 'BRANCH_ADMIN' && ctx.branchId) or.push({ schoolBranchId: ctx.branchId });
  const myLevels = await prisma.schoolLevel.findMany({ where: { schoolId: ctx.schoolId, adminUserId: ctx.userId }, select: { id: true } });
  if (myLevels.length) or.push({ schoolLevelId: { in: myLevels.map((l) => l.id) } });
  const myClasses = await prisma.classroom.findMany({ where: { schoolId: ctx.schoolId, adminUserId: ctx.userId }, select: { id: true } });
  if (myClasses.length) or.push({ schoolClassroomId: { in: myClasses.map((c) => c.id) } });
  const deptIds = new Set<string>();
  if (ctx.departmentId) deptIds.add(ctx.departmentId);
  const headed = await prisma.department.findMany({ where: { schoolId: ctx.schoolId, headUserId: ctx.userId }, select: { id: true } });
  headed.forEach((d) => deptIds.add(d.id));
  if (deptIds.size) or.push({ schoolDepartmentId: { in: [...deptIds] } });
  return { OR: or };
}

export async function resolveReportScope(userId: string | undefined): Promise<ReportScope> {
  const ctx = await resolveSchoolContext(userId);
  const schoolId = ctx.schoolId;
  if (ctx.schoolRole === 'SCHOOL_ADMIN') {
    return { schoolId, isSchoolAdmin: true, empty: false, allSubjectWhere: [], subjectSpanWhere: [], subjectDeptIds: [], ownTeacherId: null };
  }

  const allSubjectWhere: Array<Record<string, unknown>> = [];
  if (ctx.schoolRole === 'BRANCH_ADMIN' && ctx.branchId) allSubjectWhere.push({ branchId: ctx.branchId });
  const myLevels = await prisma.schoolLevel.findMany({ where: { schoolId, adminUserId: ctx.userId }, select: { id: true } });
  if (myLevels.length) allSubjectWhere.push({ levelId: { in: myLevels.map((l) => l.id) } });
  const myClasses = await prisma.classroom.findMany({ where: { schoolId, adminUserId: ctx.userId }, select: { id: true } });
  if (myClasses.length) allSubjectWhere.push({ id: { in: myClasses.map((c) => c.id) } });

  // Yalnız zümre BAŞKANLIĞI (üyelik değil) branş-kısıtlı rapor erişimi verir.
  const headDeptIds = new Set<string>();
  const headed = await prisma.department.findMany({ where: { schoolId, headUserId: ctx.userId }, select: { id: true } });
  headed.forEach((d) => headDeptIds.add(d.id));
  if (ctx.schoolRole === 'DEPT_HEAD' && ctx.departmentId) headDeptIds.add(ctx.departmentId);

  const subjectSpanWhere: Array<Record<string, unknown>> = [];
  const subjectDeptIds: string[] = [];
  if (headDeptIds.size) {
    const depts = await prisma.department.findMany({ where: { id: { in: [...headDeptIds] } }, select: { id: true, levelId: true, branchId: true } });
    for (const d of depts) {
      subjectDeptIds.push(d.id);
      if (d.levelId) subjectSpanWhere.push({ levelId: d.levelId });
      else if (d.branchId) subjectSpanWhere.push({ branchId: d.branchId });
      else subjectSpanWhere.push({ schoolId }); // okul-geneli zümre → tüm okul (branşa kısıtlı)
    }
  }

  // Designation tabanlı boşluk; kendi ödevleri (ownTeacherId) rapor use-case'lerinde ayrıca eklenir.
  const empty = allSubjectWhere.length === 0 && subjectSpanWhere.length === 0;
  return { schoolId, isSchoolAdmin: false, empty, allSubjectWhere, subjectSpanWhere, subjectDeptIds, ownTeacherId: ctx.userId ?? null };
}
