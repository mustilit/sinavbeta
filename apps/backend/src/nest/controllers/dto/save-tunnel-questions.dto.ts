import { IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Wizard 2 — katman bazlı soru kaydetme. Derin yapı (her soru optionsPerQuestion
 * seçenek + tam 1 doğru) use-case'te doğrulanır; burada yalnız dizi kontrolü.
 * layers: [{ index:number, questions:[{ content, mediaUrl?, options:[{content,isCorrect}] }] }]
 */
export class SaveTunnelQuestionsDto {
  @ApiProperty({ description: 'Katman bazlı sorular', type: 'array', items: { type: 'object' } })
  @IsArray()
  layers!: Array<{
    index: number;
    questions: Array<{
      content: string;
      mediaUrl?: string;
      options: Array<{ content: string; mediaUrl?: string; isCorrect: boolean }>;
    }>;
  }>;
}
