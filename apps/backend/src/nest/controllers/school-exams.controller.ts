import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req } from '@nestjs/common';
import { IsString, IsOptional, IsInt, Min, Max, IsIn, IsBoolean, IsArray, ValidateNested, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import {
  CreateSchoolExamUseCase,
  UpdateSchoolExamUseCase,
  SaveSchoolExamQuestionsUseCase,
  GetSchoolExamUseCase,
  ListSchoolExamPoolUseCase,
  ArchiveSchoolExamUseCase,
  DeleteSchoolExamUseCase,
} from '../../application/use-cases/school/SchoolExamUseCases';

class CreateExamDto {
  @IsIn(['TEST', 'TUNNEL', 'WRITTEN']) examType!: string;
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(60) subject?: string;
  @IsOptional() @IsInt() @Min(1) @Max(12) gradeLevel?: number;
  @IsOptional() @IsString() @MaxLength(120) topic?: string;
  @IsOptional() @IsInt() @Min(0) durationMinutes?: number;
  @IsOptional() @IsIn(['DEPARTMENT', 'SCHOOL']) poolVisibility?: string;
  // Okul yöneticisi sınavı bir zümreye atayabilir (boş → okul geneli havuz).
  @IsOptional() @IsString() departmentId?: string;
}
class UpdateExamDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(60) subject?: string;
  @IsOptional() @IsInt() @Min(1) @Max(12) gradeLevel?: number | null;
  @IsOptional() @IsString() @MaxLength(120) topic?: string | null;
  @IsOptional() @IsInt() @Min(0) durationMinutes?: number | null;
  @IsOptional() @IsIn(['DEPARTMENT', 'SCHOOL']) poolVisibility?: string;
}
class OptionDto {
  @IsOptional() @IsString() @MaxLength(500) content?: string;
  @IsOptional() @IsString() mediaUrl?: string;
  @IsOptional() @IsBoolean() isCorrect?: boolean;
}
class QuestionDto {
  @IsOptional() @IsString() @MaxLength(4000) content?: string;
  @IsOptional() @IsString() mediaUrl?: string;
  @IsOptional() @IsInt() @Min(1) points?: number;
  @IsOptional() @IsString() @MaxLength(4000) solutionText?: string;
  @IsOptional() @IsString() solutionMediaUrl?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto) options?: OptionDto[];
}
class SaveQuestionsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => QuestionDto) questions!: QuestionDto[];
}
class ArchiveDto { @IsBoolean() isArchived!: boolean; }

/** E-Sınıf — Öğretmen/Zümre Başkanı sınav içeriği + havuz. JWT; okul rolü use-case'te. */
@Controller('school/exams')
@ApiTags('E-Sınıf · Sınav Havuzu')
export class SchoolExamsController {
  private createUC = new CreateSchoolExamUseCase();
  private updateUC = new UpdateSchoolExamUseCase();
  private saveQUC = new SaveSchoolExamQuestionsUseCase();
  private getUC = new GetSchoolExamUseCase();
  private listUC = new ListSchoolExamPoolUseCase();
  private archiveUC = new ArchiveSchoolExamUseCase();
  private deleteUC = new DeleteSchoolExamUseCase();

  @Get() @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Sınav havuzu (rol bazlı görünürlük)' }) @ApiErrorResponses()
  list(
    @Query('examType') examType: string | undefined,
    @Query('gradeLevel') gradeLevel: string | undefined,
    @Query('includeArchived') includeArchived: string | undefined,
    @Query('q') q: string | undefined,
    @Req() req: any,
  ) {
    return this.listUC.execute({ examType, gradeLevel: gradeLevel ? Number(gradeLevel) : undefined, includeArchived: includeArchived === '1' || includeArchived === 'true', q }, req?.user?.id);
  }

  @Get(':id') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Sınav detayı (sorular + şıklar)' }) @ApiErrorResponses()
  get(@Param('id') id: string, @Req() req: any) { return this.getUC.execute(id, req?.user?.id); }

  @Post() @ApiBearerAuth('bearer') @ApiErrorResponses()
  create(@Body() dto: CreateExamDto, @Req() req: any) { return this.createUC.execute(dto, req?.user?.id); }

  @Patch(':id') @ApiBearerAuth('bearer') @ApiErrorResponses()
  update(@Param('id') id: string, @Body() dto: UpdateExamDto, @Req() req: any) { return this.updateUC.execute(id, dto, req?.user?.id); }

  @Post(':id/questions') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Soruları topluca kaydet (replace)' }) @ApiErrorResponses()
  saveQuestions(@Param('id') id: string, @Body() dto: SaveQuestionsDto, @Req() req: any) { return this.saveQUC.execute(id, dto, req?.user?.id); }

  @Patch(':id/archive') @ApiBearerAuth('bearer') @ApiErrorResponses()
  archive(@Param('id') id: string, @Body() dto: ArchiveDto, @Req() req: any) { return this.archiveUC.execute(id, dto, req?.user?.id); }

  @Delete(':id') @ApiBearerAuth('bearer') @ApiErrorResponses()
  remove(@Param('id') id: string, @Req() req: any) { return this.deleteUC.execute(id, req?.user?.id); }
}
