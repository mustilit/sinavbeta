import { Controller, Get, Post, Body, Param, Req } from '@nestjs/common';
import { IsString } from 'class-validator';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import {
  StartSchoolTunnelUseCase,
  GetSchoolTunnelStateUseCase,
  SubmitSchoolTunnelAnswerUseCase,
} from '../../application/use-cases/school/SchoolTunnelAttemptUseCases';

class AnswerDto { @IsString() optionId!: string; }

/** E-Sınıf — öğrenci tünel adaptif çözme. JWT; rol (STUDENT) use-case'te. */
@Controller('school/tunnel')
@ApiTags('E-Sınıf · Tünel Çözme')
export class SchoolTunnelController {
  private startUC = new StartSchoolTunnelUseCase();
  private stateUC = new GetSchoolTunnelStateUseCase();
  private answerUC = new SubmitSchoolTunnelAnswerUseCase();

  @Post(':examId/start') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Tüneli başlat/sürdür' }) @ApiErrorResponses()
  start(@Param('examId') examId: string, @Req() req: any) { return this.startUC.execute(examId, req?.user?.id); }

  @Get(':examId/state') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Tünel durumu (polling/yenileme)' }) @ApiErrorResponses()
  state(@Param('examId') examId: string, @Req() req: any) { return this.stateUC.execute(examId, req?.user?.id); }

  @Post(':examId/answer') @ApiBearerAuth('bearer') @ApiErrorResponses()
  answer(@Param('examId') examId: string, @Body() dto: AnswerDto, @Req() req: any) { return this.answerUC.execute(examId, dto.optionId, req?.user?.id); }
}
