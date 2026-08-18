import { Global, Module } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

// Makes the Prisma client available everywhere.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
