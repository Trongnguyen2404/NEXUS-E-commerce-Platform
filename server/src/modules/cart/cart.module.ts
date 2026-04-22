import { Module } from '@nestjs/common';
import { CartController } from '@/modules/cart/cart.controller';
import { CartService } from '@/modules/cart/cart.service';
import { PrismaModule } from '@/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
