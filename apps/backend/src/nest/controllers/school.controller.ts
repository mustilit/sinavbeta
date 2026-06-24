import { Controller, Get, Post, Patch, Body, Param, Query, Req } from '@nestjs/common';
import { IsString, IsOptional, IsInt, Min, Max, IsIn, IsArray, IsBoolean, MaxLength } from 'class-validator';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import {
  CreateBranchUseCase,
  ListBranchesUseCase,
  AssignBranchAdminUseCase,
  CreateClassroomUseCase,
  ListClassroomsUseCase,
  AssignStudentsToClassroomUseCase,
  CreateDepartmentUseCase,
  ListDepartmentsUseCase,
  AssignDepartmentMembersUseCase,
  GetSchoolQuotaUseCase,
} from '../../application/use-cases/school/SchoolOrgUseCases';
import {
  CreateSchoolUserUseCase,
  ListSchoolUsersUseCase,
  SetSchoolUserActiveUseCase,
  ResetSchoolUserPasswordUseCase,
} from '../../application/use-cases/school/SchoolUserUseCases';

class CreateBranchDto { @IsString() @MaxLength(80) name!: string; }
class AssignBranchAdminDto { @IsString() schoolUserId!: string; }
class CreateClassroomDto {
  @IsString() branchId!: string;
  @IsString() @MaxLength(40) name!: string;
  @IsInt() @Min(1) @Max(12) gradeLevel!: number;
}
class AssignStudentsDto { @IsArray() @IsString({ each: true }) schoolUserIds!: string[]; }
class CreateDepartmentDto {
  @IsString() @MaxLength(80) name!: string;
  @IsString() @MaxLength(60) subject!: string;
}
class AssignMembersDto {
  @IsArray() @IsString({ each: true }) schoolUserIds!: string[];
  @IsOptional() @IsString() headSchoolUserId?: string;
}
class CreateSchoolUserDto {
  @IsIn(['BRANCH_ADMIN', 'DEPT_HEAD', 'TEACHER', 'STUDENT']) schoolRole!: string;
  @IsOptional() @IsString() @MaxLength(60) firstName?: string;
  @IsOptional() @IsString() @MaxLength(60) lastName?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() classroomId?: string;
  @IsOptional() @IsString() departmentId?: string;
}
class SetActiveDto { @IsBoolean() isActive!: boolean; }

/** Okul Yöneticisi / Şube Yöneticisi — okul içi organizasyon + kullanıcı yönetimi.
 *  JWT zorunlu (global guard); okul rolü kontrolü use-case katmanında. */
@Controller('school')
@ApiTags('E-Sınıf · Okul')
export class SchoolController {
  private createBranchUC = new CreateBranchUseCase();
  private listBranchesUC = new ListBranchesUseCase();
  private assignBranchAdminUC = new AssignBranchAdminUseCase();
  private createClassroomUC = new CreateClassroomUseCase();
  private listClassroomsUC = new ListClassroomsUseCase();
  private assignStudentsUC = new AssignStudentsToClassroomUseCase();
  private createDeptUC = new CreateDepartmentUseCase();
  private listDeptsUC = new ListDepartmentsUseCase();
  private assignMembersUC = new AssignDepartmentMembersUseCase();
  private quotaUC = new GetSchoolQuotaUseCase();
  private createUserUC = new CreateSchoolUserUseCase();
  private listUsersUC = new ListSchoolUsersUseCase();
  private setActiveUC = new SetSchoolUserActiveUseCase();
  private resetPwUC = new ResetSchoolUserPasswordUseCase();

  // ── Şube ──
  @Get('branches') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Şube listesi' }) @ApiErrorResponses()
  listBranches(@Req() req: any) { return this.listBranchesUC.execute(req?.user?.id); }
  @Post('branches') @ApiBearerAuth('bearer') @ApiErrorResponses()
  createBranch(@Body() dto: CreateBranchDto, @Req() req: any) { return this.createBranchUC.execute(dto, req?.user?.id); }
  @Post('branches/:id/assign-admin') @ApiBearerAuth('bearer') @ApiErrorResponses()
  assignBranchAdmin(@Param('id') id: string, @Body() dto: AssignBranchAdminDto, @Req() req: any) {
    return this.assignBranchAdminUC.execute(id, dto, req?.user?.id);
  }

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

  // ── Zümre ──
  @Get('departments') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Zümre listesi' }) @ApiErrorResponses()
  listDepartments(@Req() req: any) { return this.listDeptsUC.execute(req?.user?.id); }
  @Post('departments') @ApiBearerAuth('bearer') @ApiErrorResponses()
  createDepartment(@Body() dto: CreateDepartmentDto, @Req() req: any) { return this.createDeptUC.execute(dto, req?.user?.id); }
  @Post('departments/:id/members') @ApiBearerAuth('bearer') @ApiErrorResponses()
  assignMembers(@Param('id') id: string, @Body() dto: AssignMembersDto, @Req() req: any) {
    return this.assignMembersUC.execute(id, dto, req?.user?.id);
  }

  // ── Kullanıcılar ──
  @Get('users') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Okul kullanıcı listesi (cursor)' }) @ApiErrorResponses()
  listUsers(
    @Query('role') role: string | undefined,
    @Query('q') q: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() req: any,
  ) {
    return this.listUsersUC.execute({ role, q, cursor: cursor || null, limit: limit ? Number(limit) : undefined }, req?.user?.id);
  }
  @Post('users') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Kullanıcı ekle; { username, tempPassword } döner' }) @ApiErrorResponses()
  createUser(@Body() dto: CreateSchoolUserDto, @Req() req: any) { return this.createUserUC.execute(dto, req?.user?.id); }
  @Patch('users/:id/active') @ApiBearerAuth('bearer') @ApiErrorResponses()
  setActive(@Param('id') id: string, @Body() dto: SetActiveDto, @Req() req: any) {
    return this.setActiveUC.execute(id, dto, req?.user?.id);
  }
  @Post('users/:id/reset-password') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Şifre sıfırla; { username, tempPassword } döner' }) @ApiErrorResponses()
  resetPassword(@Param('id') id: string, @Req() req: any) { return this.resetPwUC.execute(id, req?.user?.id); }

  // ── Kota ──
  @Get('quota') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Kullanıcı + canlı sınav kotası' }) @ApiErrorResponses()
  quota(@Req() req: any) { return this.quotaUC.execute(req?.user?.id); }
}
