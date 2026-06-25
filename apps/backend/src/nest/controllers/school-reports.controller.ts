import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsInt, Min, Max, IsISO8601 } from 'class-validator';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import {
  GetSchoolReportUseCase,
  GetBranchReportUseCase,
  GetFilteredReportUseCase,
  GetClassroomReportUseCase,
} from '../../application/use-cases/school/SchoolReportUseCases';

class ReportFilterDto {
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) gradeLevel?: number;
  @IsOptional() @IsString() classroomId?: string;
  @IsOptional() @IsString() departmentId?: string;
}

class ClassroomReportFilterDto {
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsString() departmentId?: string;
}

/** E-Sınıf — Raporlar (okul/şube yöneticisi). JWT; okul rolü use-case'te. */
@Controller('school/reports')
@ApiTags('E-Sınıf · Raporlar')
export class SchoolReportsController {
  private overviewUC = new GetSchoolReportUseCase();
  private branchUC = new GetBranchReportUseCase();
  private filteredUC = new GetFilteredReportUseCase();
  private classroomUC = new GetClassroomReportUseCase();

  @Get('overview') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Okul geneli rapor (şube + zümre)' }) @ApiErrorResponses()
  overview(@Req() req: any) { return this.overviewUC.execute(req?.user?.id); }

  @Get('breakdown') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Filtreli kırılım (şube/seviye/sınıf + highlights)' }) @ApiErrorResponses()
  breakdown(@Query() q: ReportFilterDto, @Req() req: any) { return this.filteredUC.execute(q, req?.user?.id); }

  @Get('classroom/:id') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Tek sınıf detay raporu' }) @ApiErrorResponses()
  classroom(@Param('id') id: string, @Query() q: ClassroomReportFilterDto, @Req() req: any) {
    return this.classroomUC.execute(id, q, req?.user?.id);
  }

  @Get('branch/:id') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Şube raporu (sınıf performansı)' }) @ApiErrorResponses()
  branch(@Param('id') id: string, @Req() req: any) { return this.branchUC.execute(id, req?.user?.id); }
}
