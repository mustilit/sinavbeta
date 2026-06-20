import { Controller, Get, Post, Patch, Delete, Body, Req, Query, Param, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiCreatedResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { CreateGradeLevelDto } from './dto/create-gradelevel.dto';
import { UpdateGradeLevelDto } from './dto/update-gradelevel.dto';
import { ListExamTypeQueryDto } from './dto/list-examtype.query.dto';
import { CreateGradeLevelUseCase, UpdateGradeLevelUseCase, DeleteGradeLevelUseCase, ListGradeLevelsUseCase } from '../../application/use-cases/admin/GradeLevelUseCases';

/** Admin Sınıf (GradeLevel) CRUD — ExamType deseni. Sadece ADMIN. */
@Controller('admin/grade-levels')
@ApiTags('admin/grade-levels')
export class AdminGradeLevelsController {
  constructor(
    @Inject(ListGradeLevelsUseCase) private readonly listUC: ListGradeLevelsUseCase,
    @Inject(CreateGradeLevelUseCase) private readonly createUC: CreateGradeLevelUseCase,
    @Inject(UpdateGradeLevelUseCase) private readonly updateUC: UpdateGradeLevelUseCase,
    @Inject(DeleteGradeLevelUseCase) private readonly deleteUC: DeleteGradeLevelUseCase,
  ) {}

  private toMeta(body: { icon?: string; iconUrl?: string }) {
    return body.icon !== undefined || body.iconUrl !== undefined
      ? {
          ...(body.icon !== undefined ? { icon: body.icon } : {}),
          ...(body.iconUrl !== undefined ? { iconUrl: body.iconUrl } : {}),
        }
      : undefined;
  }

  @Get()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'List of grade levels' })
  async list(@Query() q: ListExamTypeQueryDto) {
    const activeOnly = q.activeOnly === 'false' ? false : true;
    return this.listUC.execute(activeOnly);
  }

  @Post()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiCreatedResponse({ description: 'Created' })
  async create(@Body() body: CreateGradeLevelDto, @Req() req: any) {
    const actorId = (req as any).user?.id;
    return this.createUC.execute(
      { name: body.name, slug: body.slug, description: body.description, active: body.active, metadata: this.toMeta(body) },
      actorId,
    );
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Updated' })
  async update(@Param('id') id: string, @Body() body: UpdateGradeLevelDto, @Req() req: any) {
    const actorId = (req as any).user?.id;
    return this.updateUC.execute(
      id,
      { name: body.name, slug: body.slug, description: body.description, active: body.active, metadata: this.toMeta(body) },
      actorId,
    );
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Deleted' })
  async delete(@Param('id') id: string, @Req() req: any) {
    const actorId = (req as any).user?.id;
    return this.deleteUC.execute(id, actorId);
  }
}
