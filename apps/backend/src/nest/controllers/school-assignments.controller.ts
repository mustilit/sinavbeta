import { Controller, Get, Post, Patch, Body, Param, Query, Req } from '@nestjs/common';
import { IsString, IsOptional, IsArray, IsBoolean, IsIn, IsISO8601, MaxLength } from 'class-validator';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import {
  CreateAssignmentUseCase,
  ListAssignmentsUseCase,
  GetAssignmentReportUseCase,
  ReleaseAssignmentResultsUseCase,
  CloseAssignmentUseCase,
} from '../../application/use-cases/school/SchoolAssignmentUseCases';

class CreateAssignmentDto {
  @IsString() examId!: string;
  @IsArray() @IsString({ each: true }) classroomIds!: string[];
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsISO8601() availableFrom!: string;
  @IsISO8601() dueDate!: string;
  @IsOptional() @IsBoolean() allowLateSubmit?: boolean;
  @IsOptional() @IsIn(['SUBMIT', 'DUE_DATE', 'TEACHER_RELEASE']) showResultAfter?: string;
  @IsOptional() @IsBoolean() shuffleQuestions?: boolean;
  @IsOptional() @IsBoolean() shuffleOptions?: boolean;
}
class CloseDto { @IsIn(['CLOSED', 'ACTIVE']) status!: 'CLOSED' | 'ACTIVE'; }

/** E-Sınıf — Öğretmen ödev atama + rapor. JWT; okul rolü use-case'te. */
@Controller('school/assignments')
@ApiTags('E-Sınıf · Ödev')
export class SchoolAssignmentsController {
  private createUC = new CreateAssignmentUseCase();
  private listUC = new ListAssignmentsUseCase();
  private reportUC = new GetAssignmentReportUseCase();
  private releaseUC = new ReleaseAssignmentResultsUseCase();
  private closeUC = new CloseAssignmentUseCase();

  @Get() @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Ödev listesi' }) @ApiErrorResponses()
  list(@Query('classroomId') classroomId: string | undefined, @Req() req: any) { return this.listUC.execute({ classroomId }, req?.user?.id); }

  @Post() @ApiBearerAuth('bearer') @ApiErrorResponses()
  create(@Body() dto: CreateAssignmentDto, @Req() req: any) { return this.createUC.execute(dto, req?.user?.id); }

  @Get(':id/report') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Ödev raporu + teslimler' }) @ApiErrorResponses()
  report(@Param('id') id: string, @Req() req: any) { return this.reportUC.execute(id, req?.user?.id); }

  @Post(':id/release-results') @ApiBearerAuth('bearer') @ApiErrorResponses()
  release(@Param('id') id: string, @Req() req: any) { return this.releaseUC.execute(id, req?.user?.id); }

  @Patch(':id/status') @ApiBearerAuth('bearer') @ApiErrorResponses()
  close(@Param('id') id: string, @Body() dto: CloseDto, @Req() req: any) { return this.closeUC.execute(id, dto, req?.user?.id); }
}
