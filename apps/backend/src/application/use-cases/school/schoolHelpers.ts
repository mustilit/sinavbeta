import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import type { Prisma } from '@prisma/client';

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
