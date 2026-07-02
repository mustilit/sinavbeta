/**
 * E-Sınıf controller'ları — ince HTTP→use-case köprüsü birim testleri.
 *
 * Controller'lar use-case'leri private alan olarak `new XUseCase()` ile kurar
 * (constructor injection YOK). Bu yüzden:
 *   1) prisma + dbRouter mock'lanır → controller import'u gerçek PrismaClient
 *      başlatmaz (use-case modülleri yüklenir ama prisma sahte).
 *   2) controller örneklenir, ilgili private use-case alanı sahte
 *      `{ execute }` ile değiştirilir.
 *   3) her endpoint metodu çağrılır → execute doğru argümanlarla mı,
 *      dönüş değeri aynen mi iletiliyor doğrulanır.
 *
 * Kapsam hedefi: 9 controller'ın tüm route delegasyon satırları.
 */
jest.mock('../../src/infrastructure/database/prisma', () => ({ prisma: {} }));
jest.mock('../../src/infrastructure/database/dbRouter', () => ({ prismaRead: jest.fn(() => ({})) }));

import { SchoolController } from '../../src/nest/controllers/school.controller';
import { AdminSchoolsController } from '../../src/nest/controllers/admin.schools.controller';
import { SchoolExamsController } from '../../src/nest/controllers/school-exams.controller';
import { SchoolGradingController } from '../../src/nest/controllers/school-grading.controller';
import { SchoolLiveController } from '../../src/nest/controllers/school-live.controller';
import { SchoolReportsController } from '../../src/nest/controllers/school-reports.controller';
import { SchoolStudentController, SchoolStudentReportController } from '../../src/nest/controllers/school-student.controller';
import { SchoolTunnelController } from '../../src/nest/controllers/school-tunnel.controller';
import { SchoolAssignmentsController } from '../../src/nest/controllers/school-assignments.controller';

const REQ = { user: { id: 'actor-1' } };

/** Bir controller case'i: hangi private alan stub'lanır, metot nasıl çağrılır, execute hangi argümanları almalı. */
type Case = {
  name: string;
  field: string;                       // controller'daki private use-case alanı
  call: (c: any) => Promise<unknown> | unknown;
  args: unknown[];                     // execute'a beklenen argümanlar
};

function runCases(makeController: () => any, cases: Case[]) {
  it.each(cases)('$name → execute doğru argümanlarla çağrılır + dönüş iletilir', async ({ field, call, args }) => {
    const controller = makeController();
    const sentinel = { __sentinel: Math.random() };
    const execute = jest.fn().mockResolvedValue(sentinel);
    (controller as any)[field] = { execute };
    const result = await call(controller);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(...args);
    expect(result).toBe(sentinel);
  });
}

