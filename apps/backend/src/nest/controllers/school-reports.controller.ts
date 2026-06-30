import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsInt, Min, Max, IsISO8601, IsIn } from 'class-validator';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import {
  GetSchoolReportUseCase,
  GetBranchReportUseCase,
  GetFilteredReportUseCase,
  GetClassroomReportUseCase,
  GetStudentComplianceListUseCase,
  GetStudentAssignmentDetailUseCase,
} from '../../application/use-cases/school/SchoolReportUseCases';
import { GetSchoolComplianceUseCase, ListSchoolComplianceUseCase, type ComplianceBucket } from '../../application/use-cases/school/SchoolComplianceUseCases';

const COMPLIANCE_BUCKETS = ['onTime', 'late', 'notSubmitted', 'withinTime', 'overflow'] as const;
class ComplianceListDto {
  @IsIn(COMPLIANCE_BUCKETS as unknown as string[]) bucket!: ComplianceBucket;
}

class ReportFilterDto {
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) gradeLevel?: number;
  @IsOptional() @IsString() classroomId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() periodId?: string;
  @IsOptional() @IsString() subject?: string; // ders (exam.subject) filtresi
}

class ClassroomReportFilterDto {
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() subject?: string; // ders (exam.subject) filtresi
}

/** E-Sınıf — Raporlar (okul/şube yöneticisi). JWT; okul rolü use-case'te. */
@Controller('school/reports')
@ApiTags('E-Sınıf · Raporlar')
export class SchoolReportsController {
  private overviewUC = new GetSchoolReportUseCase();
  private branchUC = new GetBranchReportUseCase();
  private filteredUC = new GetFilteredReportUseCase();
  private classroomUC = new GetClassroomReportUseCase();
  private complianceUC = new GetSchoolComplianceUseCase();
  private complianceListUC = new ListSchoolComplianceUseCase();
  private studentsUC = new GetStudentComplianceListUseCase();
  private studentDetailUC = new GetStudentAssignmentDetailUseCase();

  @Get('overview') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Okul geneli rapor (şube + zümre)' }) @ApiErrorResponses()
  overview(@Req() req: any) { return this.overviewUC.execute(req?.user?.id); }

  @Get('breakdown') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Filtreli kırılım (şube/seviye/sınıf + highlights)' }) @ApiErrorResponses()
  breakdown(@Query() q: ReportFilterDto, @Req() req: any) { return this.filteredUC.execute(q, req?.user?.id); }

  @Get('students') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Öğrenci bazlı teslim durumu listesi (no/ad/sınıf/seviye + 3 durum), filtreli' }) @ApiErrorResponses()
  students(@Query() q: ReportFilterDto, @Req() req: any) { return this.studentsUC.execute(q, req?.user?.id); }

  @Get('students/:studentId') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Tek öğrencinin ödev-ödev başarım/teslim detayı (pop-up)' }) @ApiErrorResponses()
  studentDetail(@Param('studentId') studentId: string, @Query() q: ReportFilterDto, @Req() req: any) {
    return this.studentDetailUC.execute({ studentId, from: q.from, to: q.to, subject: q.subject, departmentId: q.departmentId, periodId: q.periodId }, req?.user?.id);
  }

  @Get('classroom/:id') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Tek sınıf detay raporu' }) @ApiErrorResponses()
  classroom(@Param('id') id: string, @Query() q: ClassroomReportFilterDto, @Req() req: any) {
    return this.classroomUC.execute(id, q, req?.user?.id);
  }

  @Get('branch/:id') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Şube raporu (sınıf performansı)' }) @ApiErrorResponses()
  branch(@Param('id') id: string, @Req() req: any) { return this.branchUC.execute(id, req?.user?.id); }

  // Ödev uyumu — rol-bilinçli (öğrenci/sınıf öğretmeni/zümre başkanı/seviye/şube/okul).
  @Get('compliance') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Teslim durumu + süre kontrolü sayıları (hiyerarşik)' }) @ApiErrorResponses()
  compliance(@Req() req: any) { return this.complianceUC.execute(req?.user?.id); }

  @Get('compliance/list') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Bir uyum kategorisi icin drill-down liste' }) @ApiErrorResponses()
  complianceList(@Query() q: ComplianceListDto, @Req() req: any) { return this.complianceListUC.execute(q.bucket, req?.user?.id); }
}
