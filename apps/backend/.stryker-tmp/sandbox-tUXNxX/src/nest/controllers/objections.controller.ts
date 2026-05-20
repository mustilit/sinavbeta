// @ts-nocheck
import { Controller, Post, Body, Req, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiCreatedResponse, ApiBadRequestResponse, ApiForbiddenResponse, ApiConflictResponse, ApiNotFoundResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { CreateObjectionDto } from './dto/create-objection.dto';
import { CreateObjectionUseCase } from '../../application/use-cases/objection/CreateObjectionUseCase';

/**
 * Adayın soru itirazı oluşturmasını sağlar.
 * İtiraz yalnızca CANDIDATE rolündeki kullanıcılara açıktır ve
 * deneme sahibi olma kontrolü use-case tarafından yapılır.
 */
@Controller('objections')
@ApiTags('objections')
export class ObjectionsController {
  constructor(@Inject(CreateObjectionUseCase) private readonly createObjection: CreateObjectionUseCase) {}

  @Post()
  @Roles('CANDIDATE')
  @ApiBearerAuth('bearer')
  @ApiCreatedResponse({ description: 'Objection created' })
  @ApiBadRequestResponse({ description: 'Invalid UUID or reason too short' })
  @ApiForbiddenResponse({ description: 'Not the attempt owner' })
  @ApiConflictResponse({ description: 'QUESTION_NOT_IN_TEST or OBJECTION_ALREADY_EXISTS' })
  @ApiNotFoundResponse({ description: 'Attempt or question not found' })
  async create(@Body() body: CreateObjectionDto, @Req() req: any) {
    const actorId = (req as any).user?.id;
    return this.createObjection.execute(
      { attemptId: body.attemptId, questionId: body.questionId, reason: body.reason },
      actorId,
    );
  }
}