// ───────────────────────── SchoolController (organizasyon + kullanıcı) ──────────────────────
describe('SchoolController', () => {
  runCases(() => new SchoolController(), [
    { name: 'tree', field: 'treeUC', call: (c) => c.tree(REQ), args: ['actor-1'] },
    { name: 'listBranches', field: 'listBranchesUC', call: (c) => c.listBranches(REQ), args: ['actor-1'] },
    { name: 'createBranch', field: 'createBranchUC', call: (c) => c.createBranch({ name: 'Merkez' }, REQ), args: [{ name: 'Merkez' }, 'actor-1'] },
    { name: 'assignBranchAdmin', field: 'assignBranchAdminUC', call: (c) => c.assignBranchAdmin('b1', { schoolUserId: 'su1' }, REQ), args: ['b1', { schoolUserId: 'su1' }, 'actor-1'] },
    { name: 'createLevel', field: 'createLevelUC', call: (c) => c.createLevel({ branchId: 'b1', gradeLevel: 5 }, REQ), args: [{ branchId: 'b1', gradeLevel: 5 }, 'actor-1'] },
    { name: 'assignLevelAdmin', field: 'assignLevelAdminUC', call: (c) => c.assignLevelAdmin('lv1', { schoolUserId: 'su1' }, REQ), args: ['lv1', { schoolUserId: 'su1' }, 'actor-1'] },
    { name: 'deleteLevel', field: 'deleteLevelUC', call: (c) => c.deleteLevel('lv1', REQ), args: ['lv1', 'actor-1'] },
    { name: 'listClassrooms (branchId)', field: 'listClassroomsUC', call: (c) => c.listClassrooms('b1', REQ), args: [{ branchId: 'b1' }, 'actor-1'] },
    { name: 'listClassrooms (branchId yok)', field: 'listClassroomsUC', call: (c) => c.listClassrooms(undefined, REQ), args: [{ branchId: undefined }, 'actor-1'] },
    { name: 'createClassroom', field: 'createClassroomUC', call: (c) => c.createClassroom({ levelId: 'lv1', name: '5-A' }, REQ), args: [{ levelId: 'lv1', name: '5-A' }, 'actor-1'] },
    { name: 'assignStudents', field: 'assignStudentsUC', call: (c) => c.assignStudents('c1', { schoolUserIds: ['s1'] }, REQ), args: ['c1', { schoolUserIds: ['s1'] }, 'actor-1'] },
    { name: 'bulkStudents', field: 'bulkStudentsUC', call: (c) => c.bulkStudents('c1', { students: [] }, REQ), args: ['c1', { students: [] }, 'actor-1'] },
    { name: 'removeStudents', field: 'removeStudentsUC', call: (c) => c.removeStudents('c1', { schoolUserIds: ['s1'] }, REQ), args: ['c1', { schoolUserIds: ['s1'] }, 'actor-1'] },
    { name: 'assignClassroomAdmin', field: 'assignClassroomAdminUC', call: (c) => c.assignClassroomAdmin('c1', { schoolUserId: 'su1' }, REQ), args: ['c1', { schoolUserId: 'su1' }, 'actor-1'] },
    { name: 'deleteClassroom', field: 'deleteClassroomUC', call: (c) => c.deleteClassroom('c1', REQ), args: ['c1', 'actor-1'] },
    { name: 'setClassroomActive (true)', field: 'setClassroomActiveUC', call: (c) => c.setClassroomActive('c1', { isActive: true }, REQ), args: ['c1', { isActive: true }, 'actor-1'] },
    { name: 'setClassroomActive (falsy → false)', field: 'setClassroomActiveUC', call: (c) => c.setClassroomActive('c1', {}, REQ), args: ['c1', { isActive: false }, 'actor-1'] },
    { name: 'departmentTree', field: 'deptTreeUC', call: (c) => c.departmentTree(REQ), args: ['actor-1'] },
    { name: 'listDepartments', field: 'listDeptsUC', call: (c) => c.listDepartments(REQ), args: ['actor-1'] },
    { name: 'createDepartment', field: 'createDeptUC', call: (c) => c.createDepartment({ name: 'Mat', subject: 'Matematik' }, REQ), args: [{ name: 'Mat', subject: 'Matematik' }, 'actor-1'] },
    { name: 'deleteDepartment', field: 'deleteDeptUC', call: (c) => c.deleteDepartment('d1', REQ), args: ['d1', 'actor-1'] },
    { name: 'departmentMembers', field: 'deptMembersUC', call: (c) => c.departmentMembers('d1', REQ), args: ['d1', 'actor-1'] },
    { name: 'assignMembers', field: 'assignMembersUC', call: (c) => c.assignMembers('d1', { schoolUserIds: ['s1'] }, REQ), args: ['d1', { schoolUserIds: ['s1'] }, 'actor-1'] },
    { name: 'listSubjects', field: 'listSubjectsUC', call: (c) => c.listSubjects(REQ), args: ['actor-1'] },
    { name: 'createSubject', field: 'createSubjectUC', call: (c) => c.createSubject({ name: 'Fizik' }, REQ), args: [{ name: 'Fizik' }, 'actor-1'] },
    { name: 'deleteSubject', field: 'deleteSubjectUC', call: (c) => c.deleteSubject('sub1', REQ), args: ['sub1', 'actor-1'] },
    { name: 'listPeriods', field: 'listPeriodsUC', call: (c) => c.listPeriods(REQ), args: ['actor-1'] },
    { name: 'listLevels', field: 'listLevelsUC', call: (c) => c.listLevels(REQ), args: ['actor-1'] },
    { name: 'listTopics', field: 'listTopicsUC', call: (c) => c.listTopics(REQ), args: ['actor-1'] },
    { name: 'createUser', field: 'createUserUC', call: (c) => c.createUser({ schoolRole: 'TEACHER' }, REQ), args: [{ schoolRole: 'TEACHER' }, 'actor-1'] },
    { name: 'setActive', field: 'setActiveUC', call: (c) => c.setActive('su1', { isActive: false }, REQ), args: ['su1', { isActive: false }, 'actor-1'] },
    { name: 'resetPassword', field: 'resetPwUC', call: (c) => c.resetPassword('su1', REQ), args: ['su1', 'actor-1'] },
    { name: 'quota', field: 'quotaUC', call: (c) => c.quota(REQ), args: ['actor-1'] },
    { name: 'panelStats', field: 'panelStatsUC', call: (c) => c.panelStats(REQ), args: ['actor-1'] },
  ]);

  it('listUsers: query parametrelerini normalize eder (limit→Number, cursor||null)', async () => {
    const controller = new SchoolController();
    const execute = jest.fn().mockResolvedValue([]);
    (controller as any).listUsersUC = { execute };
    await controller.listUsers('STUDENT', 'ali', 'b1', 'p-2026', 'cur1', '30', REQ);
    expect(execute).toHaveBeenCalledWith(
      { role: 'STUDENT', q: 'ali', branchId: 'b1', periodId: 'p-2026', cursor: 'cur1', limit: 30 },
      'actor-1',
    );
  });

  it('listUsers: cursor yoksa null, limit yoksa undefined', async () => {
    const controller = new SchoolController();
    const execute = jest.fn().mockResolvedValue([]);
    (controller as any).listUsersUC = { execute };
    await controller.listUsers(undefined, undefined, undefined, undefined, undefined, undefined, REQ);
    expect(execute).toHaveBeenCalledWith(
      { role: undefined, q: undefined, branchId: undefined, periodId: undefined, cursor: null, limit: undefined },
      'actor-1',
    );
  });
});

