import { Controller, Get, Post, Put, Body, Param, Query, Req } from '@nestjs/common';
import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import {
  ListStudentAssignmentsUseCase,
  GetStudentAssignmentUseCase,
  StartSubmissionUseCase,
  SaveAnswerUseCase,
  SubmitAssignmentUseCase,
  GetStudentResultUseCase,
  GetStudentReportUseCase,
} from '../../application/use-cases/school/SchoolStudentUseCases';

class SaveAnswerDto {
  @IsString() questionId!: string;
  @IsOptional() @IsString() selectedOptionId?: string | null;
  @IsOptional() @IsString() @MaxLength(8000) textAnswer?: string | null;
}

/** E-Sınıf — Öğrenci ödev çözme. JWT; STUDENT rolü use-case'te. */
@Controller('student/assignments')
@ApiTags('E-Sınıf · Öğrenci')
export class SchoolStudentController {
  private listUC = new ListStudentAssignmentsUseCase();
  private getUC = new GetStudentAssignmentUseCase();
  private startUC = new StartSubmissionUseCase();
  private saveUC = new SaveAnswerUseCase();
  private submitUC = new SubmitAssignmentUseCase();
  private resultUC = new GetStudentResultUseCase();

  @Get() @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Öğrencinin ödevleri' }) @ApiErrorResponses()
  list(@Query('filter') filter: 'pending' | 'submitted' | 'all' | undefined, @Req() req: any) { return this.listUC.execute({ filter }, req?.user?.id); }

  @Get(':id') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Ödev çözme ekranı (doğru cevap sızdırmaz)' }) @ApiErrorResponses()
  get(@Param('id') id: string, @Req() req: any) { return this.getUC.execute(id, req?.user?.id); }

  @Post(':id/start') @ApiBearerAuth('bearer') @ApiErrorResponses()
  start(@Param('id') id: string, @Req() req: any) { return this.startUC.execute(id, req?.user?.id); }

  @Put(':id/answer') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Cevap kaydet (autosave, idempotent upsert)' }) @ApiErrorResponses()
  answer(@Param('id') id: string, @Body() dto: SaveAnswerDto, @Req() req: any) { return this.saveUC.execute(id, dto, req?.user?.id); }

  @Post(':id/submit') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Teslim et (TEST/TUNNEL otomatik puanlanır)' }) @ApiErrorResponses()
  submit(@Param('id') id: string, @Req() req: any) { return this.submitUC.execute(id, req?.user?.id); }

  @Get(':id/result') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Sonuç (showResultAfter kuralına göre)' }) @ApiErrorResponses()
  result(@Param('id') id: string, @Req() req: any) { return this.resultUC.execute(id, req?.user?.id); }
}

/** E-Sınıf — Öğrenci kendi raporu (ders + konu + takvim). */
@Controller('student/report')
@ApiTags('E-Sınıf · Öğrenci')
export class SchoolStudentReportController {
  private reportUC = new GetStudentReportUseCase();

  @Get() @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Öğrencinin ders/konu/takvim raporu' }) @ApiErrorResponses()
  report(@Query('from') from: string | undefined, @Query('to') to: string | undefined, @Req() req: any) {
    return this.reportUC.execute(req?.user?.id, { from, to });
  }
}
