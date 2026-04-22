import { Module } from '@nestjs/common';
import { ProductsController } from '@/modules/products/products.controller';
import { ProductsService } from '@/modules/products/products.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService]
})
export class ProductsModule { }
