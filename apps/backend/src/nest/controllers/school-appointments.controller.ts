import { Controller, Get, Post, Put, Patch, Body, Param, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsOptional, IsArray, IsIn, IsInt, Min, Max, MaxLength, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import {
  ListMyAvailabilityUseCase,
  SetAvailabilityUseCase,
  ListAppointmentTeachersUseCase,
  GetTeacherSlotsUseCase,
  BookAppointmentUseCase,
  ListMyAppointmentsUseCase,
  CancelMyAppointmentUseCase,
  ListTeacherAppointmentsUseCase,
  UpdateAppointmentStatusUseCase,
} from '../../application/use-cases/school/SchoolAppointmentUseCases';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

class AvailabilitySlotDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(6) dayOfWeek!: number;
  @IsString() @Matches(TIME_RE) startTime!: string;
  @IsString() @Matches(TIME_RE) endTime!: string;
}
class SetAvailabilityDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => AvailabilitySlotDto) slots!: AvailabilitySlotDto[];
}
class SlotsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30) days?: number;
}
class BookAppointmentDto {
  @IsString() availabilityId!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @IsOptional() @IsIn(['ACADEMIC', 'COUNSELING', 'PARENT', 'OTHER']) appointmentType?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
class TeacherAppointmentsQueryDto {
  @IsOptional() @IsIn(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']) status?: string;
  @IsOptional() @IsIn(['upcoming', 'all']) scope?: 'upcoming' | 'all';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize?: number;
}
class UpdateStatusDto {
  @IsIn(['CONFIRMED', 'CANCELLED', 'COMPLETED']) status!: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
  @IsOptional() @IsString() @MaxLength(1000) teacherNotes?: string;
}

/**
 * E-Sınıf — Randevu. JWT; okul rolü use-case'te.
 * Öğretmen: haftalık uygunluk + alınan randevular. Öğrenci: slot görüntüle + rezervasyon.
 */
@Controller('school/appointments')
@ApiTags('E-Sınıf · Randevu')
export class SchoolAppointmentsController {
  private listAvailUC = new ListMyAvailabilityUseCase();
  private setAvailUC = new SetAvailabilityUseCase();
  private teachersUC = new ListAppointmentTeachersUseCase();
  private slotsUC = new GetTeacherSlotsUseCase();
  private bookUC = new BookAppointmentUseCase();
  private mineUC = new ListMyAppointmentsUseCase();
  private cancelUC = new CancelMyAppointmentUseCase();
  private teacherListUC = new ListTeacherAppointmentsUseCase();
  private statusUC = new UpdateAppointmentStatusUseCase();

  // ── Öğretmen ──────────────────────────────────────────────────────────
  @Get('availability') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Öğretmenin haftalık uygunluk slotları' }) @ApiErrorResponses()
  availability(@Req() req: any) { return this.listAvailUC.execute(req?.user?.id); }

  @Put('availability') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Haftalık uygunluk setini kaydet (replace)' }) @ApiErrorResponses()
  setAvailability(@Body() dto: SetAvailabilityDto, @Req() req: any) { return this.setAvailUC.execute(dto, req?.user?.id); }

  @Get('teacher') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Öğretmenin alınan randevuları (sayfalı)' }) @ApiErrorResponses()
  teacherList(@Query() q: TeacherAppointmentsQueryDto, @Req() req: any) { return this.teacherListUC.execute(q, req?.user?.id); }

  // ── Öğrenci ───────────────────────────────────────────────────────────
  @Get('teachers') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Randevu alınabilecek öğretmenler' }) @ApiErrorResponses()
  teachers(@Req() req: any) { return this.teachersUC.execute(req?.user?.id); }

  @Get('teachers/:teacherUserId/slots') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Öğretmenin önümüzdeki günlerdeki somut slotları' }) @ApiErrorResponses()
  slots(@Param('teacherUserId') teacherUserId: string, @Query() q: SlotsQueryDto, @Req() req: any) {
    return this.slotsUC.execute({ teacherUserId, days: q.days }, req?.user?.id);
  }

  @Get('mine') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Öğrencinin randevuları' }) @ApiErrorResponses()
  mine(@Req() req: any) { return this.mineUC.execute(req?.user?.id); }

  // Rezervasyon — kota/abuse koruması (429 → SUSPICIOUS_RATE_LIMIT audit filtrede).
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post() @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Randevu al (çifte rezervasyon → 409 SLOT_TAKEN)' }) @ApiErrorResponses()
  book(@Body() dto: BookAppointmentDto, @Req() req: any) { return this.bookUC.execute(dto, req?.user?.id); }

  @Patch(':id/cancel') @ApiBearerAuth('bearer') @ApiErrorResponses()
  cancel(@Param('id') id: string, @Req() req: any) { return this.cancelUC.execute(id, req?.user?.id); }

  @Patch(':id/status') @ApiBearerAuth('bearer') @ApiErrorResponses()
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto, @Req() req: any) { return this.statusUC.execute(id, dto, req?.user?.id); }
}
