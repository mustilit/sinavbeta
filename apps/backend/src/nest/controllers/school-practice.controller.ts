import { Controller, Get, Post, Put, Body, Param, Query, Req } from '@nestjs/common';
import { IsString, IsOptional, MaxLength, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import {
  ListStudentLevelExamsUseCase,
  GetPracticeSolveUseCase,
  StartPracticeUseCase,
  SavePracticeAnswerUseCase,
  SubmitPracticeUseCase,
  GetPracticeResultUseCase,
} from '../../application/use-cases/school/SchoolPracticeUseCases';

class SavePracticeAnswerDto {
  @IsString() questionId!: string;
  @IsOptional() @IsString() selectedOptionId?: string | null;
  @IsOptional() @IsString() @MaxLength(8000) textAnswer?: string | null;
}

/** Keşfet listesi — tür sekmesi + ders + arama + sayfalama (server-side). */
class ListPracticeExamsDto {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsIn(['TEST', 'TUNNEL', 'WRITTEN']) examType?: string;
  @IsOptional() @IsString() @MaxLength(120) subject?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize?: number;
}

/**
 * E-Sınıf — Serbest alıştırma (Keşfet). JWT; STUDENT rolü use-case'te.
 * Ödev akışından bağımsız, exam-scoped. Liste → çöz → başlat → cevap → teslim → sonuç.
 */
@Controller('student/practice')
@ApiTags('E-Sınıf · Öğrenci')
export class SchoolPracticeController {
  private listUC = new ListStudentLevelExamsUseCase();
  private getUC = new GetPracticeSolveUseCase();
  private startUC = new StartPracticeUseCase();
  private saveUC = new SavePracticeAnswerUseCase();
  private submitUC = new SubmitPracticeUseCase();
  private resultUC = new GetPracticeResultUseCase();

  @Get('exams') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Seviyedeki sınavlar — tür/ders/arama + sayfalama (facet sayıları + toplam ile)' }) @ApiErrorResponses()
  listExams(@Query() q: ListPracticeExamsDto, @Req() req: any) { return this.listUC.execute(q, req?.user?.id); }

  @Get(':examId') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Alıştırma çözme ekranı (doğru cevap sızdırmaz)' }) @ApiErrorResponses()
  get(@Param('examId') examId: string, @Req() req: any) { return this.getUC.execute(examId, req?.user?.id); }

  @Post(':examId/start') @ApiBearerAuth('bearer') @ApiErrorResponses()
  start(@Param('examId') examId: string, @Req() req: any) { return this.startUC.execute(examId, req?.user?.id); }

  @Put(':examId/answer') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Cevap kaydet (autosave, idempotent upsert)' }) @ApiErrorResponses()
  answer(@Param('examId') examId: string, @Body() dto: SavePracticeAnswerDto, @Req() req: any) { return this.saveUC.execute(examId, dto, req?.user?.id); }

  @Post(':examId/submit') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Teslim et (TEST otomatik puanlanır, WRITTEN öz-değerlendirme)' }) @ApiErrorResponses()
  submit(@Param('examId') examId: string, @Req() req: any) { return this.submitUC.execute(examId, req?.user?.id); }

  @Get(':examId/result') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Alıştırma sonucu (teslimden sonra)' }) @ApiErrorResponses()
  result(@Param('examId') examId: string, @Req() req: any) { return this.resultUC.execute(examId, req?.user?.id); }
}