// ───────────────────────── AdminSchoolsController (platform admin) ──────────────────────────
describe('AdminSchoolsController', () => {
  runCases(() => new AdminSchoolsController(), [
    { name: 'listPeriods', field: 'listPeriodsUC', call: (c) => c.listPeriods(), args: [] },
    { name: 'createPeriod', field: 'createPeriodUC', call: (c) => c.createPeriod({ name: '2026-2027', startDate: 's', endDate: 'e' }, REQ), args: [{ name: '2026-2027', startDate: 's', endDate: 'e' }, 'actor-1'] },
    { name: 'listSchools', field: 'listSchoolsUC', call: (c) => c.listSchools({ q: 'ank' }), args: [{ q: 'ank' }] },
    { name: 'createSchool', field: 'createSchoolUC', call: (c) => c.createSchool({ name: 'Okul', code: 'ANK', periodId: 'p1' }, REQ), args: [{ name: 'Okul', code: 'ANK', periodId: 'p1' }, 'actor-1'] },
    { name: 'updateSchool', field: 'updateSchoolUC', call: (c) => c.updateSchool('sch1', { name: 'Yeni' }, REQ), args: ['sch1', { name: 'Yeni' }, 'actor-1'] },
    { name: 'deactivateSchool', field: 'deactivateSchoolUC', call: (c) => c.deactivateSchool('sch1', REQ), args: ['sch1', 'actor-1'] },
    { name: 'assignAdmin', field: 'assignAdminUC', call: (c) => c.assignAdmin('sch1', { email: 'a@b.com' }, REQ), args: ['sch1', { email: 'a@b.com' }, 'actor-1'] },
    { name: 'assignPeriod', field: 'assignPeriodUC', call: (c) => c.assignPeriod('sch1', { periodId: 'p2' }, REQ), args: ['sch1', { periodId: 'p2' }, 'actor-1'] },
    { name: 'removePeriod', field: 'removePeriodUC', call: (c) => c.removePeriod('sch1', 'p2', REQ), args: ['sch1', 'p2', 'actor-1'] },
  ]);
});

