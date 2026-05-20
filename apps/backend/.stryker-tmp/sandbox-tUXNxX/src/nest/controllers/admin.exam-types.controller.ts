// @ts-nocheck
import { Controller, Get, Post, Patch, Delete, Body, Req, Query, Param, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiConflictResponse, ApiNotFoundResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { CreateExamTypeDto } from './dto/create-examtype.dto';
import { UpdateExamTypeDto } from './dto/update-examtype.dto';
import { ListExamTypeQueryDto } from './dto/list-examtype.query.dto';
import { CreateExamTypeUseCase } from '../../application/use-cases/admin/CreateExamTypeUseCase';
import { ListExamTypesUseCase } from '../../application/use-cases/admin/ListExamTypesUseCase';
import { UpdateExamTypeUseCase } from '../../application/use-cases/admin/UpdateExamTypeUseCase';
import { DeleteExamTypeUseCase } from '../../application/use-cases/admin/DeleteExamTypeUseCase';

/**
 * Admin sınav türü CRUD yönetimi — sınav türlerini listeler, oluşturur,
 * günceller ve siler. Sadece ADMIN rolüne açıktır.
 */
@Controller('admin/exam-types')
@ApiTags('admin/exam-types')
export class AdminExamTypesController {
  constructor(
    @Inject(ListExamTypesUseCase) private readonly listExamTypes: ListExamTypesUseCase,
    @Inject(CreateExamTypeUseCase) private readonly createExamType: CreateExamTypeUseCase,
    @Inject(UpdateExamTypeUseCase) private readonly updateExamType: UpdateExamTypeUseCase,
    @Inject(DeleteExamTypeUseCase) private readonly deleteExamType: DeleteExamTypeUseCase,
  ) {}

  @Get()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'List of exam types' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async list(@Query() q: ListExamTypeQueryDto) {
    const activeOnly = q.activeOnly === 'false' ? false : true;
    return this.listExamTypes.execute(activeOnly);
  }

  @Post()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiCreatedResponse({ description: 'Created' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiConflictResponse({ description: 'Slug exists' })
  async create(@Body() body: CreateExamTypeDto, @Req() req: any) {
    const actorId = (req as any).user?.id;
    return this.createExamType.execute(
      { name: body.name, slug: body.slug, description: body.description, active: body.active },
      actorId,
    );
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Updated' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Not found' })
  @ApiConflictResponse({ description: 'Slug exists' })
  async update(@Param('id') id: string, @Body() body: UpdateExamTypeDto, @Req() req: any) {
    const actorId = (req as any).user?.id;
    return this.updateExamType.execute(id, { name: body.name, slug: body.slug, description: body.description, active: body.active }, actorId);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Deleted' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Not found' })
  @ApiConflictResponse({ description: 'Has topics' })
  async delete(@Param('id') id: string, @Req() req: any) {
    const actorId = (req as any).user?.id;
    return this.deleteExamType.execute(id, actorId);
  }
}
