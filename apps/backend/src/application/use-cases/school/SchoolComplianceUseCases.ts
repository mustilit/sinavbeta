/**
 * E-Sınıf — Ödev uyum raporu (teslim durumu + süre kontrolü), HİYERARŞİK.
 *
 * Rol bilinçli kapsam (kimse yukarıyı görmez):
 *  - STUDENT          → kendi ödevleri/teslimleri
 *  - TEACHER (sınıf)  → sınıfının (classroom.adminUserId) tüm öğrencileri
 *  - DEPT_HEAD (zümre)→ zümresinin sınavlarının ödevleri (branş-kısıtlı)
 *  - LEVEL admin      → seviyesinin (level.adminUserId) sınıfları
 *  - BRANCH_ADMIN/SCHOOL_ADMIN → şube/okul geneli
 * Kapsam çözümü mevcut `resolveReportScope` ile birebir (GetFilteredReport deseni).
 *
 * Teslim durumu (dueDate bazlı, yalnız SUBMITTED/GRADED "teslim" sayılır):
 *  - onTime: submittedAt <= dueDate · late: submittedAt > dueDate
 *  - notSubmitted: süresi GEÇMİŞ ödevde, atanan öğrenci teslim etmemiş (roster − teslim edenler)
 * Süre kontrolü (yalnız süreli sınav, exam.durationMinutes):
 *  - withinTime: geçen süre <= durationMinutes · overflow: aşım veya OVERDUE (zaman aşımı)
 */
import { prismaRead } from '../../../infrastructure/database/dbRouter';
import { resolveSchoolContext, resolveReportScope, resolvePeriodFilter, ownAssignmentClassIds } from './schoolHelpers';

const GRACE_MIN = 0.5; // ağ/saat kayması toleransı

export type ComplianceBucket = 'onTime' | 'late' | 'notSubmitted' | 'withinTime' | 'overflow';

type AsgRow = { id: string; title: string; classroomId: string; dueDate: Date; exam: { title: string; durationMinutes: number | null } };
type SubRow = {
  assignmentId: string | null; studentId: string; status: string; startedAt: Date; submittedAt: Date | null;
  student?: { username: string; firstName: string | null; lastName: string | null };
  assignment: { title: string; dueDate: Date; classroomId?: string; exam: { title: string; durationMinutes: number | null } } | null;
};
type Scope = {
  isStudent: boolean; studentId?: string; now: Date;
  assignments: AsgRow[]; submissions: SubRow[];
  roster: Map<string, Array<{ userId: string; name: string }>>; // classroomId → öğrenciler (yalnız personel)
};

