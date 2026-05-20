// @ts-nocheck
export class ListMarketplaceTestsResponseDto {
  items!: Array<{
    id: string;
    title?: string;
    priceCents?: number;
  }>;
  meta?: { nextCursor?: string };
}

