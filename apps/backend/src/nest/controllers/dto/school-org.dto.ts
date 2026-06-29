import { Type } from 'class-transformer';
import { IsString, IsOptional, IsInt, Min, Max, IsIn, IsArray, IsBoolean, MaxLength, ValidateNested, ArrayMaxSize } from 'class-validator';

/**
 * E-Sınıf — Okul organizasyonu + kullanıcı yönetimi DTO'ları (school.controller).
 * Marketplace dto/ klasör konvansiyonuna uyumlu: doğrulama controller'dan ayrı.
 */
export class CreateBranchDto { @IsString() @MaxLength(80) name!: string; }
export class AssignAdminDto { @IsString() schoolUserId!: string; }
export class CreateLevelDto {
  @IsString() branchId!: string;
  @IsInt() @Min(1) @Max(12) gradeLevel!: number;
}
export class CreateClassroomDto {
  @IsString() levelId!: string;
  @IsString() @MaxLength(40) name!: string;
}
export class AssignStudentsDto { @IsArray() @IsString({ each: true }) schoolUserIds!: string[]; }
export class BulkStudentRowDto {
  @IsOptional() @IsString() @MaxLength(60) firstName?: string;
  @IsOptional() @IsString() @MaxLength(60) lastName?: string;
  @IsOptional() @IsString() @MaxLength(40) studentNo?: string;
}
export class BulkStudentsDto {
  @IsArray() @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => BulkStudentRowDto)
  students!: BulkStudentRowDto[];
}
export class CreateDepartmentDto {
  @IsString() @MaxLength(80) name!: string;
  @IsString() @MaxLength(60) subject!: string;
  @IsOptional() @IsString() levelId?: string;   // seviyeye özel zümre
  @IsOptional() @IsString() branchId?: string;  // şube geneli zümre (levelId yoksa)
}
export class CreateSubjectDto { @IsString() @MaxLength(60) name!: string; }
export class AssignMembersDto {
  @IsArray() @IsString({ each: true }) schoolUserIds!: string[];
  @IsOptional() @IsString() headSchoolUserId?: string;
}
export class CreateSchoolUserDto {
  @IsIn(['BRANCH_ADMIN', 'DEPT_HEAD', 'TEACHER', 'STUDENT']) schoolRole!: string;
  @IsOptional() @IsString() @MaxLength(60) firstName?: string;
  @IsOptional() @IsString() @MaxLength(60) lastName?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() classroomId?: string;
  @IsOptional() @IsString() departmentId?: string;
}
export class SetActiveDto { @IsBoolean() isActive!: boolean; }
