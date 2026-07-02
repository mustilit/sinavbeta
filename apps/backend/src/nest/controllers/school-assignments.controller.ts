import { Controller, Get, Post, Patch, Body, Param, Query, Req } from '@nestjs/common';
import { IsString, IsOptional, IsArray, IsBoolean, IsIn, IsISO8601, MaxLength, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import {
  CreateAssignmentUseCase,
  ListAssignmentsUseCase,
  GetAssignOptionsUseCase,
  GetAssignmentReportUseCase,
  ReleaseAssignmentResultsUseCase,
  CloseAssignmentUseCase,
  MarkOfflineDoneUseCase,
} from '../../application/use-cases/school/SchoolAssignmentUseCases';

class CreateAssignmentDto {
  @IsOptional() @IsString() examId?: string; // sistem dışı ödevde boş
  @IsArray() @IsString({ each: true }) classroomIds!: string[];
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsISO8601() availableFrom!: string;
  @IsISO8601() dueDate!: string;
  @IsOptional() @IsBoolean() allowLateSubmit?: boolean;
  @IsOptional() @IsIn(['SUBMIT', 'DUE_DATE', 'TEACHER_RELEASE']) showResultAfter?: string;
  @IsOptional() @IsBoolean() shuffleQuestions?: boolean;
  @IsOptional() @IsBoolean() shuffleOptions?: boolean;
  // Sistem dışı ödev: ders + serbest metin
  @IsOptional() @IsBoolean() isOffline?: boolean;
  @IsOptional() @IsString() offlineSubjectId?: string;
  @IsOptional() @IsString() @MaxLength(4000) offlineDescription?: string;
}
class CloseDto { @IsIn(['CLOSED', 'ACTIVE']) status!: 'CLOSED' | 'ACTIVE'; }
class OfflineDoneDto { @IsBoolean() done!: boolean; }
class ListAssignmentsQueryDto {
  @IsOptional() @IsString() classroomId?: string;
  @IsOptional() @IsString() periodId?: string;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsIn(['SCHEDULED', 'ACTIVE', 'CLOSED']) status?: 'SCHEDULED' | 'ACTIVE' | 'CLOSED';
  @IsOptional() @IsIn(['exam', 'offline']) kind?: 'exam' | 'offline';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

/** E-Sınıf — Öğretmen ödev atama + rapor. JWT; okul rolü use-case'te. */
@Controller('school/assignments')
@ApiTags('E-Sınıf · Ödev')
export class SchoolAssignmentsController {
  private createUC = new CreateAssignmentUseCase();
  private listUC = new ListAssignmentsUseCase();
  private optionsUC = new GetAssignOptionsUseCase();
  private reportUC = new GetAssignmentReportUseCase();
  private releaseUC = new ReleaseAssignmentResultsUseCase();
  private closeUC = new CloseAssignmentUseCase();
  private offlineDoneUC = new MarkOfflineDoneUseCase();

  @Get() @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Ödev listesi (sayfalı + durum/tür/arama filtreleri)' }) @ApiErrorResponses()
  list(@Query() q: ListAssignmentsQueryDto, @Req() req: any) { return this.listUC.execute(q, req?.user?.id); }

  @Get('options') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Atama seçenekleri (hiyerarşik seviye + ders)' }) @ApiErrorResponses()
  options(@Req() req: any) { return this.optionsUC.execute(req?.user?.id); }

  @Post() @ApiBearerAuth('bearer') @ApiErrorResponses()
  create(@Body() dto: CreateAssignmentDto, @Req() req: any) { return this.createUC.execute(dto, req?.user?.id); }

  @Get(':id/report') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Ödev raporu + teslimler' }) @ApiErrorResponses()
  report(@Param('id') id: string, @Req() req: any) { return this.reportUC.execute(id, req?.user?.id); }

  @Post(':id/release-results') @ApiBearerAuth('bearer') @ApiErrorResponses()
  release(@Param('id') id: string, @Req() req: any) { return this.releaseUC.execute(id, req?.user?.id); }

  @Patch(':id/status') @ApiBearerAuth('bearer') @ApiErrorResponses()
  close(@Param('id') id: string, @Body() dto: CloseDto, @Req() req: any) { return this.closeUC.execute(id, dto, req?.user?.id); }

  @Patch(':id/offline-done') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Sistem dışı ödevi yapıldı / geri al işaretle' }) @ApiErrorResponses()
  offlineDone(@Param('id') id: string, @Body() dto: OfflineDoneDto, @Req() req: any) { return this.offlineDoneUC.execute(id, dto, req?.user?.id); }
}