const nameOf = (u: { username: string; firstName: string | null; lastName: string | null }) =>
  [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username;

/** Aktörün kapsamındaki açılmış (availableFrom<=now) ödevler + teslimler + roster. */
async function loadScope(actorId?: string): Promise<Scope> {
  const ctx = await resolveSchoolContext(actorId);
  const db = prismaRead();
  const now = new Date();
  const asgSelect = { id: true, title: true, classroomId: true, dueDate: true, exam: { select: { title: true, durationMinutes: true } } };
  const subSelectBase = {
    assignmentId: true, studentId: true, status: true, startedAt: true, submittedAt: true,
    assignment: { select: { title: true, dueDate: true, classroomId: true, exam: { select: { title: true, durationMinutes: true } } } },
  };

  if (ctx.schoolRole === 'STUDENT') {
    const periodId = await resolvePeriodFilter(ctx.schoolId, null);
    const assignments = ctx.classroomId
      ? await db.schoolAssignment.findMany({
          where: { classroomId: ctx.classroomId, availableFrom: { lte: now }, ...(periodId ? { periodId } : {}) },
          select: asgSelect,
        })
      : [];
    const asgIds = assignments.map((a) => a.id);
    const submissions = asgIds.length
      ? await db.schoolSubmission.findMany({ where: { studentId: ctx.userId, assignmentId: { in: asgIds } }, select: subSelectBase })
      : [];
    return { isStudent: true, studentId: ctx.userId, now, assignments: assignments as AsgRow[], submissions: submissions as SubRow[], roster: new Map() };
  }

  // ── Personel ──
  const rs = await resolveReportScope(actorId);
  const empty: Scope = { isStudent: false, now, assignments: [], submissions: [], roster: new Map() };
  // Öğretmenin kendi verdiği ödevler designation'sız da kapsama girer.
  const ownClassIds = await ownAssignmentClassIds(rs.schoolId, rs.ownTeacherId);
  if (rs.empty && ownClassIds.length === 0) return empty;

  let allClassIds: string[] = [];
  let subjectClassIds: string[] = [];
  if (rs.isSchoolAdmin) {
    allClassIds = (await db.classroom.findMany({ where: { schoolId: rs.schoolId }, select: { id: true } })).map((c) => c.id);
  } else {
    if (rs.allSubjectWhere.length) allClassIds = (await db.classroom.findMany({ where: { schoolId: rs.schoolId, OR: rs.allSubjectWhere }, select: { id: true } })).map((c) => c.id);
    if (rs.subjectSpanWhere.length) subjectClassIds = (await db.classroom.findMany({ where: { schoolId: rs.schoolId, OR: rs.subjectSpanWhere }, select: { id: true } })).map((c) => c.id);
  }
  const allSet = new Set(allClassIds);
  const subjOnly = subjectClassIds.filter((id) => !allSet.has(id));
  const asgOr: Array<Record<string, unknown>> = [];
  if (allClassIds.length) asgOr.push({ classroomId: { in: allClassIds } });
  if (subjOnly.length && rs.subjectDeptIds.length) asgOr.push({ classroomId: { in: subjOnly }, exam: { departmentId: { in: rs.subjectDeptIds } } });
  // Öğretmenin kendi verdiği ödevler (designation yok) — yalnız createdById eşleşenler.
  if (ownClassIds.length && rs.ownTeacherId) asgOr.push({ classroomId: { in: ownClassIds }, createdById: rs.ownTeacherId });
  if (!asgOr.length) return empty;

  const periodId = await resolvePeriodFilter(rs.schoolId, null);
  const assignments = (await db.schoolAssignment.findMany({
    where: { AND: [{ OR: asgOr }, { availableFrom: { lte: now } }, ...(periodId ? [{ periodId }] : [])] },
    select: asgSelect,
  })) as AsgRow[];
  const asgIds = assignments.map((a) => a.id);
  const submissions = asgIds.length
    ? ((await db.schoolSubmission.findMany({
        where: { assignmentId: { in: asgIds } },
        select: { ...subSelectBase, student: { select: { username: true, firstName: true, lastName: true } } },
      })) as SubRow[])
    : [];

  // Roster: yalnız branş-erişimli (subjOnly) olmayan, tüm-ders sınıflarda "teslim etmeyen" anlamlı.
  // Basitlik: kapsamdaki tüm sınıfların öğrenci listesini çek (not-submitted hesabı için).
  const classIds = [...new Set(assignments.map((a) => a.classroomId))];
  const roster = new Map<string, Array<{ userId: string; name: string }>>();
  if (classIds.length) {
    const rosterUsers = await db.schoolUser.findMany({
      where: { classroomId: { in: classIds }, schoolRole: 'STUDENT', isActive: true },
      select: { userId: true, classroomId: true, username: true, user: { select: { firstName: true, lastName: true } } },
    });
    for (const r of rosterUsers) {
      const key = r.classroomId ?? '';
      const arr = roster.get(key) ?? [];
      arr.push({ userId: r.userId, name: nameOf({ username: r.username, firstName: r.user?.firstName ?? null, lastName: r.user?.lastName ?? null }) });
      roster.set(key, arr);
    }
  }
  return { isStudent: false, now, assignments, submissions, roster };
}

/** Teslim eden öğrenci kümesi (ödev başına) — SUBMITTED/GRADED. */
function submittedSets(d: Scope): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const s of d.submissions) {
    if ((s.status === 'SUBMITTED' || s.status === 'GRADED') && s.submittedAt && s.assignmentId) {
      const set = m.get(s.assignmentId) ?? new Set<string>();
      set.add(s.studentId);
      m.set(s.assignmentId, set);
    }
  }
  return m;
}

