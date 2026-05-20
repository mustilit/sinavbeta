import { Controller, Post, Body, Put, Param, Get, Req, Patch, Delete, Inject } from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';
import { Public } from '../decorators/public.decorator';
import { CreateTestUseCase } from '../../application/use-cases/test/CreateTestUseCase';
import { CreateQuestionUseCase } from '../../application/use-cases/question/CreateQuestionUseCase';
import { ListMarketplaceTestsUseCase } from '../../application/use-cases/test/ListMarketplaceTestsUseCase';
import { GetTestUseCase } from '../../application/use-cases/test/GetTestUseCase';
import { PublishTestUseCase } from '../../application/use-cases/test/PublishTestUseCase';
import { UnpublishTestUseCase } from '../../application/use-cases/test/UnpublishTestUseCase';
import { UpdateTestUseCase } from '../../application/use-cases/test/UpdateTestUseCase';
import { UpdateQuestionUseCase } from '../../application/use-cases/question/UpdateQuestionUseCase';
import { UpdateOptionUseCase } from '../../application/use-cases/question/UpdateOptionUseCase';
import { DeleteQuestionUseCase } from '../../application/use-cases/question/DeleteQuestionUseCase';
import { CreateTestDto } from './dto/create-test.dto';
import { UpdateTestDto } from './dto/update-test.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { UpdateOptionDto } from './dto/update-option.dto';

/**
 * Test paketi CRUD işlemlerini ve pazar yeri listesini yönetir.
 * Oluşturma/güncelleme işlemleri sadece EDUCATOR rolüne açıktır.
 * Pazar yeri listesi ve test detayı herkese açıktır (@Public).
 */
@Controller()
export class TestsController {
  constructor(
    @Inject(CreateTestUseCase) private readonly createTestUC: CreateTestUseCase,
    @Inject(CreateQuestionUseCase) private readonly createQuestionUC: CreateQuestionUseCase,
    @Inject(ListMarketplaceTestsUseCase) private readonly listUC: ListMarketplaceTestsUseCase,
    @Inject(GetTestUseCase) private readonly getUC: GetTestUseCase,
    @Inject(PublishTestUseCase) private readonly publishUC: PublishTestUseCase,
    @Inject(UnpublishTestUseCase) private readonly unpublishUC: UnpublishTestUseCase,
    @Inject(UpdateTestUseCase) private readonly updateTestUC: UpdateTestUseCase,
    @Inject(UpdateQuestionUseCase) private readonly updateQuestionUC: UpdateQuestionUseCase,
    @Inject(UpdateOptionUseCase) private readonly updateOptionUC: UpdateOptionUseCase,
    @Inject(DeleteQuestionUseCase) private readonly deleteQuestionUC: DeleteQuestionUseCase,
  ) {}

  /** Yeni test paketi oluşturur — educatorId JWT token'dan alınır, DTO'dan gelmez */
  @Post('tests')
  @Roles('EDUCATOR', 'ADMIN')
  createTest(@Body() body: CreateTestDto, @Req() req: any) {
    const educatorId = (req as any).user?.id ?? undefined;
    return this.createTestUC.execute({
      title: body.title,
      isTimed: body.isTimed,
      duration: body.duration,
      price: body.price,
      educatorId,
      examTypeId: body.examTypeId ?? null,
      topicId: body.topicId ?? null,
      questions: body.questions,
    });
  }

  @Put('tests/:id/publish')
  @Roles('EDUCATOR', 'ADMIN')
  async publish(@Param('id') id: string, @Req() req: any) {
    const actorId = (req as any).user?.id;
    return await this.publishUC.execute(id, actorId);
  }

  @Put('tests/:id/unpublish')
  @Roles('EDUCATOR', 'ADMIN')
  async unpublish(@Param('id') id: string, @Req() req: any) {
    // actorId zorunlu: ownership guard + audit log için (UNPUBLISH actorId=null
    // olarak yazılırsa "kim yaptı" sorusu cevapsız kalır → logging gap).
    const actorId = (req as any).user?.id;
    return await this.unpublishUC.execute(id, actorId);
  }

  @Post('tests/:id/questions')
  @Roles('EDUCATOR', 'ADMIN')
  addQuestion(@Param('id') id: string, @Body() body: any) {
    return this.createQuestionUC.execute(id, body);
  }

  @Patch('tests/:id')
  @Roles('EDUCATOR', 'ADMIN')
  async updateTest(@Param('id') id: string, @Body() body: UpdateTestDto, @Req() req: any) {
    const actorId = (req as any).user?.id;
    return await this.updateTestUC.execute(id, {
      title: body.title,
      priceCents: body.priceCents,
      duration: body.duration,
      isTimed: body.isTimed,
      hasSolutions: body.hasSolutions,
      campaignPriceCents: body.campaignPriceCents,
      campaignValidFrom: body.campaignValidFrom ? new Date(body.campaignValidFrom) : undefined,
      campaignValidUntil: body.campaignValidUntil ? new Date(body.campaignValidUntil) : undefined,
      coverImageUrl: body.coverImageUrl,
    }, actorId);
  }

  @Patch('tests/:id/questions/:questionId')
  @Roles('EDUCATOR', 'ADMIN')
  async updateQuestion(
    @Param('id') _id: string,
    @Param('questionId') questionId: string,
    @Body() body: UpdateQuestionDto,
    @Req() req: any,
  ) {
    const actorId = (req as any).user?.id;
    return await this.updateQuestionUC.execute(questionId, {
      content: body.content,
      order: body.order,
      mediaUrl: body.mediaUrl,
      solutionText: body.solutionText,
      solutionMediaUrl: body.solutionMediaUrl,
    }, actorId);
  }

  @Patch('tests/:id/questions/:questionId/options/:optionId')
  @Roles('EDUCATOR', 'ADMIN')
  async updateOption(
    @Param('id') _id: string,
    @Param('questionId') _questionId: string,
    @Param('optionId') optionId: string,
    @Body() body: UpdateOptionDto,
    @Req() req: any,
  ) {
    const actorId = (req as any).user?.id;
    return await this.updateOptionUC.execute(optionId, {
      content: body.content,
      isCorrect: body.isCorrect,
    }, actorId);
  }

  @Delete('tests/:id/questions/:questionId')
  @Roles('EDUCATOR', 'ADMIN')
  async deleteQuestion(
    @Param('id') testId: string,
    @Param('questionId') questionId: string,
    @Req() req: any,
  ) {
    const actorId = (req as any).user?.id;
    await this.deleteQuestionUC.execute(testId, questionId, actorId);
    return { success: true };
  }

  @Public()
  @Get('marketplace/tests')
  list() {
    return this.listUC.execute();
  }

  @Public()
  @Get('tests/:id')
  get(@Param('id') id: string) {
    return this.getUC.execute(id);
  }
}