// ───────────────────────── SchoolExamsController ────────────────────────────────────────────
describe('SchoolExamsController', () => {
  runCases(() => new SchoolExamsController(), [
    { name: 'get', field: 'getUC', call: (c) => c.get('ex1', REQ), args: ['ex1', 'actor-1'] },
    { name: 'create', field: 'createUC', call: (c) => c.create({ examType: 'TEST', title: 'S' }, REQ), args: [{ examType: 'TEST', title: 'S' }, 'actor-1'] },
    { name: 'update', field: 'updateUC', call: (c) => c.update('ex1', { title: 'Yeni' }, REQ), args: ['ex1', { title: 'Yeni' }, 'actor-1'] },
    { name: 'saveQuestions', field: 'saveQUC', call: (c) => c.saveQuestions('ex1', { questions: [] }, REQ), args: ['ex1', { questions: [] }, 'actor-1'] },
    { name: 'archive', field: 'archiveUC', call: (c) => c.archive('ex1', { isArchived: true }, REQ), args: ['ex1', { isArchived: true }, 'actor-1'] },
    { name: 'remove', field: 'deleteUC', call: (c) => c.remove('ex1', REQ), args: ['ex1', 'actor-1'] },
  ]);

  it('list: examType/gradeLevel(Number)/includeArchived/q parse eder', async () => {
    const controller = new SchoolExamsController();
    const execute = jest.fn().mockResolvedValue([]);
    (controller as any).listUC = { execute };
    await controller.list('TUNNEL', '7', '1', 'mat', REQ);
    expect(execute).toHaveBeenCalledWith({ examType: 'TUNNEL', gradeLevel: 7, includeArchived: true, q: 'mat' }, 'actor-1');
  });

  it('list: gradeLevel yoksa undefined, includeArchived "true" da kabul, yoksa false', async () => {
    const controller = new SchoolExamsController();
    const execute = jest.fn().mockResolvedValue([]);
    (controller as any).listUC = { execute };
    await controller.list(undefined, undefined, 'true', undefined, REQ);
    expect(execute).toHaveBeenCalledWith({ examType: undefined, gradeLevel: undefined, includeArchived: true, q: undefined }, 'actor-1');
    execute.mockClear();
    await controller.list(undefined, undefined, undefined, undefined, REQ);
    expect(execute).toHaveBeenCalledWith({ examType: undefined, gradeLevel: undefined, includeArchived: false, q: undefined }, 'actor-1');
  });
});

// ───────────────────────── SchoolGradingController ──────────────────────────────────────────
describe('SchoolGradingController', () => {
  runCases(() => new SchoolGradingController(), [
    { name: 'get', field: 'getUC', call: (c) => c.get('sub1', REQ), args: ['sub1', 'actor-1'] },
    { name: 'grade', field: 'gradeUC', call: (c) => c.grade('sub1', { grades: [] }, REQ), args: ['sub1', { grades: [] }, 'actor-1'] },
  ]);
});

// ───────────────────────── SchoolLiveController ─────────────────────────────────────────────
describe('SchoolLiveController', () => {
  runCases(() => new SchoolLiveController(), [
    { name: 'create', field: 'createUC', call: (c) => c.create({ title: 'L', questions: [] }, REQ), args: [{ title: 'L', questions: [] }, 'actor-1'] },
    { name: 'host', field: 'hostUC', call: (c) => c.host('ls1', REQ), args: ['ls1', 'actor-1'] },
    { name: 'start', field: 'startUC', call: (c) => c.start('ls1', REQ), args: ['ls1', 'actor-1'] },
    { name: 'advance', field: 'advanceUC', call: (c) => c.advance('ls1', REQ), args: ['ls1', 'actor-1'] },
    { name: 'prev', field: 'prevUC', call: (c) => c.prev('ls1', REQ), args: ['ls1', 'actor-1'] },
    { name: 'toggleStats', field: 'toggleStatsUC', call: (c) => c.toggleStats('ls1', REQ), args: ['ls1', 'actor-1'] },
    { name: 'end', field: 'endUC', call: (c) => c.end('ls1', REQ), args: ['ls1', 'actor-1'] },
    { name: 'join', field: 'joinUC', call: (c) => c.join({ joinCode: 'ABC123' }, REQ), args: [{ joinCode: 'ABC123' }, 'actor-1'] },
    { name: 'state', field: 'stateUC', call: (c) => c.state('ls1', REQ), args: ['ls1', 'actor-1'] },
    { name: 'ping', field: 'pingUC', call: (c) => c.ping('ls1', REQ), args: ['ls1', 'actor-1'] },
    { name: 'answer', field: 'answerUC', call: (c) => c.answer('ls1', { questionId: 'q1', optionId: 'o1' }, REQ), args: ['ls1', { questionId: 'q1', optionId: 'o1' }, 'actor-1'] },
  ]);

  it('list: periodId aktarılır', async () => {
    const controller = new SchoolLiveController();
    const execute = jest.fn().mockResolvedValue([]);
    (controller as any).listUC = { execute };
    await controller.list('p-2026', REQ);
    expect(execute).toHaveBeenCalledWith('actor-1', { periodId: 'p-2026' });
  });
});

