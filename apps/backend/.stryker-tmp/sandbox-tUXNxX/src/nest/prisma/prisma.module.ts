// @ts-nocheck
import { Global, Module } from '@nestjs/common';
import { prisma } from '../../infrastructure/database/prisma';
import { PrismaService } from '../modules/prisma/prisma.service';

@Global()
@Module({
  providers: [
    {
      provide: 'PRISMA',
      useValue: prisma,
    },
    {
      provide: PrismaService,
      useFactory: (p: any) => new PrismaService(p),
      inject: ['PRISMA'],
    },
  ],
  exports: ['PRISMA', PrismaService],
})
export class PrismaModule {}

