// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';

export interface CreateLiveSessionTierInput {
  label: string;
  minParticipants: number;
  maxParticipants?: number | null;
  priceCents: number;
  order?: number;
}

export class CreateLiveSessionTierUseCase {
  async execute(input: CreateLiveSessionTierInput) {
    if (!input.label?.trim()) throw new Error('Paket adi gerekli');
    if (input.priceCents < 0) throw new Error('Fiyat negatif olamaz');
    if (input.minParticipants < 0) throw new Error('Min katilimci negatif olamaz');
    if (input.maxParticipants != null && input.maxParticipants <= input.minParticipants)
      throw new Error('Maks katilimci, min katilimcidan buyuk olmali');
    return prisma.liveSessionTier.create({
      data: {
        label: input.label.trim(),
        minParticipants: input.minParticipants,
        maxParticipants: input.maxParticipants ?? null,
        priceCents: input.priceCents,
        order: input.order ?? 0,
        isActive: true,
      },
    });
  }
}