// ───────────────────────── SchoolReportsController ──────────────────────────────────────────
describe('SchoolReportsController', () => {
  runCases(() => new SchoolReportsController(), [
    { name: 'overview', field: 'overviewUC', call: (c) => c.overview(REQ), args: ['actor-1'] },
    { name: 'breakdown', field: 'filteredUC', call: (c) => c.breakdown({ periodId: 'p1' }, REQ), args: [{ periodId: 'p1' }, 'actor-1'] },
    { name: 'classroom', field: 'classroomUC', call: (c) => c.classroom('c1', { from: 'x' }, REQ), args: ['c1', { from: 'x' }, 'actor-1'] },
    { name: 'branch', field: 'branchUC', call: (c) => c.branch('b1', REQ), args: ['b1', 'actor-1'] },
  ]);
});

// ───────────────────────── SchoolStudentController + Report ─────────────────────────────────
describe('SchoolStudentController', () => {
  runCases(() => new SchoolStudentController(), [
    { name: 'list', field: 'listUC', call: (c) => c.list('pending', REQ), args: [{ filter: 'pending' }, 'actor-1'] },
    { name: 'get', field: 'getUC', call: (c) => c.get('a1', REQ), args: ['a1', 'actor-1'] },
    { name: 'start', field: 'startUC', call: (c) => c.start('a1', REQ), args: ['a1', 'actor-1'] },
    { name: 'answer', field: 'saveUC', call: (c) => c.answer('a1', { questionId: 'q1', selectedOptionId: 'o1' }, REQ), args: ['a1', { questionId: 'q1', selectedOptionId: 'o1' }, 'actor-1'] },
    { name: 'submit', field: 'submitUC', call: (c) => c.submit('a1', REQ), args: ['a1', 'actor-1'] },
    { name: 'result', field: 'resultUC', call: (c) => c.result('a1', REQ), args: ['a1', 'actor-1'] },
  ]);
});

describe('SchoolStudentReportController', () => {
  runCases(() => new SchoolStudentReportController(), [
    { name: 'report', field: 'reportUC', call: (c) => c.report('2026-01-01', '2026-06-01', undefined, undefined, REQ), args: ['actor-1', { from: '2026-01-01', to: '2026-06-01', examType: undefined, subject: undefined }] },
  ]);
});

// ───────────────────────── SchoolTunnelController ───────────────────────────────────────────
describe('SchoolTunnelController', () => {
  runCases(() => new SchoolTunnelController(), [
    { name: 'start', field: 'startUC', call: (c) => c.start('ex1', REQ), args: ['ex1', 'actor-1'] },
    { name: 'state', field: 'stateUC', call: (c) => c.state('ex1', REQ), args: ['ex1', 'actor-1'] },
    { name: 'answer (optionId açılır)', field: 'answerUC', call: (c) => c.answer('ex1', { optionId: 'o1' }, REQ), args: ['ex1', 'o1', 'actor-1'] },
  ]);
});

// ───────────────────────── SchoolAssignmentsController ──────────────────────────────────────
describe('SchoolAssignmentsController', () => {
  runCases(() => new SchoolAssignmentsController(), [
    { name: 'list', field: 'listUC', call: (c) => c.list({ classroomId: 'c1', periodId: 'p1' }, REQ), args: [{ classroomId: 'c1', periodId: 'p1' }, 'actor-1'] },
    { name: 'options', field: 'optionsUC', call: (c) => c.options(REQ), args: ['actor-1'] },
    { name: 'create', field: 'createUC', call: (c) => c.create({ examId: 'ex1', classroomIds: ['c1'] }, REQ), args: [{ examId: 'ex1', classroomIds: ['c1'] }, 'actor-1'] },
    { name: 'report', field: 'reportUC', call: (c) => c.report('a1', REQ), args: ['a1', 'actor-1'] },
    { name: 'release', field: 'releaseUC', call: (c) => c.release('a1', REQ), args: ['a1', 'actor-1'] },
    { name: 'close', field: 'closeUC', call: (c) => c.close('a1', { status: 'CLOSED' }, REQ), args: ['a1', { status: 'CLOSED' }, 'actor-1'] },
    { name: 'offlineDone', field: 'offlineDoneUC', call: (c) => c.offlineDone('a1', { done: true }, REQ), args: ['a1', { done: true }, 'actor-1'] },
  ]);
});
