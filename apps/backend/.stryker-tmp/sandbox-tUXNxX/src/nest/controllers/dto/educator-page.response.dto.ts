/** Eğitici profil sayfası yanıt DTO'su */
// @ts-nocheck

export class EducatorPageResponseDto {
  id!: string;
  name?: string;
  bio?: string;
  stats?: { testsCount?: number; rating?: number };
}
