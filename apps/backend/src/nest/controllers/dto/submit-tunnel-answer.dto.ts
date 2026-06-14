import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitTunnelAnswerDto {
  @ApiProperty({ description: 'Seçilen seçenek UUID' })
  @IsUUID()
  selectedOptionId!: string;
}
