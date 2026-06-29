import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import {
  CreateBranchDto, AssignAdminDto, CreateLevelDto, CreateClassroomDto, AssignStudentsDto,
  BulkStudentsDto, CreateDepartmentDto, CreateSubjectDto, AssignMembersDto, CreateSchoolUserDto, SetActiveDto,
} from './dto/school-org.dto';
import {
  CreateBranchUseCase,
  ListBranchesUseCase,
  AssignBranchAdminUseCase,
  CreateLevelUseCase,
  AssignLevelAdminUseCase,
  DeleteLevelUseCase,
  CreateClassroomUseCase,
  ListClassroomsUseCase,
  AssignStudentsToClassroomUseCase,
  RemoveStudentsFromClassroomUseCase,
  AssignClassroomAdminUseCase,
  DeleteClassroomUseCase,
  SetClassroomActiveUseCase,
  GetSchoolTreeUseCase,
  CreateDepartmentUseCase,
  ListDepartmentsUseCase,
  GetDepartmentTreeUseCase,
  DeleteDepartmentUseCase,
  GetDepartmentMembersUseCase,
  AssignDepartmentMembersUseCase,
  CreateSubjectUseCase,
  ListSubjectsUseCase,
  ListSchoolLevelsUseCase,
  ListSchoolTopicsUseCase,
  ListSchoolPeriodsUseCase,
  DeleteSubjectUseCase,
  GetSchoolQuotaUseCase,
  GetSchoolPanelStatsUseCase,
} from '../../application/use-cases/school/SchoolOrgUseCases';
import {
  CreateSchoolUserUseCase,
  BulkCreateStudentsUseCase,
  ListSchoolUsersUseCase,
  SetSchoolUserActiveUseCase,
  ResetSchoolUserPasswordUseCase,
} from '../../application/use-cases/school/SchoolUserUseCases';

// DTO'lar ./dto/school-org.dto.ts'e taşındı (marketplace dto/ konvansiyonu).

/** Okul Yöneticisi / Şube Yöneticisi — okul içi organizasyon + kullanıcı yönetimi.
 *  JWT zorunlu (global guard); okul rolü kontrolü use-case katmanında. */
@Controller('school')
@ApiTags('E-Sınıf · Okul')
export class SchoolController {
  private createBranchUC = new CreateBranchUseCase();
  private listBranchesUC = new ListBranchesUseCase();
  private assignBranchAdminUC = new AssignBranchAdminUseCase();
  private createLevelUC = new CreateLevelUseCase();
  private assignLevelAdminUC = new AssignLevelAdminUseCase();
  private deleteLevelUC = new DeleteLevelUseCase();
  private createClassroomUC = new CreateClassroomUseCase();
  private listClassroomsUC = new ListClassroomsUseCase();
  private assignStudentsUC = new AssignStudentsToClassroomUseCase();
  private removeStudentsUC = new RemoveStudentsFromClassroomUseCase();
  private bulkStudentsUC = new BulkCreateStudentsUseCase();
  private assignClassroomAdminUC = new AssignClassroomAdminUseCase();
  private deleteClassroomUC = new DeleteClassroomUseCase();
  private setClassroomActiveUC = new SetClassroomActiveUseCase();
  private treeUC = new GetSchoolTreeUseCase();
  private createDeptUC = new CreateDepartmentUseCase();
  private listDeptsUC = new ListDepartmentsUseCase();
  private deptTreeUC = new GetDepartmentTreeUseCase();
  private deleteDeptUC = new DeleteDepartmentUseCase();
  private deptMembersUC = new GetDepartmentMembersUseCase();
  private assignMembersUC = new AssignDepartmentMembersUseCase();
  private createSubjectUC = new CreateSubjectUseCase();
  private listSubjectsUC = new ListSubjectsUseCase();
  private listLevelsUC = new ListSchoolLevelsUseCase();
  private listTopicsUC = new ListSchoolTopicsUseCase();
  private listPeriodsUC = new ListSchoolPeriodsUseCase();
  private deleteSubjectUC = new DeleteSubjectUseCase();
  private quotaUC = new GetSchoolQuotaUseCase();
  private panelStatsUC = new GetSchoolPanelStatsUseCase();
  private createUserUC = new CreateSchoolUserUseCase();
  private listUsersUC = new ListSchoolUsersUseCase();
  private setActiveUC = new SetSchoolUserActiveUseCase();
  private resetPwUC = new ResetSchoolUserPasswordUseCase();

  // ── Ağaç (Şube → Seviye → Sınıf) ──
  @Get('tree') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Şube/Seviye/Sınıf ağacı' }) @ApiErrorResponses()
  tree(@Req() req: any) { return this.treeUC.execute(req?.user?.id); }