/** Hiyerarşik uyum sayıları (statü + süre). */
export class GetSchoolComplianceUseCase {
  async execute(actorId?: string) {
    const d = await loadScope(actorId);
    let onTime = 0, late = 0, notSubmitted = 0, withinTime = 0, overflow = 0;

    for (const s of d.submissions) {
      const submitted = s.status === 'SUBMITTED' || s.status === 'GRADED';
      const due = s.assignment?.dueDate;
      const dur = s.assignment?.exam?.durationMinutes ?? null;
      if (submitted && s.submittedAt && due) {
        if (s.submittedAt.getTime() <= due.getTime()) onTime++; else late++;
      }
      if (dur != null) {
        if (submitted && s.submittedAt) {
          const el = (s.submittedAt.getTime() - s.startedAt.getTime()) / 60000;
          if (el > dur + GRACE_MIN) overflow++; else withinTime++;
        } else if (s.status === 'OVERDUE') {
          overflow++;
        }
      }
    }

    const subSets = submittedSets(d);
    for (const a of d.assignments) {
      if (a.dueDate.getTime() >= d.now.getTime()) continue; // henüz süresi geçmemiş
      const submitters = subSets.get(a.id) ?? new Set<string>();
      if (d.isStudent) {
        if (!submitters.has(d.studentId as string)) notSubmitted++;
      } else {
        const roster = d.roster.get(a.classroomId) ?? [];
        notSubmitted += roster.filter((r) => !submitters.has(r.userId)).length;
      }
    }

    return {
      scope: d.isStudent ? 'student' : 'staff',
      status: { onTime, late, notSubmitted },
      duration: { withinTime, overflow },
    };
  }
}

/** Bir bucket için drill-down liste (üst sınır 500). */
export class ListSchoolComplianceUseCase {
  async execute(bucket: ComplianceBucket, actorId?: string) {
    const d = await loadScope(actorId);
    const CAP = 500;
    const items: Array<{ studentName?: string; assignmentTitle: string; examTitle: string; dueDate: string; submittedAt: string | null; elapsedMin: number | null; durationMin: number | null }> = [];
    const push = (o: Partial<(typeof items)[number]> & { assignmentTitle: string; examTitle: string; dueDate: string }) => {
      if (items.length < CAP) items.push({ submittedAt: null, elapsedMin: null, durationMin: null, ...o });
    };

    if (bucket === 'onTime' || bucket === 'late' || bucket === 'withinTime' || bucket === 'overflow') {
      for (const s of d.submissions) {
        const submitted = s.status === 'SUBMITTED' || s.status === 'GRADED';
        const due = s.assignment?.dueDate; const dur = s.assignment?.exam?.durationMinutes ?? null;
        const base = {
          studentName: s.student ? nameOf(s.student) : undefined,
          assignmentTitle: s.assignment?.title ?? '—',
          examTitle: s.assignment?.exam?.title ?? '—',
          dueDate: due ? due.toISOString() : '',
          submittedAt: s.submittedAt ? s.submittedAt.toISOString() : null,
        };
        if ((bucket === 'onTime' || bucket === 'late') && submitted && s.submittedAt && due) {
          const onTime = s.submittedAt.getTime() <= due.getTime();
          if ((bucket === 'onTime') === onTime) push(base);
        }
        if ((bucket === 'withinTime' || bucket === 'overflow') && dur != null) {
          if (submitted && s.submittedAt) {
            const el = (s.submittedAt.getTime() - s.startedAt.getTime()) / 60000;
            const over = el > dur + GRACE_MIN;
            if ((bucket === 'overflow') === over) push({ ...base, elapsedMin: Math.round(el), durationMin: dur });
          } else if (s.status === 'OVERDUE' && bucket === 'overflow') {
            push({ ...base, elapsedMin: null, durationMin: dur });
          }
        }
      }
    } else if (bucket === 'notSubmitted') {
      const subSets = submittedSets(d);
      const rosterName = new Map<string, string>();
      for (const arr of d.roster.values()) for (const r of arr) rosterName.set(r.userId, r.name);
      for (const a of d.assignments) {
        if (a.dueDate.getTime() >= d.now.getTime()) continue;
        const submitters = subSets.get(a.id) ?? new Set<string>();
        const base = { assignmentTitle: a.title, examTitle: a.exam?.title ?? '—', dueDate: a.dueDate.toISOString() };
        if (d.isStudent) {
          if (!submitters.has(d.studentId as string)) push(base);
        } else {
          const roster = d.roster.get(a.classroomId) ?? [];
          for (const r of roster) if (!submitters.has(r.userId)) push({ ...base, studentName: r.name });
        }
      }
    }

    return { bucket, items, capped: items.length >= CAP };
  }
}
