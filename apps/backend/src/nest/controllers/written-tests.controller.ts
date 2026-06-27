import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Req,
  Inject,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiCreatedResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { CreateWrittenPackageDto } from './dto/create-written-package.dto';
import { UpdateWrittenPackageDto } from './dto/update-written-package.dto';
import { CreateWrittenTestDto } from './dto/create-written-test.dto';
import { UpdateWrittenTestDto } from './dto/update-written-test.dto';
import { CreateWrittenQuestionDto } from './dto/create-written-question.dto';
import { UpdateWrittenQuestionDto } from './dto/update-written-question.dto';
import {
  CreateWrittenPackageUseCase,
  UpdateWrittenPackageUseCase,
  PublishWrittenPackageUseCase,
  UnpublishWrittenPackageUseCase,
  ListEducatorWrittenPackagesUseCase,
  GetWrittenPackageUseCase,
} from '../../application/use-cases/written/WrittenPackageUseCases';
import {
  CreateWrittenTestUseCase,
  UpdateWrittenTestUseCase,
  DeleteWrittenTestUseCase,
} from '../../application/use-cases/written/WrittenTestUseCases';
import {
  CreateWrittenQuestionUseCase,
  UpdateWrittenQuestionUseCase,
  DeleteWrittenQuestionUseCase,
} from '../../application/use-cases/written/WrittenQuestionUseCases';

/**
 * Yazılı Test modülü — eğitici CRUD + publish/unpublish.
 * Tüm endpoint'ler EDUCATOR ve ADMIN rollerine açık.
 * Sahiplik ve yayın kilidi use-case katmanında zorlanır.
 */
@Controller('written-packages')
@ApiTags('WrittenTests')
@ApiBearerAuth('bearer')
export class WrittenTestsController {
  constructor(
    @Inject(CreateWrittenPackageUseCase)
    private readonly createPkgUC: CreateWrittenPackageUseCase,
    @Inject(UpdateWrittenPackageUseCase)
    private readonly updatePkgUC: UpdateWrittenPackageUseCase,
    @Inject(PublishWrittenPackageUseCase)
    private readonly publishPkgUC: PublishWrittenPackageUseCase,
    @Inject(UnpublishWrittenPackageUseCase)
    private readonly unpublishPkgUC: UnpublishWrittenPackageUseCase,
    @Inject(ListEducatorWrittenPackagesUseCase)
    private readonly listPkgUC: ListEducatorWrittenPackagesUseCase,
    @Inject(GetWrittenPackageUseCase)
    private readonly getPkgUC: GetWrittenPackageUseCase,
    @Inject(CreateWrittenTestUseCase)
    private readonly createTestUC: CreateWrittenTestUseCase,
    @Inject(UpdateWrittenTestUseCase)
    private readonly updateTestUC: UpdateWrittenTestUseCase,
    @Inject(DeleteWrittenTestUseCase)
    private readonly deleteTestUC: DeleteWrittenTestUseCase,
    @Inject(CreateWrittenQuestionUseCase)
    private readonly createQUC: CreateWrittenQuestionUseCase,
    @Inject(UpdateWrittenQuestionUseCase)
    private readonly updateQUC: UpdateWrittenQuestionUseCase,
    @Inject(DeleteWrittenQuestionUseCase)
    private readonly deleteQUC: DeleteWrittenQuestionUseCase,
  ) {}

  // ─── Package endpoints ────────────────────────────────────────

  @Post()
  @Roles('EDUCATOR', 'ADMIN')
  @ApiCreatedResponse({ description: 'Yazılı paket oluşturuldu' })
  async createPackage(@Body() dto: CreateWrittenPackageDto, @Req() req: any) {
    const actorId = (req as any).user?.id;
    return this.createPkgUC.execute(
      {
        title: dto.title,
        description: dto.description,
        priceCents: dto.priceCents,
        difficulty: dto.difficulty,
        language: dto.language,
        examTypeId: dto.examTypeId,
        gradeLevelId: dto.gradeLevelId,
        coverImageUrl: dto.coverImageUrl,
      },
      actorId,
    );
  }

  @Get('mine')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Eğiticinin yazılı paketleri' })
  async listMine(@Req() req: any) {
    const actorId = (req as any).user?.id;
    return this.listPkgUC.execute(actorId);
  }

  @Get(':id')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Yazılı paket detayı (test + sorular + çözümler)' })
  async getPackage(@Param('id') id: string, @Req() req: any) {
    const actorId = (req as any).user?.id;
    const actorRole = (req as any).user?.role;
    return this.getPkgUC.execute(id, actorId, actorRole);
  }

  @Patch(':id')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Yazılı paket meta güncellendi' })
  async updatePackage(
    @Param('id') id: string,
    @Body() dto: UpdateWrittenPackageDto,
    @Req() req: any,
  ) {
    const actorId = (req as any).user?.id;
    const actorRole = (req as any).user?.role;
    return this.updatePkgUC.execute(
      id,
      {
        title: dto.title,
        description: dto.description,
        priceCents: dto.priceCents,
        difficulty: dto.difficulty,
        language: dto.language,
        gradeLevelId: dto.gradeLevelId,
        coverImageUrl: dto.coverImageUrl,
      },
      actorId,
      actorRole,
    );
  }