  // ── Şube ──
  @Get('branches') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Şube listesi' }) @ApiErrorResponses()
  listBranches(@Req() req: any) { return this.listBranchesUC.execute(req?.user?.id); }
  @Post('branches') @ApiBearerAuth('bearer') @ApiErrorResponses()
  createBranch(@Body() dto: CreateBranchDto, @Req() req: any) { return this.createBranchUC.execute(dto, req?.user?.id); }
  @Post('branches/:id/assign-admin') @ApiBearerAuth('bearer') @ApiErrorResponses()
  assignBranchAdmin(@Param('id') id: string, @Body() dto: AssignAdminDto, @Req() req: any) {
    return this.assignBranchAdminUC.execute(id, dto, req?.user?.id);
  }

  // ── Seviye ──
  @Post('levels') @ApiBearerAuth('bearer') @ApiErrorResponses()
  createLevel(@Body() dto: CreateLevelDto, @Req() req: any) { return this.createLevelUC.execute(dto, req?.user?.id); }
  @Post('levels/:id/assign-admin') @ApiBearerAuth('bearer') @ApiErrorResponses()
  assignLevelAdmin(@Param('id') id: string, @Body() dto: AssignAdminDto, @Req() req: any) {
    return this.assignLevelAdminUC.execute(id, dto, req?.user?.id);
  }
  @Delete('levels/:id') @ApiBearerAuth('bearer') @ApiErrorResponses()
  deleteLevel(@Param('id') id: string, @Req() req: any) { return this.deleteLevelUC.execute(id, req?.user?.id); }

  // ── Sınıf ──
  @Get('classrooms') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Sınıf listesi' }) @ApiErrorResponses()
  listClassrooms(@Query('branchId') branchId: string | undefined, @Req() req: any) {
    return this.listClassroomsUC.execute({ branchId }, req?.user?.id);
  }
  @Post('classrooms') @ApiBearerAuth('bearer') @ApiErrorResponses()
  createClassroom(@Body() dto: CreateClassroomDto, @Req() req: any) { return this.createClassroomUC.execute(dto, req?.user?.id); }
  @Post('classrooms/:id/students') @ApiBearerAuth('bearer') @ApiErrorResponses()
  assignStudents(@Param('id') id: string, @Body() dto: AssignStudentsDto, @Req() req: any) {
    return this.assignStudentsUC.execute(id, dto, req?.user?.id);
  }
  // Toplu öğrenci üretimi (her satır geçici parola) — kötüye-kullanım/otomasyon koruması.
  // 429 → http-exception.filter SUSPICIOUS_RATE_LIMIT audit'i otomatik yazar.
  @Throttle({ default: { limit: 10, ttl: 300000 } })
  @Post('classrooms/:id/students/bulk') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Excel: toplu öğrenci oluştur; { count, created:[{name,username,tempPassword}] }' }) @ApiErrorResponses()
  bulkStudents(@Param('id') id: string, @Body() dto: BulkStudentsDto, @Req() req: any) {
    return this.bulkStudentsUC.execute(id, dto, req?.user?.id);
  }
  @Post('classrooms/:id/students/remove') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Sınıftan öğrenci çıkar; { removed }' }) @ApiErrorResponses()
  removeStudents(@Param('id') id: string, @Body() dto: AssignStudentsDto, @Req() req: any) {
    return this.removeStudentsUC.execute(id, dto, req?.user?.id);
  }
  @Post('classrooms/:id/assign-admin') @ApiBearerAuth('bearer') @ApiErrorResponses()
  assignClassroomAdmin(@Param('id') id: string, @Body() dto: AssignAdminDto, @Req() req: any) {
    return this.assignClassroomAdminUC.execute(id, dto, req?.user?.id);
  }
  @Delete('classrooms/:id') @ApiBearerAuth('bearer') @ApiErrorResponses()
  deleteClassroom(@Param('id') id: string, @Req() req: any) { return this.deleteClassroomUC.execute(id, req?.user?.id); }
  @Patch('classrooms/:id/active') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Sınıfı pasife/aktife al; { id, isActive }' }) @ApiErrorResponses()
  setClassroomActive(@Param('id') id: string, @Body() body: { isActive: boolean }, @Req() req: any) { return this.setClassroomActiveUC.execute(id, { isActive: !!body?.isActive }, req?.user?.id); }

