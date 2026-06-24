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
