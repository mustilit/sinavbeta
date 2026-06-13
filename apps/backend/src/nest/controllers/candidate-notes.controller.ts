import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiCreatedResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { CreateCandidateNoteDto } from './dto/create-candidate-note.dto';
import { UpdateCandidateNoteDto } from './dto/update-candidate-note.dto';
import { ListCandidateNotesQueryDto } from './dto/list-candidate-notes.dto';
import { CreateCandidateNoteUseCase } from '../../application/use-cases/note/CreateCandidateNoteUseCase';
import { ListCandidateNotesUseCase } from '../../application/use-cases/note/ListCandidateNotesUseCase';
import { GetCandidateNoteFacetsUseCase } from '../../application/use-cases/note/GetCandidateNoteFacetsUseCase';
import { UpdateCandidateNoteUseCase } from '../../application/use-cases/note/UpdateCandidateNoteUseCase';
import { DeleteCandidateNoteUseCase } from '../../application/use-cases/note/DeleteCandidateNoteUseCase';

/**
 * Aday kişisel notları. Tüm endpoint'ler CANDIDATE rolüne özel; sahiplik
 * (candidateId === req.user.id) use-case katmanında zorlanır.
 */
@Controller('candidate-notes')
@ApiTags('CandidateNotes')
@ApiBearerAuth('bearer')
export class CandidateNotesController {
  constructor(
    @Inject(CreateCandidateNoteUseCase) private readonly createUC: CreateCandidateNoteUseCase,
    @Inject(ListCandidateNotesUseCase) private readonly listUC: ListCandidateNotesUseCase,
    @Inject(GetCandidateNoteFacetsUseCase) private readonly facetsUC: GetCandidateNoteFacetsUseCase,
    @Inject(UpdateCandidateNoteUseCase) private readonly updateUC: UpdateCandidateNoteUseCase,
    @Inject(DeleteCandidateNoteUseCase) private readonly deleteUC: DeleteCandidateNoteUseCase,
  ) {}

  @Post()
  @Roles('CANDIDATE')
  @ApiCreatedResponse({ description: 'Not oluşturuldu' })
  async create(@Body() dto: CreateCandidateNoteDto, @Req() req: any) {
    const actorId = req.user?.id;
    return this.createUC.execute(
      {
        body: dto.body,
        questionId: dto.questionId,
        testId: dto.testId,
        attemptId: dto.attemptId,
        questionOrder: dto.questionOrder,
      },
      actorId,
    );
  }

  @Get()
  @Roles('CANDIDATE')
  @ApiOkResponse({ description: 'Notlar (cursor sayfalı)' })
  async list(@Query() q: ListCandidateNotesQueryDto, @Req() req: any) {
    const actorId = req.user?.id;
    return this.listUC.execute(actorId, {
      page: q.page,
      pageSize: q.pageSize,
      topicId: q.topicId,
      testId: q.testId,
      examTypeId: q.examTypeId,
      q: q.q,
      scope: q.scope ?? null,
    });
  }

  @Get('facets')
  @Roles('CANDIDATE')
  @ApiOkResponse({ description: 'Filtre seçenekleri (konu/test/sınav türü)' })
  async facets(@Req() req: any) {
    const actorId = req.user?.id;
    return this.facetsUC.execute(actorId);
  }

  @Patch(':id')
  @Roles('CANDIDATE')
  @ApiOkResponse({ description: 'Not güncellendi' })
  async update(@Param('id') id: string, @Body() dto: UpdateCandidateNoteDto, @Req() req: any) {
    const actorId = req.user?.id;
    return this.updateUC.execute(id, dto.body, actorId);
  }

  @Delete(':id')
  @Roles('CANDIDATE')
  @ApiOkResponse({ description: 'Not silindi' })
  async remove(@Param('id') id: string, @Req() req: any) {
    const actorId = req.user?.id;
    return this.deleteUC.execute(id, actorId);
  }
}