  // ── Zümre ──
  @Get('department-tree') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Zümre ağacı (Tüm Okul + Şube → Seviye)' }) @ApiErrorResponses()
  departmentTree(@Req() req: any) { return this.deptTreeUC.execute(req?.user?.id); }
  @Get('departments') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Zümre listesi' }) @ApiErrorResponses()
  listDepartments(@Req() req: any) { return this.listDeptsUC.execute(req?.user?.id); }
  @Post('departments') @ApiBearerAuth('bearer') @ApiErrorResponses()
  createDepartment(@Body() dto: CreateDepartmentDto, @Req() req: any) { return this.createDeptUC.execute(dto, req?.user?.id); }
  @Delete('departments/:id') @ApiBearerAuth('bearer') @ApiErrorResponses()
  deleteDepartment(@Param('id') id: string, @Req() req: any) { return this.deleteDeptUC.execute(id, req?.user?.id); }
  @Get('departments/:id/members') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Zümre öğretmen adayları + mevcut durum' }) @ApiErrorResponses()
  departmentMembers(@Param('id') id: string, @Req() req: any) { return this.deptMembersUC.execute(id, req?.user?.id); }
  @Post('departments/:id/members') @ApiBearerAuth('bearer') @ApiErrorResponses()
  assignMembers(@Param('id') id: string, @Body() dto: AssignMembersDto, @Req() req: any) {
    return this.assignMembersUC.execute(id, dto, req?.user?.id);
  }

  // ── Ders havuzu ──
  @Get('subjects') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Ders listesi' }) @ApiErrorResponses()
  listSubjects(@Req() req: any) { return this.listSubjectsUC.execute(req?.user?.id); }
  @Post('subjects') @ApiBearerAuth('bearer') @ApiErrorResponses()
  createSubject(@Body() dto: CreateSubjectDto, @Req() req: any) { return this.createSubjectUC.execute(dto, req?.user?.id); }
  @Delete('subjects/:id') @ApiBearerAuth('bearer') @ApiErrorResponses()
  deleteSubject(@Param('id') id: string, @Req() req: any) { return this.deleteSubjectUC.execute(id, req?.user?.id); }

  // ── Sınav formu referans listeleri (seviye + admin konu) ──
  @Get('periods') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Okul dönem listesi + güncel dönem' }) @ApiErrorResponses()
  listPeriods(@Req() req: any) { return this.listPeriodsUC.execute(req?.user?.id); }
  @Get('levels') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Okul seviye listesi (1-12)' }) @ApiErrorResponses()
  listLevels(@Req() req: any) { return this.listLevelsUC.execute(req?.user?.id); }
  @Get('topics') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Admin konu listesi' }) @ApiErrorResponses()
  listTopics(@Req() req: any) { return this.listTopicsUC.execute(req?.user?.id); }

  // ── Kullanıcılar ──
  @Get('users') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Okul kullanıcı listesi (cursor)' }) @ApiErrorResponses()
  listUsers(
    @Query('role') role: string | undefined,
    @Query('q') q: string | undefined,
    @Query('branchId') branchId: string | undefined,
    @Query('periodId') periodId: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() req: any,
  ) {
    return this.listUsersUC.execute({ role, q, branchId, periodId, cursor: cursor || null, limit: limit ? Number(limit) : undefined }, req?.user?.id);
  }
  // Geçici parolalı kullanıcı üretimi — credential üretim akışı throttle'lı.
  @Throttle({ default: { limit: 30, ttl: 300000 } })
  @Post('users') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Kullanıcı ekle; { username, tempPassword } döner' }) @ApiErrorResponses()
  createUser(@Body() dto: CreateSchoolUserDto, @Req() req: any) { return this.createUserUC.execute(dto, req?.user?.id); }
  @Patch('users/:id/active') @ApiBearerAuth('bearer') @ApiErrorResponses()
  setActive(@Param('id') id: string, @Body() dto: SetActiveDto, @Req() req: any) {
    return this.setActiveUC.execute(id, dto, req?.user?.id);
  }
  // Parola sıfırlama (yeni geçici parola) — brute-force/otomasyon koruması.
  @Throttle({ default: { limit: 20, ttl: 300000 } })
  @Post('users/:id/reset-password') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Şifre sıfırla; { username, tempPassword } döner' }) @ApiErrorResponses()
  resetPassword(@Param('id') id: string, @Req() req: any) { return this.resetPwUC.execute(id, req?.user?.id); }

  // ── Kota ──
  @Get('quota') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Kullanıcı + canlı sınav kotası' }) @ApiErrorResponses()
  quota(@Req() req: any) { return this.quotaUC.execute(req?.user?.id); }
  @Get('panel-stats') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Panel özet sayıları (şube/sınıf/öğretmen/öğrenci/zümre/ders/ödev)' }) @ApiErrorResponses()
  panelStats(@Req() req: any) { return this.panelStatsUC.execute(req?.user?.id); }
}
