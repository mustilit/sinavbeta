// @ts-nocheck
import { Controller, Get, Post, Patch, Delete, Body, Req, Query, Param, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { CreateTopicUseCase } from '../../application/use-cases/admin/CreateTopicUseCase';
import { UpdateTopicUseCase } from '../../application/use-cases/admin/UpdateTopicUseCase';
import { DeleteTopicUseCase } from '../../application/use-cases/admin/DeleteTopicUseCase';
import { GetTopicTreeUseCase } from '../../application/use-cases/admin/GetTopicTreeUseCase';
import { ListTopicsByExamTypeUseCase } from '../../application/use-cases/admin/ListTopicsByExamTypeUseCase';

/**
 * Admin konu CRUD + ağaç yönetimi.
 * GET /admin/topics/tree → tam ağaç (inactive dahil)
 * GET /admin/topics     → düz liste (opsiyonel examTypeId filtresi)
 * POST /admin/topics    → yeni konu (parentId + examTypeIds destekler)
 * PATCH /admin/topics/:id
 * DELETE /admin/topics/:id
 */
@Controller('admin/topics')
@ApiTags('admin/topics')
export class AdminTopicsController {
  constructor(
    @Inject(CreateTopicUseCase) private readonly createTopic: CreateTopicUseCase,
    @Inject(UpdateTopicUseCase) private readonly updateTopic: UpdateTopicUseCase,
    @Inject(DeleteTopicUseCase) private readonly deleteTopic: DeleteTopicUseCase,
    @Inject(GetTopicTreeUseCase) private readonly topicTree: GetTopicTreeUseCase,
    @Inject(ListTopicsByExamTypeUseCase) private readonly listTopics: ListTopicsByExamTypeUseCase,
  ) {}

  @Get('tree')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Full topic tree (inactive included)' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  tree() {
    return this.topicTree.execute(false);
  }

  @Get()
  @Roles('ADMIN', 'EDUCATOR')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Flat topic list, optional examTypeId filter' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  list(@Query('examTypeId') examTypeId?: string, @Query('activeOnly') activeOnly?: string) {
    const active = activeOnly === 'false' ? false : true;
    return this.listTopics.execute(examTypeId, active);
  }

  @Post()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiCreatedResponse({ description: 'Created' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  create(@Body() body: CreateTopicDto, @Req() req: any) {
    return this.createTopic.execute(
      { name: body.name, examTypeIds: body.examTypeIds, parentId: body.parentId, active: body.active },
      req.user?.id,
    );
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Updated' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Not found' })
  update(@Param('id') id: string, @Body() body: UpdateTopicDto, @Req() req: any) {
    return this.updateTopic.execute(
      id,
      { name: body.name, examTypeIds: body.examTypeIds, parentId: body.parentId, active: body.active },
      req.user?.id,
    );
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Deleted' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiNotFoundResponse({ description: 'Not found' })
  delete(@Param('id') id: string, @Req() req: any) {
    return this.deleteTopic.execute(id, req.user?.id);
  }
}
