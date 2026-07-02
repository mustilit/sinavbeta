/**
 * E-Sınıf — Sprint 5: Raporlama. Okul/şube performans özetleri.
 * Aggregate sorgular read replica'dan (prismaRead). Skor yüzdesi = totalScore/maxScore.
 */
import { prismaRead } from '../../../infrastructure/database/dbRouter';
import { AppError } from '../../errors/AppError';
import { resolveSchoolContext, requireSchoolRole, resolveReportScope, resolvePeriodFilter, ownAssignmentClassIds } from './schoolHelpers';

function pct(score: number | null, max: number | null): number | null {
  if (score == null || !max) return null;
  return Math.round((score / max) * 1000) / 10;
}
function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

/** Okul geneli rapor — şube + zümre kırılımı (SCHOOL_ADMIN). */
export class GetSchoolReportUseCase {
  async execute(actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN');
    const db = prismaRead();

    const [branches, departments, classrooms, students, assignments, submissions] = await Promise.all([
      db.branch.findMany({ where: { schoolId: ctx.schoolId }, select: { id: true, name: true } }),
      db.department.findMany({ where: { schoolId: ctx.schoolId }, select: { id: true, name: true, _count: { select: { exams: true } } } }),
      db.classroom.findMany({ where: { schoolId: ctx.schoolId }, select: { id: true, branchId: true } }),
      db.schoolUser.groupBy({ by: ['branchId'], where: { schoolId: ctx.schoolId, schoolRole: 'STUDENT' as any, isActive: true }, _count: { _all: true } }),
      db.schoolAssignment.findMany({ where: { schoolId: ctx.schoolId }, select: { id: true, classroomId: true, exam: { select: { departmentId: true } } } }),
      db.schoolSubmission.findMany({
        where: { assignment: { schoolId: ctx.schoolId }, status: { in: ['SUBMITTED', 'GRADED'] as any } },
        select: { totalScore: true, maxScore: true, assignment: { select: { classroomId: true, exam: { select: { departmentId: true } } } } },
      }),
    ]);

    const branchOfClassroom = new Map(classrooms.map((c) => [c.id, c.branchId]));
    const studentCountByBranch = new Map(students.map((s) => [s.branchId ?? '__none__', s._count._all]));
    const classroomCountByBranch = new Map<string, number>();
    classrooms.forEach((c) => classroomCountByBranch.set(c.branchId, (classroomCountByBranch.get(c.branchId) ?? 0) + 1));

    const assignmentCountByBranch = new Map<string, number>();
    assignments.forEach((a) => {
      const b = branchOfClassroom.get(a.classroomId);
      if (b) assignmentCountByBranch.set(b, (assignmentCountByBranch.get(b) ?? 0) + 1);
    });

    // Şube bazlı skor yüzdeleri
    const pctByBranch = new Map<string, number[]>();
    const pctByDept = new Map<string, number[]>();
    let overallPcts: number[] = [];
    for (const s of submissions) {
      const p = pct(s.totalScore, s.maxScore);
      if (p == null) continue;
      overallPcts.push(p);
      const b = branchOfClassroom.get(s.assignment!.classroomId);
      if (b) pctByBranch.set(b, [...(pctByBranch.get(b) ?? []), p]);
      const d = s.assignment!.exam?.departmentId;
      if (d) pctByDept.set(d, [...(pctByDept.get(d) ?? []), p]);
    }

    const assignmentCountByDept = new Map<string, number>();
    assignments.forEach((a) => { const d = a.exam?.departmentId; if (d) assignmentCountByDept.set(d, (assignmentCountByDept.get(d) ?? 0) + 1); });

    return {
      overall: {
        branchCount: branches.length,
        departmentCount: departments.length,
        classroomCount: classrooms.length,
        assignmentCount: assignments.length,
        submissionCount: submissions.length,
        avgPercent: avg(overallPcts),
      },
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        classroomCount: classroomCountByBranch.get(b.id) ?? 0,
        studentCount: studentCountByBranch.get(b.id) ?? 0,
        assignmentCount: assignmentCountByBranch.get(b.id) ?? 0,
        avgPercent: avg(pctByBranch.get(b.id) ?? []),
      })),
      departments: departments.map((d) => ({
        id: d.id,
        name: d.name,
        examCount: d._count.exams,
        assignmentCount: assignmentCountByDept.get(d.id) ?? 0,
        avgPercent: avg(pctByDept.get(d.id) ?? []),
      })),
    };
  }
}

type ReportFilters = { from?: string; to?: string; gradeLevel?: number; classroomId?: string; departmentId?: string; periodId?: string; subject?: string };

function dateRange(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  const g = from ? new Date(from) : undefined;
  const l = to ? new Date(to) : undefined;
  if ((g && !isNaN(g.getTime())) || (l && !isNaN(l.getTime()))) {
    return { ...(g && !isNaN(g.getTime()) ? { gte: g } : {}), ...(l && !isNaN(l.getTime()) ? { lte: l } : {}) };
  }
  return undefined;
}

/**
 * Filtreli kırılım raporu — Şube / Seviye / Sınıf sekmelerini besler.
 * Filtre: zaman aralığı (submittedAt), seviye (gradeLevel), sınıf, zümre (exam.departmentId).
 * Highlights: en iyi şube + her seviye için en iyi sınıf.
 */
