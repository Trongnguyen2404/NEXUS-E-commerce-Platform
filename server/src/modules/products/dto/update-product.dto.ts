import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from '@/modules/products/dto/create-product.dto';

// Body for editing a product; every field optional.
export class UpdateProductDto extends PartialType(CreateProductDto) {}
