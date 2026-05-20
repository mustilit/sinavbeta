// @ts-nocheck
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Delete the incorrect review (for a test not purchased by candidate)
  await (prisma as any).review.delete({ where: { id: '3d1c4658-5c0f-44d8-a797-425d2f18bb60' } });
  console.log('Deleted incorrect review');

  // Create review for YDS-1 which candidate actually purchased + submitted
  const educatorId = '91cb6e98-734f-44a5-a55a-295e4498c541';
  const candidateId = 'd0c888ca-45e7-4773-ab7b-7698504fe71b';
  const testId = 'cd514da8-2153-46b1-86c2-048f2bd395c2'; // YDS-1 (purchased + submitted)

  const review = await (prisma as any).review.create({
    data: {
      testId,
      educatorId,
      candidateId,
      testRating: 5,
      educatorRating: 5,
      comment: 'Çok faydalı bir test, hocam harika anlatıyor!',
    },
  });
  console.log('Created review for YDS-1:', JSON.stringify(review, null, 2));

  // Verify
  const all = await (prisma as any).review.findMany({ where: { educatorId } });
  console.log('All reviews for educator@demo:', all.length, JSON.stringify(all, null, 2));
}

main().catch(e => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
