import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsString, IsOptional, IsInt, Min, IsIn, IsISO8601, IsBoolean, IsEmail, MaxLength } from 'class-validator';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import { Roles } from '../decorators/roles.decorator';
import {
  CreateAcademicPeriodUseCase,
  ListAcademicPeriodsUseCase,
  CreateSchoolUseCase,
  ListSchoolsUseCase,
  UpdateSchoolUseCase,
  DeactivateSchoolUseCase,
  AssignSchoolAdminUseCase,
} from '../../application/use-cases/school/SchoolAdminUseCases';

class CreatePeriodDto {
  @IsString() @MaxLength(40) name!: string;
  @IsISO8601() startDate!: string;
  @IsISO8601() endDate!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class CreateSchoolDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(5) code!: string;
  @IsOptional() @IsString() @MaxLength(60) city?: string;
  @IsOptional() @IsIn(['PRIMARY', 'MIDDLE', 'HIGH', 'MIXED']) schoolType?: string;
  @IsString() periodId!: string;
  @IsOptional() @IsInt() @Min(0) maxUsers?: number;
  @IsOptional() @IsInt() @Min(0) annualLiveLimit?: number;
}

class UpdateSchoolDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(60) city?: string;
  @IsOptional() @IsIn(['PRIMARY', 'MIDDLE', 'HIGH', 'MIXED']) schoolType?: string;
  @IsOptional() @IsInt() @Min(0) maxUsers?: number;
  @IsOptional() @IsInt() @Min(0) annualLiveLimit?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class AssignSchoolAdminDto {
  @IsEmail() @MaxLength(160) email!: string;
  @IsOptional() @IsString() @MaxLength(60) firstName?: string;
  @IsOptional() @IsString() @MaxLength(60) lastName?: string;
}

class ListSchoolsQueryDto {
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsIn(['PRIMARY', 'MIDDLE', 'HIGH', 'MIXED']) schoolType?: string;
  @IsOptional() @IsString() @MaxLength(160) adminEmail?: string;
  @IsOptional() @IsString() periodId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

/** Platform Admin — E-Sınıf okul + dönem yönetimi. */
@Controller('admin')
@ApiTags('Admin · E-Sınıf')
export class AdminSchoolsController {
  private createPeriodUC = new CreateAcademicPeriodUseCase();
  private listPeriodsUC = new ListAcademicPeriodsUseCase();
  private createSchoolUC = new CreateSchoolUseCase();
  private listSchoolsUC = new ListSchoolsUseCase();
  private updateSchoolUC = new UpdateSchoolUseCase();
  private deactivateSchoolUC = new DeactivateSchoolUseCase();
  private assignAdminUC = new AssignSchoolAdminUseCase();

  // ── Dönem ──
  @Get('academic-periods')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Akademik dönem listesi' })
  @ApiErrorResponses()
  listPeriods() {
    return this.listPeriodsUC.execute();
  }

  @Post('academic-periods')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiErrorResponses()
  createPeriod(@Body() dto: CreatePeriodDto, @Req() req: any) {
    return this.createPeriodUC.execute(dto, req?.user?.id);
  }

  // ── Okul ──
  @Get('schools')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Okul listesi (filtre + sayfalama)' })
  @ApiErrorResponses()
  listSchools(@Query() q: ListSchoolsQueryDto) {
    return this.listSchoolsUC.execute(q);
  }

  @Post('schools')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiErrorResponses()
  createSchool(@Body() dto: CreateSchoolDto, @Req() req: any) {
    return this.createSchoolUC.execute(dto, req?.user?.id);
  }

  @Patch('schools/:id')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiErrorResponses()
  updateSchool(@Param('id') id: string, @Body() dto: UpdateSchoolDto, @Req() req: any) {
    return this.updateSchoolUC.execute(id, dto, req?.user?.id);
  }

  @Delete('schools/:id')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiErrorResponses()
  deactivateSchool(@Param('id') id: string, @Req() req: any) {
    return this.deactivateSchoolUC.execute(id, req?.user?.id);
  }

  @Post('schools/:id/assign-admin')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Okul yöneticisi atanır; { username, tempPassword } döner' })
  @ApiErrorResponses()
  assignAdmin(@Param('id') id: string, @Body() dto: AssignSchoolAdminDto, @Req() req: any) {
    return this.assignAdminUC.execute(id, dto, req?.user?.id);
  }
}