  @Put(':id/publish')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Yazılı paket yayımlandı' })
  async publishPackage(@Param('id') id: string, @Req() req: any) {
    const actorId = (req as any).user?.id;
    const actorRole = (req as any).user?.role;
    return this.publishPkgUC.execute(id, actorId, actorRole);
  }

  @Put(':id/unpublish')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Yazılı paket yayından kaldırıldı' })
  async unpublishPackage(@Param('id') id: string, @Req() req: any) {
    const actorId = (req as any).user?.id;
    const actorRole = (req as any).user?.role;
    return this.unpublishPkgUC.execute(id, actorId, actorRole);
  }

  // ─── Test endpoints (POST /written-packages/:id/tests) ───────

  @Post(':id/tests')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiCreatedResponse({ description: 'Yazılı test oluşturuldu' })
  async createTest(
    @Param('id') packageId: string,
    @Body() dto: CreateWrittenTestDto,
    @Req() req: any,
  ) {
    const actorId = (req as any).user?.id;
    const actorRole = (req as any).user?.role;
    return this.createTestUC.execute(
      {
        packageId,
        title: dto.title,
        isTimed: dto.isTimed,
        duration: dto.duration,
        examTypeId: dto.examTypeId,
        topicId: dto.topicId,
      },
      actorId,
      actorRole,
    );
  }
}

// ─── Separate controller for /written-tests/:id/* routes ─────

@Controller('written-tests')
@ApiTags('WrittenTests')
@ApiBearerAuth('bearer')
export class WrittenTestsItemController {
  constructor(
    @Inject(UpdateWrittenTestUseCase)
    private readonly updateTestUC: UpdateWrittenTestUseCase,
    @Inject(DeleteWrittenTestUseCase)
    private readonly deleteTestUC: DeleteWrittenTestUseCase,
    @Inject(CreateWrittenQuestionUseCase)
    private readonly createQUC: CreateWrittenQuestionUseCase,
    @Inject(UpdateWrittenQuestionUseCase)
    private readonly updateQUC: UpdateWrittenQuestionUseCase,
    @Inject(DeleteWrittenQuestionUseCase)
    private readonly deleteQUC: DeleteWrittenQuestionUseCase,
  ) {}

  @Patch(':id')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Yazılı test güncellendi' })
  async updateTest(
    @Param('id') id: string,
    @Body() dto: UpdateWrittenTestDto,
    @Req() req: any,
  ) {
    const actorId = (req as any).user?.id;
    const actorRole = (req as any).user?.role;
    return this.updateTestUC.execute(
      id,
      {
        title: dto.title,
        isTimed: dto.isTimed,
        duration: dto.duration,
        examTypeId: dto.examTypeId,
        topicId: dto.topicId,
      },
      actorId,
      actorRole,
    );
  }

  @Delete(':id')
  @Roles('EDUCATOR', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Yazılı test silindi (soft delete)' })
  async deleteTest(@Param('id') id: string, @Req() req: any) {
    const actorId = (req as any).user?.id;
    const actorRole = (req as any).user?.role;
    return this.deleteTestUC.execute(id, actorId, actorRole);
  }

  @Post(':id/questions')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiCreatedResponse({ description: 'Yazılı soru oluşturuldu' })
  async createQuestion(
    @Param('id') testId: string,
    @Body() dto: CreateWrittenQuestionDto,
    @Req() req: any,
  ) {
    const actorId = (req as any).user?.id;
    const actorRole = (req as any).user?.role;
    return this.createQUC.execute(
      {
        testId,
        content: dto.content,
        mediaUrl: dto.mediaUrl,
        order: dto.order,
        solutionText: dto.solutionText,
        solutionMediaUrl: dto.solutionMediaUrl,
      },
      actorId,
      actorRole,
    );
  }

  @Patch(':id/questions/:questionId')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Yazılı soru güncellendi' })
  async updateQuestion(
    @Param('id') testId: string,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateWrittenQuestionDto,
    @Req() req: any,
  ) {
    const actorId = (req as any).user?.id;
    const actorRole = (req as any).user?.role;
    return this.updateQUC.execute(
      testId,
      questionId,
      {
        content: dto.content,
        mediaUrl: dto.mediaUrl,
        order: dto.order,
        solutionText: dto.solutionText,
        solutionMediaUrl: dto.solutionMediaUrl,
      },
      actorId,
      actorRole,
    );
  }

  @Delete(':id/questions/:questionId')
  @Roles('EDUCATOR', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Yazılı soru silindi' })
  async deleteQuestion(
    @Param('id') testId: string,
    @Param('questionId') questionId: string,
    @Req() req: any,
  ) {
    const actorId = (req as any).user?.id;
    const actorRole = (req as any).user?.role;
    return this.deleteQUC.execute(testId, questionId, actorId, actorRole);
  }
}
