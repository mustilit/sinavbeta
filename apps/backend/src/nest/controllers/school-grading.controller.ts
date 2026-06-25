import { Controller, Get, Post, Body, Param, Req } from '@nestjs/common';
import { IsString, IsOptional, IsArray, ValidateNested, IsNumber, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import { GetSubmissionForGradingUseCase, GradeSubmissionUseCase } from '../../application/use-cases/school/SchoolGradingUseCases';

class GradeItemDto {
  @IsString() questionId!: string;
  @IsNumber() @Min(0) earnedPoints!: number;
}
class GradeDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => GradeItemDto) grades!: GradeItemDto[];
  @IsOptional() @IsString() @MaxLength(4000) feedback?: string;
}

/** E-Sınıf — Yazılı teslim değerlendirme (öğretmen/zümre başkanı). */
@Controller('school/submissions')
@ApiTags('E-Sınıf · Değerlendirme')
export class SchoolGradingController {
  private getUC = new GetSubmissionForGradingUseCase();
  private gradeUC = new GradeSubmissionUseCase();

  @Get(':id/grading') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Teslim — yazılı değerlendirme görünümü' }) @ApiErrorResponses()
  get(@Param('id') id: string, @Req() req: any) { return this.getUC.execute(id, req?.user?.id); }

  @Post(':id/grade') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Puanları kaydet → GRADED' }) @ApiErrorResponses()
  grade(@Param('id') id: string, @Body() dto: GradeDto, @Req() req: any) { return this.gradeUC.execute(id, dto, req?.user?.id); }
}
