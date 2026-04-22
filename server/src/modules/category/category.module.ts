import { Module } from '@nestjs/common';
import { CategoryController } from '@/modules/category/category.controller';
import { CategoryService } from '@/modules/category/category.service';

@Module({
  controllers: [CategoryController],
  providers: [CategoryService]
})
export class CategoryModule {}
