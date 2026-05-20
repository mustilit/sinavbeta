// @ts-nocheck
import { Controller, Post, Param, Body, Req, Get, Inject } from '@nestjs/common';
import { SubmitAnswerUseCase } from '../../../application/use-cases/attempt/SubmitAnswerUseCase';
import { SubmitAttemptUseCase } from '../../../application/use-cases/attempt/SubmitAttemptUseCase';
import { GetQuestionSolutionUseCase } from '../../../application/use-cases/question/GetQuestionSolutionUseCase';
import { GetAttemptStateUseCase } from '../../../application/use-cases/attempt/GetAttemptStateUseCase';
import { TimeoutAttemptUseCase } from '../../../application/use-cases/attempt/TimeoutAttemptUseCase';
import { GetAttemptResultUseCase } from '../../../application/use-cases/attempt/GetAttemptResultUseCase';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiConflictResponse, ApiUnauthorizedResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { AttemptStateResponseDto } from '../../controllers/dto/attempt-state.response.dto';
import { AttemptResultResponseDto } from '../../controllers/dto/attempt-result.response.dto';
import { QuestionSolutionResponseDto } from '../../controllers/dto/question-solution.response.dto';
import { ErrorEnvelopeSchema } from '../../swagger/error-envelope';
import { Public } from '../../decorators/public.decorator';
import { Roles } from '../../decorators/roles.decorator';
import { Request } from 'express';

@Controller('attempts')
@ApiTags('attempts')
@ApiBearerAuth('bearer')
export class AttemptsController {
  constructor(
    private readonly submitAnswerUC: SubmitAnswerUseCase,
    private readonly submitAttemptUC: SubmitAttemptUseCase,
    private readonly getSolutionUC: GetQuestionSolutionUseCase,
    private readonly getStateUC?: GetAttemptStateUseCase,
    @Inject('TIMEOUT_USECASE') private readonly timeoutUC?: TimeoutAttemptUseCase,
    private readonly getResultUC?: GetAttemptResultUseCase,
  ) {}

  @Post(':attemptId/answers')
  @Roles('CANDIDATE')
  async submitAnswer(@Param('attemptId') attemptId: string, @Body() body: { questionId: string; optionId?: string }, @Req() req: Request) {
    const actorId = (req as any).user?.id;
    return this.submitAnswerUC.execute(attemptId, body.questionId, body.optionId ?? undefined, actorId as any);
  }

  @Post(':attemptId/finish')
  @Roles('CANDIDATE')
  async finish(@Param('attemptId') attemptId: string, @Req() req: Request) {
    const actorId = (req as any).user?.id;
    // finalize using stored answers
    return this.submitAttemptUC.execute(attemptId, undefined, actorId);
  }

  @Get(':attemptId/questions/:questionId/solution')
  @Roles('CANDIDATE')
  @ApiOkResponse({ type: QuestionSolutionResponseDto })
  @ApiConflictResponse({ schema: ErrorEnvelopeSchema })
  @ApiUnauthorizedResponse({ schema: ErrorEnvelopeSchema })
  @ApiForbiddenResponse({ schema: ErrorEnvelopeSchema })
  async getQuestionSolution(@Param('attemptId') attemptId: string, @Param('questionId') questionId: string, @Req() req: Request) {
    const candidateId = (req as any).user?.id;
    return this.getSolutionUC.execute(attemptId, questionId, candidateId);
  }

  @Get(':attemptId/state')
  @Roles('CANDIDATE')
  @ApiOkResponse({ type: AttemptStateResponseDto })
  @ApiUnauthorizedResponse({ schema: ErrorEnvelopeSchema })
  @ApiForbiddenResponse({ schema: ErrorEnvelopeSchema })
  async getState(@Param('attemptId') attemptId: string, @Req() req: Request) {
    const candidateId = (req as any).user?.id;
    return this.getStateUC!.execute(attemptId, candidateId);
  }

  @Post(':attemptId/timeout')
  @Roles('CANDIDATE')
  @ApiOkResponse({ type: AttemptStateResponseDto })
  @ApiConflictResponse({ schema: ErrorEnvelopeSchema })
  @ApiUnauthorizedResponse({ schema: ErrorEnvelopeSchema })
  @ApiForbiddenResponse({ schema: ErrorEnvelopeSchema })
  async timeout(@Param('attemptId') attemptId: string, @Req() req: Request) {
    const candidateId = (req as any).user?.id;
    // controller-level check not required, use-case validates time remaining
    return this.timeoutUC!.execute(attemptId, candidateId);
  }

  @Get(':attemptId/result')
  @Roles('CANDIDATE')
  @ApiOkResponse({ type: AttemptResultResponseDto })
  @ApiConflictResponse({ schema: ErrorEnvelopeSchema })
  @ApiUnauthorizedResponse({ schema: ErrorEnvelopeSchema })
  @ApiForbiddenResponse({ schema: ErrorEnvelopeSchema })
  async getResult(@Param('attemptId') attemptId: string, @Req() req: Request) {
    const candidateId = (req as any).user?.id;
    return this.getResultUC!.execute(attemptId, candidateId);
  }
}