export class GetFilteredReportUseCase {
  async execute(input: ReportFilters, actorId?: string) {
    // Görüntüleme kapsamı: SCHOOL_ADMIN tüm okul; alt roller yetki alanı kadar.
    const emptyReport = { branches: [], levels: [], classrooms: [], byDepartment: [], timeseries: [], highlights: { bestBranch: null, bestClassByLevel: [] }, subjects: [], homeroomClassrooms: [] };
    // Designation tabanlı rapor kapsamı (kimse hiyerarşide yukarıyı görmez) + kendi verdiği ödevler.
    const rs = await resolveReportScope(actorId);
    const ownClassIds = await ownAssignmentClassIds(rs.schoolId, rs.ownTeacherId);
    if (rs.empty && ownClassIds.length === 0) return emptyReport;
    const db = prismaRead();
    const grade = input.gradeLevel != null && !isNaN(Number(input.gradeLevel)) ? Math.floor(Number(input.gradeLevel)) : undefined;
    const submittedAt = dateRange(input.from, input.to);
    const baseClsFilter = { ...(grade ? { gradeLevel: grade } : {}), ...(input.classroomId ? { id: input.classroomId } : {}) };

    // Erişilebilir sınıf kümeleri: tüm-ders (yönetim) ve branş-kısıtlı span (zümre başkanlığı)
    let allClassIds: string[] = [];
    let subjectClassIds: string[] = [];
    if (rs.isSchoolAdmin) {
      const all = await db.classroom.findMany({ where: { schoolId: rs.schoolId, ...baseClsFilter }, select: { id: true } });
      allClassIds = all.map((c) => c.id);
    } else {
      if (rs.allSubjectWhere.length) {
        const a = await db.classroom.findMany({ where: { schoolId: rs.schoolId, OR: rs.allSubjectWhere, ...baseClsFilter }, select: { id: true } });
        allClassIds = a.map((c) => c.id);
      }
      if (rs.subjectSpanWhere.length) {
        const s = await db.classroom.findMany({ where: { schoolId: rs.schoolId, OR: rs.subjectSpanWhere, ...baseClsFilter }, select: { id: true } });
        subjectClassIds = s.map((c) => c.id);
      }
    }
    const allSet = new Set(allClassIds);
    const subjOnly = subjectClassIds.filter((id) => !allSet.has(id)); // yalnız branş erişimli sınıflar
    // Öğretmenin kendi verdiği ödevlerin sınıfları (yukarıda hesaplandı) — yalnız kendi ödevleri sayılır.
    const unionIds = [...new Set([...allClassIds, ...subjectClassIds, ...ownClassIds])];
    if (unionIds.length === 0) return emptyReport;

    const classrooms = await db.classroom.findMany({
      where: { id: { in: unionIds } },
      select: { id: true, name: true, gradeLevel: true, branchId: true, _count: { select: { students: true } } },
    });
    const branchIds = [...new Set(classrooms.map((c) => c.branchId))];
    const branches = await db.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } });
    const branchName = new Map(branches.map((b) => [b.id, b.name]));

    // Görünürlük: tüm-ders sınıflarında her sınav; branş-kısıtlı sınıflarda yalnız kendi zümre sınavları.
    // UI zümre filtresi (input.departmentId) + ders filtresi (input.subject = exam.subject) ek olarak uygulanır.
    const subject = input.subject?.trim() || undefined;
    // exam WHERE = zümre kısmı (+ opsiyonel ders). withSubject=false → ders listesi için (filtre uygulanmadan).
    const buildOr = (withSubject: boolean) => {
      const subj = withSubject ? subject : undefined;
      const mergeExam = (deptPart?: Record<string, unknown>) => {
        const w = { ...(deptPart ?? {}), ...(subj ? { subject: subj } : {}) };
        return Object.keys(w).length ? w : undefined;
      };
      const asg: Array<Record<string, unknown>> = [];
      const sub: Array<Record<string, unknown>> = [];
      if (allClassIds.length) {
        const ex = mergeExam(input.departmentId ? { departmentId: input.departmentId } : undefined);
        asg.push({ classroomId: { in: allClassIds }, ...(ex ? { exam: ex } : {}) });
        sub.push({ assignment: { classroomId: { in: allClassIds }, ...(ex ? { exam: ex } : {}) } });
      }
      if (subjOnly.length && rs.subjectDeptIds.length) {
        const deptPart = input.departmentId ? { departmentId: input.departmentId } : { departmentId: { in: rs.subjectDeptIds } };
        const ex = mergeExam(deptPart)!; // deptPart daima dolu → ex tanımlı
        asg.push({ classroomId: { in: subjOnly }, exam: ex });
        sub.push({ assignment: { classroomId: { in: subjOnly }, exam: ex } });
      }
      // Öğretmenin kendi verdiği ödevler — sınıf öğretmeni olmasa da; yalnız createdById eşleşen ödevler.
      if (ownClassIds.length && rs.ownTeacherId) {
        const ex = mergeExam(input.departmentId ? { departmentId: input.departmentId } : undefined);
        asg.push({ classroomId: { in: ownClassIds }, createdById: rs.ownTeacherId, ...(ex ? { exam: ex } : {}) });
        sub.push({ assignment: { classroomId: { in: ownClassIds }, createdById: rs.ownTeacherId, ...(ex ? { exam: ex } : {}) } });
      }
      return { asg, sub };
    };
    const { asg: asgOr, sub: subOr } = buildOr(true);
    const { asg: asgOrNoSubj } = buildOr(false); // ders dropdown seçeneklerinin tam listesi
    /* istanbul ignore next -- unionIds boş değilse asgOr daima ≥1 dal alır; bu erken dönüş savunmacıdır */
    if (asgOr.length === 0) return emptyReport;

    // Dönemsel: input.periodId verilmezse güncel dönem → yeni döneme sıfır rapor.
    const periodId = await resolvePeriodFilter(rs.schoolId, input.periodId);

    const [assignments, submissions, subjectAsg, homeroomClassrooms] = await Promise.all([
      db.schoolAssignment.findMany({ where: periodId ? { AND: [{ OR: asgOr }, { periodId }] } : { OR: asgOr }, select: { id: true, classroomId: true, dueDate: true } }),
      db.schoolSubmission.findMany({
        where: {
          ...(periodId ? { assignment: { periodId } } : {}),
          OR: subOr,
          status: { in: ['SUBMITTED', 'GRADED'] as any },
          ...(submittedAt ? { submittedAt } : {}),
        },
        select: {
          totalScore: true, maxScore: true, submittedAt: true,
          assignment: { select: { id: true, classroomId: true, dueDate: true, exam: { select: { department: { select: { name: true } } } } } },
        },
      }),
      // Ders dropdown'ı — kapsam+dönem içindeki tüm dersler (seçili ders filtresinden bağımsız, stabil liste).
      db.schoolAssignment.findMany({
        where: periodId ? { AND: [{ OR: asgOrNoSubj }, { periodId }] } : { OR: asgOrNoSubj },
        select: { exam: { select: { subject: true } } },
      }),
      // Sınıf öğretmeni başlığı — actor'ün sınıf öğretmeni (Classroom.adminUserId) olduğu sınıflar.
      actorId
        ? db.classroom.findMany({ where: { schoolId: rs.schoolId, adminUserId: actorId }, select: { id: true, name: true, gradeLevel: true }, orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }] })
        : Promise.resolve([] as Array<{ id: string; name: string; gradeLevel: number }>),
    ]);
    const subjects = [...new Set(subjectAsg.map((a) => a.exam?.subject).filter((s): s is string => !!s && s.trim() !== ''))].sort((a, b) => a.localeCompare(b, 'tr'));

    const now = new Date();
    const asgCountByCls = new Map<string, number>();
    assignments.forEach((a) => asgCountByCls.set(a.classroomId, (asgCountByCls.get(a.classroomId) ?? 0) + 1));
    const pctByCls = new Map<string, number[]>();
    const subCountByCls = new Map<string, number>();
    // Teslim kırılımı: zamanında (submittedAt ≤ dueDate) / geç (> dueDate) / yapılmadı (past-due ödevde teslim yok).
    const onTimeByCls = new Map<string, number>();
    const lateByCls = new Map<string, number>();
    const submittersByAsg = new Map<string, number>(); // notDone hesabı için ödev başına teslim eden sayısı
    const deptAgg = new Map<string, number[]>();    // konu/zümre başarımı
    const dayAgg = new Map<string, number[]>();     // takvime göre (gün bazlı)
    for (const s of submissions) {
      const cid = s.assignment!.classroomId;
      subCountByCls.set(cid, (subCountByCls.get(cid) ?? 0) + 1);
      submittersByAsg.set(s.assignment!.id, (submittersByAsg.get(s.assignment!.id) ?? 0) + 1);
      const due = s.assignment!.dueDate;
      if (s.submittedAt && due && s.submittedAt > due) lateByCls.set(cid, (lateByCls.get(cid) ?? 0) + 1);
      else onTimeByCls.set(cid, (onTimeByCls.get(cid) ?? 0) + 1);
      const p = pct(s.totalScore, s.maxScore);
      if (p == null) continue;
      pctByCls.set(cid, [...(pctByCls.get(cid) ?? []), p]);
      const dname = s.assignment!.exam?.department?.name ?? 'Zümresiz';
      deptAgg.set(dname, [...(deptAgg.get(dname) ?? []), p]);
      if (s.submittedAt) {
        const day = s.submittedAt.toISOString().slice(0, 10);
        dayAgg.set(day, [...(dayAgg.get(day) ?? []), p]);
      }
    }

    // Yapılmadı: yalnız SÜRESİ GEÇMİŞ ödevlerde, sınıf mevcudu − o ödevi teslim eden sayısı (negatife kırpılır).
    const studentByCls = new Map(classrooms.map((c) => [c.id, c._count.students]));
    const notDoneByCls = new Map<string, number>();
    for (const a of assignments) {
      if (!a.dueDate || a.dueDate >= now) continue; // süresi geçmeyen "yapılmadı" sayılmaz
      const roster = studentByCls.get(a.classroomId) ?? 0;
      const nd = Math.max(0, roster - (submittersByAsg.get(a.id) ?? 0));
      if (nd) notDoneByCls.set(a.classroomId, (notDoneByCls.get(a.classroomId) ?? 0) + nd);
    }

    const clsRows = classrooms
      .map((c) => ({
        id: c.id,
        name: c.name,
        gradeLevel: c.gradeLevel,
        branchId: c.branchId,
        branchName: branchName.get(c.branchId) ?? '—',
        studentCount: c._count.students,
        assignmentCount: asgCountByCls.get(c.id) ?? 0,
        submissionCount: subCountByCls.get(c.id) ?? 0,
        onTimeCount: onTimeByCls.get(c.id) ?? 0,
        lateCount: lateByCls.get(c.id) ?? 0,
        notDoneCount: notDoneByCls.get(c.id) ?? 0,
        avgPercent: avg(pctByCls.get(c.id) ?? []),
      }))
      .sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name, 'tr'));

    // Şube kırılımı
    const branchAgg = new Map<string, { pcts: number[]; sub: number; cls: number; stu: number; ot: number; lt: number; nd: number }>();
    for (const c of clsRows) {
      const e = branchAgg.get(c.branchId) ?? { pcts: [], sub: 0, cls: 0, stu: 0, ot: 0, lt: 0, nd: 0 };
      e.sub += c.submissionCount; e.cls += 1; e.stu += c.studentCount;
      e.ot += c.onTimeCount; e.lt += c.lateCount; e.nd += c.notDoneCount;
      e.pcts.push(...(pctByCls.get(c.id) ?? []));
      branchAgg.set(c.branchId, e);
    }
    const branchRows = branches.map((b) => {
      // branches, clsRows'un branchId'lerinden türetildiği için branchAgg'de daima vardır.
      const e = branchAgg.get(b.id)!;
      return { id: b.id, name: b.name, classroomCount: e.cls, studentCount: e.stu, submissionCount: e.sub, onTimeCount: e.ot, lateCount: e.lt, notDoneCount: e.nd, avgPercent: avg(e.pcts) };
    }).sort((a, b) => (b.avgPercent ?? -1) - (a.avgPercent ?? -1));

    // Seviye kırılımı (gradeLevel — okul geneli / branch admin için kendi şubesi)
    const levelAgg = new Map<number, { pcts: number[]; sub: number; cls: number; stu: number; ot: number; lt: number; nd: number }>();
    for (const c of clsRows) {
      const e = levelAgg.get(c.gradeLevel) ?? { pcts: [], sub: 0, cls: 0, stu: 0, ot: 0, lt: 0, nd: 0 };
      e.sub += c.submissionCount; e.cls += 1; e.stu += c.studentCount;
      e.ot += c.onTimeCount; e.lt += c.lateCount; e.nd += c.notDoneCount;
      e.pcts.push(...(pctByCls.get(c.id) ?? []));
      levelAgg.set(c.gradeLevel, e);
    }
    const levelRows = [...levelAgg.entries()].sort((a, b) => a[0] - b[0]).map(([g, e]) => ({
      gradeLevel: g, classroomCount: e.cls, studentCount: e.stu, submissionCount: e.sub, onTimeCount: e.ot, lateCount: e.lt, notDoneCount: e.nd, avgPercent: avg(e.pcts),
    }));

    // Highlights
    const bestBranch = branchRows.find((b) => b.avgPercent != null) ?? null;
    const bestClassByLevel = levelRows.map((lv) => {
      const best = clsRows
        .filter((c) => c.gradeLevel === lv.gradeLevel && c.avgPercent != null)
        // avgPercent filtreyle non-null garantili → ?? gereksiz (dead branch kaçınılır)
        .sort((a, b) => (b.avgPercent as number) - (a.avgPercent as number))[0];
      return best ? { gradeLevel: lv.gradeLevel, classroom: best } : null;
    }).filter(Boolean);

    // Konu (zümre) başarımı + takvim zaman serisi
    const byDepartment = [...deptAgg.entries()]
      .map(([name, ps]) => ({ name, avgPercent: avg(ps), submissionCount: ps.length }))
      // deptAgg girdileri en az 1 (non-null) pct içerir → avgPercent non-null, ?? gereksiz
      .sort((a, b) => (b.avgPercent as number) - (a.avgPercent as number));
    const timeseries = [...dayAgg.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, ps]) => ({ date, avgPercent: avg(ps), submissionCount: ps.length }));

    return { branches: branchRows, levels: levelRows, classrooms: clsRows, byDepartment, timeseries, highlights: { bestBranch, bestClassByLevel }, subjects, homeroomClassrooms };
  }
}

