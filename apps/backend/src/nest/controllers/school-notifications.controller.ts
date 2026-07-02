import { Controller, Get, Post, Patch, Body, Param, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsOptional, IsArray, IsBoolean, IsIn, MaxLength, IsInt, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import {
  GetUnreadCountUseCase,
  ListNotificationsUseCase,
  MarkReadUseCase,
  MarkAllReadUseCase,
  SendMessageUseCase,
  ListMessageTargetsUseCase,
} from '../../application/use-cases/school/SchoolNotificationUseCases';

const NOTIF_TYPES = ['NEW_ASSIGNMENT', 'ASSIGNMENT_GRADED', 'MESSAGE', 'OFFLINE_DONE', 'APPOINTMENT'];

class ListNotificationsDto {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value)) @IsBoolean() isRead?: boolean;
  @IsOptional() @IsIn(NOTIF_TYPES) type?: string;
}

class SendMessageDto {
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) body?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) classroomIds?: string[];
}

/** E-Sınıf — Bildirimler. JWT; okul rolü use-case'te (herkes kendi bildirimini görür). */
@Controller('school/notifications')
@ApiTags('E-Sınıf · Bildirim')
export class SchoolNotificationsController {
  private unreadUC = new GetUnreadCountUseCase();
  private listUC = new ListNotificationsUseCase();
  private markReadUC = new MarkReadUseCase();
  private markAllUC = new MarkAllReadUseCase();
  private sendUC = new SendMessageUseCase();
  private targetsUC = new ListMessageTargetsUseCase();

  @Get() @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Bildirim listesi (cursor + okundu/tür filtresi + unreadCount)' }) @ApiErrorResponses()
  list(@Query() q: ListNotificationsDto, @Req() req: any) { return this.listUC.execute(q, req?.user?.id); }

  @Get('unread-count') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Okunmamış bildirim sayısı (rozet için)' }) @ApiErrorResponses()
  unread(@Req() req: any) { return this.unreadUC.execute(req?.user?.id); }

  @Get('message-targets') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Mesaj hedef seçenekleri — kapsam içindeki sınıflar' }) @ApiErrorResponses()
  targets(@Req() req: any) { return this.targetsUC.execute(req?.user?.id); }

  // Toplu fan-out — kötüye kullanım koruması (429 → SUSPICIOUS_RATE_LIMIT audit filtrede).
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('message') @ApiBearerAuth('bearer') @ApiOkResponse({ description: 'Kapsamdaki sınıf öğrencilerine mesaj gönder' }) @ApiErrorResponses()
  send(@Body() dto: SendMessageDto, @Req() req: any) { return this.sendUC.execute(dto, req?.user?.id); }

  @Patch('read-all') @ApiBearerAuth('bearer') @ApiErrorResponses()
  readAll(@Req() req: any) { return this.markAllUC.execute(req?.user?.id); }

  @Patch(':id/read') @ApiBearerAuth('bearer') @ApiErrorResponses()
  read(@Param('id') id: string, @Req() req: any) { return this.markReadUC.execute(id, req?.user?.id); }
}
