import { Controller, Get, Param, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import { GetSchoolReportUseCase, GetBranchReportUseCase } from '../../application/use-cases/school/SchoolReportUseCases';

/** E-Sınıf — Raporlar (okul/şube yöneticisi). JWT; okul rolü use-case'te. */
@Controller('school/reports')
@ApiTags('E-Sınıf · Raporlar')
export class SchoolReportsController {
  private overviewUC = new GetSchoolReportUseCase();
  private branchUC = new GetBranchReportUseCase();

  @Get('overview') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Okul geneli rapor (şube + zümre)' }) @ApiErrorResponses()
  overview(@Req() req: any) { return this.overviewUC.execute(req?.user?.id); }

  @Get('branch/:id') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Şube raporu (sınıf performansı)' }) @ApiErrorResponses()
  branch(@Param('id') id: string, @Req() req: any) { return this.branchUC.execute(id, req?.user?.id); }
}
