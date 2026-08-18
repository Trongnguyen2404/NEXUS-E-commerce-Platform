import { PartialType } from '@nestjs/swagger';
import { CreateCategoryDto } from '@/modules/category/dto/create-category.dto';

// Body for editing a category; every field optional.
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
