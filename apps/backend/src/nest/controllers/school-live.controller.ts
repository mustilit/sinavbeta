import { Controller, Get, Post, Body, Param, Query, Req } from '@nestjs/common';
import { IsString, IsArray, ValidateNested, IsBoolean, IsOptional, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import {
  CreateSchoolLiveSessionUseCase,
  ListSchoolLiveSessionsUseCase,
  GetSchoolLiveHostStateUseCase,
  StartSchoolLiveSessionUseCase,
  AdvanceSchoolLiveSessionUseCase,
  PrevSchoolLiveSessionUseCase,
  ToggleSchoolLiveStatsUseCase,
  PingSchoolLiveSessionUseCase,
  EndSchoolLiveSessionUseCase,
  JoinSchoolLiveSessionUseCase,
  GetSchoolLiveParticipantStateUseCase,
  SubmitSchoolLiveAnswerUseCase,
} from '../../application/use-cases/school/SchoolLiveUseCases';

// content VEYA mediaUrl yeterli (market editörü ile aynı: görsel-yalnız soru/şık serbest).
class LiveOptionDto { @IsOptional() @IsString() @MaxLength(500) content?: string; @IsOptional() @IsString() @MaxLength(1000) mediaUrl?: string; @IsOptional() @IsBoolean() isCorrect?: boolean; }
class LiveQuestionDto { @IsOptional() @IsString() @MaxLength(2000) content?: string; @IsOptional() @IsString() @MaxLength(1000) mediaUrl?: string; @IsArray() @ValidateNested({ each: true }) @Type(() => LiveOptionDto) options!: LiveOptionDto[]; }
class CreateLiveDto { @IsString() @MaxLength(200) title!: string; @IsArray() @ValidateNested({ each: true }) @Type(() => LiveQuestionDto) questions!: LiveQuestionDto[]; }
class JoinDto { @IsString() @MaxLength(12) joinCode!: string; }
class AnswerDto { @IsString() questionId!: string; @IsString() optionId!: string; }

/** E-Sınıf — Okul canlı sınavı (öğretmen host + öğrenci katılım). JWT; rol use-case'te. */
@Controller('school/live')
@ApiTags('E-Sınıf · Canlı Sınav')
export class SchoolLiveController {
  private createUC = new CreateSchoolLiveSessionUseCase();
  private listUC = new ListSchoolLiveSessionsUseCase();
  private hostUC = new GetSchoolLiveHostStateUseCase();
  private startUC = new StartSchoolLiveSessionUseCase();
  private advanceUC = new AdvanceSchoolLiveSessionUseCase();
  private prevUC = new PrevSchoolLiveSessionUseCase();
  private toggleStatsUC = new ToggleSchoolLiveStatsUseCase();
  private pingUC = new PingSchoolLiveSessionUseCase();
  private endUC = new EndSchoolLiveSessionUseCase();
  private joinUC = new JoinSchoolLiveSessionUseCase();
  private stateUC = new GetSchoolLiveParticipantStateUseCase();
  private answerUC = new SubmitSchoolLiveAnswerUseCase();

  // Öğretmen
  @Get() @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Öğretmen canlı oturumları' }) @ApiErrorResponses()
  list(@Query('periodId') periodId: string | undefined, @Req() req: any) { return this.listUC.execute(req?.user?.id, { periodId }); }
  @Post() @ApiBearerAuth('bearer') @ApiErrorResponses()
  create(@Body() dto: CreateLiveDto, @Req() req: any) { return this.createUC.execute(dto, req?.user?.id); }
  @Get(':id/host') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Host durumu (polling)' }) @ApiErrorResponses()
  host(@Param('id') id: string, @Req() req: any) { return this.hostUC.execute(id, req?.user?.id); }
  @Post(':id/start') @ApiBearerAuth('bearer') @ApiErrorResponses()
  start(@Param('id') id: string, @Req() req: any) { return this.startUC.execute(id, req?.user?.id); }
  @Post(':id/advance') @ApiBearerAuth('bearer') @ApiErrorResponses()
  advance(@Param('id') id: string, @Req() req: any) { return this.advanceUC.execute(id, req?.user?.id); }
  @Post(':id/prev') @ApiBearerAuth('bearer') @ApiErrorResponses()
  prev(@Param('id') id: string, @Req() req: any) { return this.prevUC.execute(id, req?.user?.id); }
  @Post(':id/toggle-stats') @ApiBearerAuth('bearer') @ApiErrorResponses()
  toggleStats(@Param('id') id: string, @Req() req: any) { return this.toggleStatsUC.execute(id, req?.user?.id); }
  @Post(':id/end') @ApiBearerAuth('bearer') @ApiErrorResponses()
  end(@Param('id') id: string, @Req() req: any) { return this.endUC.execute(id, req?.user?.id); }

  // Öğrenci
  @Post('join') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Kodla katıl (aynı okul)' }) @ApiErrorResponses()
  join(@Body() dto: JoinDto, @Req() req: any) { return this.joinUC.execute(dto, req?.user?.id); }
  @Get(':id/state') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Öğrenci durumu (polling)' }) @ApiErrorResponses()
  state(@Param('id') id: string, @Req() req: any) { return this.stateUC.execute(id, req?.user?.id); }
  @Post(':id/ping') @ApiBearerAuth('bearer') @ApiErrorResponses()
  ping(@Param('id') id: string, @Req() req: any) { return this.pingUC.execute(id, req?.user?.id); }
  @Post(':id/answer') @ApiBearerAuth('bearer') @ApiErrorResponses()
  answer(@Param('id') id: string, @Body() dto: AnswerDto, @Req() req: any) { return this.answerUC.execute(id, dto, req?.user?.id); }
}