/**
 * Öğrenci bazlı teslim durumu listesi (personel — Raporlar "Öğrenciler" sekmesi).
 * Her satır: öğrenci no (username) + ad soyad + sınıf + seviye + Zamanında/Geç/Yapılmadı.
 * Kapsam + filtreler GetFilteredReportUseCase ile birebir (hiyerarşiye uygun).
 */
export class GetStudentComplianceListUseCase {
  async execute(input: ReportFilters, actorId?: string) {
    const emptyRes = { students: [] as unknown[], subjects: [] as string[], capped: false };
    const rs = await resolveReportScope(actorId);
    const ownClassIds = await ownAssignmentClassIds(rs.schoolId, rs.ownTeacherId);
    if (rs.empty && ownClassIds.length === 0) return emptyRes;
    const db = prismaRead();
    const grade = input.gradeLevel != null && !isNaN(Number(input.gradeLevel)) ? Math.floor(Number(input.gradeLevel)) : undefined;
    const submittedAt = dateRange(input.from, input.to);
    const baseClsFilter = { ...(grade ? { gradeLevel: grade } : {}), ...(input.classroomId ? { id: input.classroomId } : {}) };

    let allClassIds: string[] = [];
    let subjectClassIds: string[] = [];
    if (rs.isSchoolAdmin) {
      allClassIds = (await db.classroom.findMany({ where: { schoolId: rs.schoolId, ...baseClsFilter }, select: { id: true } })).map((c) => c.id);
    } else {
      if (rs.allSubjectWhere.length) allClassIds = (await db.classroom.findMany({ where: { schoolId: rs.schoolId, OR: rs.allSubjectWhere, ...baseClsFilter }, select: { id: true } })).map((c) => c.id);
      if (rs.subjectSpanWhere.length) subjectClassIds = (await db.classroom.findMany({ where: { schoolId: rs.schoolId, OR: rs.subjectSpanWhere, ...baseClsFilter }, select: { id: true } })).map((c) => c.id);
    }
    const allSet = new Set(allClassIds);
    const subjOnly = subjectClassIds.filter((id) => !allSet.has(id));
    // Öğretmenin kendi verdiği ödevlerin sınıfları (yukarıda hesaplandı) — yalnız kendi ödevleri sayılır.
    const unionIds = [...new Set([...allClassIds, ...subjectClassIds, ...ownClassIds])];
    if (!unionIds.length) return emptyRes;

    const subject = input.subject?.trim() || undefined;
    const mergeExam = (deptPart?: Record<string, unknown>, withSubject = true) => {
      const w = { ...(deptPart ?? {}), ...(withSubject && subject ? { subject } : {}) };
      return Object.keys(w).length ? w : undefined;
    };
    const asgOr: Array<Record<string, unknown>> = [];
    const subOr: Array<Record<string, unknown>> = [];
    const asgOrNoSubj: Array<Record<string, unknown>> = [];
    if (allClassIds.length) {
      const ex = mergeExam(input.departmentId ? { departmentId: input.departmentId } : undefined);
      const exNo = mergeExam(input.departmentId ? { departmentId: input.departmentId } : undefined, false);
      asgOr.push({ classroomId: { in: allClassIds }, ...(ex ? { exam: ex } : {}) });
      subOr.push({ assignment: { classroomId: { in: allClassIds }, ...(ex ? { exam: ex } : {}) } });
      asgOrNoSubj.push({ classroomId: { in: allClassIds }, ...(exNo ? { exam: exNo } : {}) });
    }
    if (subjOnly.length && rs.subjectDeptIds.length) {
      const deptPart = input.departmentId ? { departmentId: input.departmentId } : { departmentId: { in: rs.subjectDeptIds } };
      const ex = mergeExam(deptPart)!;
      const exNo = mergeExam(deptPart, false)!;
      asgOr.push({ classroomId: { in: subjOnly }, exam: ex });
      subOr.push({ assignment: { classroomId: { in: subjOnly }, exam: ex } });
      asgOrNoSubj.push({ classroomId: { in: subjOnly }, exam: exNo });
    }
    if (ownClassIds.length && rs.ownTeacherId) {
      const ex = mergeExam(input.departmentId ? { departmentId: input.departmentId } : undefined);
      const exNo = mergeExam(input.departmentId ? { departmentId: input.departmentId } : undefined, false);
      asgOr.push({ classroomId: { in: ownClassIds }, createdById: rs.ownTeacherId, ...(ex ? { exam: ex } : {}) });
      subOr.push({ assignment: { classroomId: { in: ownClassIds }, createdById: rs.ownTeacherId, ...(ex ? { exam: ex } : {}) } });
      asgOrNoSubj.push({ classroomId: { in: ownClassIds }, createdById: rs.ownTeacherId, ...(exNo ? { exam: exNo } : {}) });
    }
    if (!asgOr.length) return emptyRes;

    const periodId = await resolvePeriodFilter(rs.schoolId, input.periodId);
    const now = new Date();

    const [classrooms, assignments, submissions, rosterUsers, subjectAsg] = await Promise.all([
      db.classroom.findMany({ where: { id: { in: unionIds } }, select: { id: true, name: true, gradeLevel: true, branch: { select: { name: true } } } }),
      db.schoolAssignment.findMany({ where: periodId ? { AND: [{ OR: asgOr }, { periodId }] } : { OR: asgOr }, select: { id: true, classroomId: true, dueDate: true } }),
      db.schoolSubmission.findMany({
        where: { ...(periodId ? { assignment: { periodId } } : {}), OR: subOr, status: { in: ['SUBMITTED', 'GRADED'] as any }, ...(submittedAt ? { submittedAt } : {}) },
        select: { studentId: true, submittedAt: true, assignment: { select: { id: true, dueDate: true } } },
      }),
      db.schoolUser.findMany({ where: { schoolId: rs.schoolId, classroomId: { in: unionIds }, schoolRole: 'STUDENT' as any, isActive: true }, select: { userId: true, username: true, studentNo: true, classroomId: true, user: { select: { firstName: true, lastName: true } } } }),
      db.schoolAssignment.findMany({ where: periodId ? { AND: [{ OR: asgOrNoSubj }, { periodId }] } : { OR: asgOrNoSubj }, select: { exam: { select: { subject: true } } } }),
    ]);
    const subjects = [...new Set(subjectAsg.map((a) => a.exam?.subject).filter((s): s is string => !!s && s.trim() !== ''))].sort((a, b) => a.localeCompare(b, 'tr'));

    const clsMap = new Map(classrooms.map((c) => [c.id, c]));
    const pastDueByCls = new Map<string, Set<string>>();
    for (const a of assignments) {
      if (!a.dueDate || a.dueDate >= now) continue;
      const set = pastDueByCls.get(a.classroomId) ?? new Set<string>();
      set.add(a.id);
      pastDueByCls.set(a.classroomId, set);
    }
    type Acc = { onTime: number; late: number; submitted: Set<string> };
    const byStudent = new Map<string, Acc>();
    for (const s of submissions) {
      let acc = byStudent.get(s.studentId);
      if (!acc) { acc = { onTime: 0, late: 0, submitted: new Set<string>() }; byStudent.set(s.studentId, acc); }
      if (s.assignment?.id) acc.submitted.add(s.assignment.id);
      const due = s.assignment?.dueDate;
      if (s.submittedAt && due && s.submittedAt > due) acc.late++;
      else if (s.submittedAt) acc.onTime++;
    }

    const nameOf = (u: { username: string; firstName: string | null; lastName: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username;
    const CAP = 1000;
    const rows = rosterUsers
      .map((r) => {
        const acc = byStudent.get(r.userId);
        const cls = r.classroomId ? clsMap.get(r.classroomId) : undefined;
        const pastDue = (r.classroomId ? pastDueByCls.get(r.classroomId) : undefined) ?? new Set<string>();
        const submittedSet = acc?.submitted ?? new Set<string>();
        let notDone = 0;
        for (const aId of pastDue) if (!submittedSet.has(aId)) notDone++;
        return {
          studentUserId: r.userId, // detay pop-up'ı için
          studentNo: r.studentNo || r.username, // gerçek öğrenci no varsa o, yoksa kullanıcı adı
          username: r.username,
          name: nameOf({ username: r.username, firstName: r.user?.firstName ?? null, lastName: r.user?.lastName ?? null }),
          classroomName: cls?.name ?? '—',
          branchName: cls?.branch?.name ?? '—',
          gradeLevel: cls?.gradeLevel ?? null,
          onTimeCount: acc?.onTime ?? 0,
          lateCount: acc?.late ?? 0,
          notDoneCount: notDone,
        };
      })
      .sort((a, b) => (a.gradeLevel ?? 0) - (b.gradeLevel ?? 0) || a.classroomName.localeCompare(b.classroomName, 'tr') || a.name.localeCompare(b.name, 'tr'));

    return { students: rows.slice(0, CAP), subjects, capped: rows.length > CAP };
  }
}

/**
 * Tek öğrencinin ödev-ödev başarım/teslim detayı (Raporlar "Öğrenciler" sekmesi → detay pop-up).
 * Personel; öğrenciye erişim hiyerarşik kapsamla doğrulanır (sınıfı kapsamda olmalı).
 */
export class GetStudentAssignmentDetailUseCase {
  async execute(
    input: { studentId: string; from?: string; to?: string; subject?: string; departmentId?: string; periodId?: string },
    actorId?: string,
  ) {
    const rs = await resolveReportScope(actorId);
    const ownClassIds = await ownAssignmentClassIds(rs.schoolId, rs.ownTeacherId);
    if (rs.empty && ownClassIds.length === 0) throw new AppError('FORBIDDEN', 'Yetki yok', 403);
    const db = prismaRead();

    let allClassIds: string[] = [];
    let subjectClassIds: string[] = [];
    if (rs.isSchoolAdmin) {
      allClassIds = (await db.classroom.findMany({ where: { schoolId: rs.schoolId }, select: { id: true } })).map((c) => c.id);
    } else {
      if (rs.allSubjectWhere.length) allClassIds = (await db.classroom.findMany({ where: { schoolId: rs.schoolId, OR: rs.allSubjectWhere }, select: { id: true } })).map((c) => c.id);
      if (rs.subjectSpanWhere.length) subjectClassIds = (await db.classroom.findMany({ where: { schoolId: rs.schoolId, OR: rs.subjectSpanWhere }, select: { id: true } })).map((c) => c.id);
    }
    const allSet = new Set(allClassIds);
    const subjOnly = new Set(subjectClassIds.filter((id) => !allSet.has(id)));
    const ownSet = new Set(ownClassIds);
    const accessible = new Set([...allClassIds, ...subjectClassIds, ...ownClassIds]);

    const su = await db.schoolUser.findFirst({
      where: { schoolId: rs.schoolId, userId: input.studentId, schoolRole: 'STUDENT' as any },
      select: { username: true, studentNo: true, classroomId: true, user: { select: { firstName: true, lastName: true } }, classroom: { select: { name: true, gradeLevel: true, branch: { select: { name: true } } } } },
    });
    if (!su || !su.classroomId || !accessible.has(su.classroomId)) throw new AppError('STUDENT_NOT_FOUND', 'Öğrenci bulunamadı', 404);

    // exam filtresi — branş-kısıtlı sınıfsa kendi zümresi; UI ders/zümre filtresi de uygulanır.
    const subject = input.subject?.trim() || undefined;
    const examWhere: Record<string, unknown> = {};
    if (input.departmentId) examWhere.departmentId = input.departmentId;
    else if (subjOnly.has(su.classroomId) && !allSet.has(su.classroomId)) examWhere.departmentId = { in: rs.subjectDeptIds };
    if (subject) examWhere.subject = subject;
    // Sınıfa yalnız "kendi verdiği ödev" üzerinden erişiliyorsa (designation yok) → yalnız kendi ödevleri.
    const ownOnly = ownSet.has(su.classroomId) && !allSet.has(su.classroomId) && !subjOnly.has(su.classroomId);

    const periodId = await resolvePeriodFilter(rs.schoolId, input.periodId);
    const now = new Date();
    const submittedAt = dateRange(input.from, input.to);

    const assignments = await db.schoolAssignment.findMany({
      where: {
        classroomId: su.classroomId,
        availableFrom: { lte: now },
        ...(ownOnly && rs.ownTeacherId ? { createdById: rs.ownTeacherId } : {}),
        ...(periodId ? { periodId } : {}),
        ...(Object.keys(examWhere).length ? { exam: examWhere } : {}),
      },
      orderBy: [{ dueDate: 'asc' }],
      select: { id: true, title: true, dueDate: true, exam: { select: { title: true, subject: true, durationMinutes: true } } },
    });
    const asgIds = assignments.map((a) => a.id);
    const subs = asgIds.length
      ? await db.schoolSubmission.findMany({
          where: { studentId: input.studentId, assignmentId: { in: asgIds }, ...(submittedAt ? { submittedAt } : {}) },
          select: { assignmentId: true, status: true, startedAt: true, submittedAt: true, totalScore: true, maxScore: true },
        })
      : [];
    const subByAsg = new Map(subs.map((s) => [s.assignmentId, s]));

    let onTime = 0, late = 0, notDone = 0;
    const rows = assignments.map((a) => {
      const s = subByAsg.get(a.id);
      const submitted = !!s && (s.status === 'SUBMITTED' || s.status === 'GRADED') && !!s.submittedAt;
      let status: 'onTime' | 'late' | 'notDone' | 'pending' | 'inProgress';
      if (submitted) {
        if (a.dueDate && s!.submittedAt! > a.dueDate) { status = 'late'; late++; }
        else { status = 'onTime'; onTime++; }
      } else if (a.dueDate && a.dueDate < now) {
        status = 'notDone'; notDone++; // süresi geçmiş, teslim yok (devam ediyor olsa bile)
      } else if (s && s.status === 'IN_PROGRESS') {
        status = 'inProgress';
      } else {
        status = 'pending'; // süresi geçmemiş, henüz başlanmamış
      }
      return {
        assignmentTitle: a.title,
        examTitle: a.exam?.title ?? '—',
        subject: a.exam?.subject ?? null,
        durationMinutes: a.exam?.durationMinutes ?? null,
        dueDate: a.dueDate ? a.dueDate.toISOString() : null,
        submittedAt: submitted ? s!.submittedAt!.toISOString() : null,
        status,
        score: submitted ? s!.totalScore ?? null : null,
        maxScore: submitted ? s!.maxScore ?? null : null,
      };
    });

    return {
      student: {
        studentNo: su.studentNo || su.username, // gerçek öğrenci no varsa o, yoksa kullanıcı adı
        name: [su.user?.firstName, su.user?.lastName].filter(Boolean).join(' ') || su.username,
        classroomName: su.classroom?.name ?? '—',
        branchName: su.classroom?.branch?.name ?? '—',
        gradeLevel: su.classroom?.gradeLevel ?? null,
      },
      summary: { onTime, late, notDone, total: assignments.length },
      assignments: rows,
    };
  }
}

/** Tek sınıf detay raporu — zaman aralığı + zümre filtresiyle öğrenci/ödev/zümre kırılımı. */
export class GetClassroomReportUseCase {
  async execute(classroomId: string, input: { from?: string; to?: string; departmentId?: string; subject?: string }, actorId?: string) {
    const rs = await resolveReportScope(actorId);
    const ownClassIds = await ownAssignmentClassIds(rs.schoolId, rs.ownTeacherId);
    if (rs.empty && ownClassIds.length === 0) throw new AppError('CLASSROOM_NOT_FOUND', 'Sınıf bulunamadı', 404);
    const db = prismaRead();
    const clsSelect = { id: true, name: true, gradeLevel: true, branch: { select: { name: true } }, _count: { select: { students: true } } };
    // Erişim: tüm-ders mi (yönetim) yoksa branş-kısıtlı mı (zümre başkanlığı) yoksa yalnız kendi ödevi mi?
    let allSubjectAccess = rs.isSchoolAdmin;
    let ownOnly = false;
    let cls: any = null;
    if (rs.isSchoolAdmin) {
      cls = await db.classroom.findFirst({ where: { id: classroomId, schoolId: rs.schoolId }, select: clsSelect });
    } else {
      if (rs.allSubjectWhere.length) {
        cls = await db.classroom.findFirst({ where: { id: classroomId, schoolId: rs.schoolId, OR: rs.allSubjectWhere }, select: clsSelect });
        if (cls) allSubjectAccess = true;
      }
      if (!cls && rs.subjectSpanWhere.length) {
        cls = await db.classroom.findFirst({ where: { id: classroomId, schoolId: rs.schoolId, OR: rs.subjectSpanWhere }, select: clsSelect });
      }
      // Designation yok ama bu sınıfa kendi ödevini vermiş → yalnız kendi ödevleri görünür.
      if (!cls && rs.ownTeacherId && ownClassIds.includes(classroomId)) {
        cls = await db.classroom.findFirst({ where: { id: classroomId, schoolId: rs.schoolId }, select: clsSelect });
        if (cls) ownOnly = true;
      }
    }
    if (!cls) throw new AppError('CLASSROOM_NOT_FOUND', 'Sınıf bulunamadı', 404);
    const submittedAt = dateRange(input.from, input.to);
    const subject = input.subject?.trim() || undefined;
    const examWhere = {
      ...(input.departmentId ? { departmentId: input.departmentId } : (allSubjectAccess || ownOnly ? {} : { departmentId: { in: rs.subjectDeptIds } })),
      ...(subject ? { subject } : {}),
    };
    const deptWhere = Object.keys(examWhere).length ? { exam: examWhere } : {};

    const subs = await db.schoolSubmission.findMany({
      where: {
        assignment: { classroomId, ...(ownOnly && rs.ownTeacherId ? { createdById: rs.ownTeacherId } : {}), ...deptWhere },
        status: { in: ['SUBMITTED', 'GRADED'] as any },
        ...(submittedAt ? { submittedAt } : {}),
      },
      select: {
        totalScore: true, maxScore: true,
        student: { select: { id: true, username: true, firstName: true, lastName: true } },
        assignment: { select: { id: true, title: true, exam: { select: { department: { select: { name: true } } } } } },
      },
    });

    const label = (u: { username: string; firstName: string | null; lastName: string | null }) =>
      [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username;
    const stuMap = new Map<string, { name: string; pcts: number[]; n: number }>();
    const asgMap = new Map<string, { title: string; dept: string | null; pcts: number[]; n: number }>();
    const deptMap = new Map<string, { name: string; pcts: number[]; n: number }>();
    const allPcts: number[] = [];
    for (const s of subs) {
      const p = pct(s.totalScore, s.maxScore);
      if (p != null) allPcts.push(p);
      const su = stuMap.get(s.student.id) ?? { name: label(s.student), pcts: [], n: 0 };
      su.n++; if (p != null) su.pcts.push(p); stuMap.set(s.student.id, su);
      const am = asgMap.get(s.assignment!.id) ?? { title: s.assignment!.title, dept: s.assignment!.exam?.department?.name ?? null, pcts: [], n: 0 };
      am.n++; if (p != null) am.pcts.push(p); asgMap.set(s.assignment!.id, am);
      const dname = s.assignment!.exam?.department?.name ?? 'Zümresiz';
      const dm = deptMap.get(dname) ?? { name: dname, pcts: [], n: 0 };
      dm.n++; if (p != null) dm.pcts.push(p); deptMap.set(dname, dm);
    }

    return {
      classroom: { id: cls.id, name: cls.name, gradeLevel: cls.gradeLevel, branchName: cls.branch?.name ?? '—', studentCount: cls._count.students },
      summary: { submissionCount: subs.length, avgPercent: avg(allPcts) },
      students: [...stuMap.values()].map((s) => ({ name: s.name, submissionCount: s.n, avgPercent: avg(s.pcts) })).sort((a, b) => (b.avgPercent ?? -1) - (a.avgPercent ?? -1)),
      assignments: [...asgMap.values()].map((a) => ({ title: a.title, department: a.dept, submissionCount: a.n, avgPercent: avg(a.pcts) })),
      departments: [...deptMap.values()].map((d) => ({ name: d.name, submissionCount: d.n, avgPercent: avg(d.pcts) })),
    };
  }
}

/** Şube raporu — şubedeki sınıfların performansı (BRANCH_ADMIN kendi şubesi / SCHOOL_ADMIN herhangi). */
export class GetBranchReportUseCase {
  async execute(branchId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN');
    if (ctx.schoolRole === 'BRANCH_ADMIN' && ctx.branchId !== branchId) throw new AppError('FORBIDDEN', 'Yalnız kendi şubenizin raporu', 403);
    const db = prismaRead();

    const branch = await db.branch.findFirst({ where: { id: branchId, schoolId: ctx.schoolId }, select: { id: true, name: true } });
    if (!branch) throw new AppError('BRANCH_NOT_FOUND', 'Şube bulunamadı', 404);

    const classrooms = await db.classroom.findMany({ where: { branchId, schoolId: ctx.schoolId }, select: { id: true, name: true, gradeLevel: true, _count: { select: { students: true } } } });
    const clsIds = classrooms.map((c) => c.id);
    const [assignments, submissions] = await Promise.all([
      db.schoolAssignment.groupBy({ by: ['classroomId'], where: { classroomId: { in: clsIds } }, _count: { _all: true } }),
      db.schoolSubmission.findMany({
        where: { assignment: { classroomId: { in: clsIds } }, status: { in: ['SUBMITTED', 'GRADED'] as any } },
        select: { totalScore: true, maxScore: true, assignment: { select: { classroomId: true } } },
      }),
    ]);
    const asgByCls = new Map(assignments.map((a) => [a.classroomId, a._count._all]));
    const pctByCls = new Map<string, number[]>();
    let subCountByCls = new Map<string, number>();
    for (const s of submissions) {
      subCountByCls.set(s.assignment!.classroomId, (subCountByCls.get(s.assignment!.classroomId) ?? 0) + 1);
      const p = pct(s.totalScore, s.maxScore);
      if (p != null) pctByCls.set(s.assignment!.classroomId, [...(pctByCls.get(s.assignment!.classroomId) ?? []), p]);
    }

    return {
      branchName: branch.name,
      classrooms: classrooms
        .sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name))
        .map((c) => ({
          id: c.id,
          name: c.name,
          gradeLevel: c.gradeLevel,
          studentCount: c._count.students,
          assignmentCount: asgByCls.get(c.id) ?? 0,
          submissionCount: subCountByCls.get(c.id) ?? 0,
          avgPercent: avg(pctByCls.get(c.id) ?? []),
        })),
    };
  }
}
