import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { VariantsService } from '@/modules/products/variants.service';
import {
  CreateVariantDto,
  UpdateVariantDto,
  VariantResponseDto,
} from '@/modules/products/dto/variant.dto';
import {
  ModerateThrottle,
  RelaxedThrottle,
} from '@/common/decorators/custom-throttler.decorator';

// Product variant endpoints; writes are admin only.
@ApiTags('products')
@Controller()
export class VariantsController {
  constructor(private readonly variantsService: VariantsService) {}

  // Lists a product's variants.
  @Get('products/:productId/variants')
  @RelaxedThrottle()
  @ApiOperation({ summary: 'Variants available for a product' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiOkResponse({ type: [VariantResponseDto] })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async findAll(@Param('productId') productId: string) {
    return await this.variantsService.findAll(productId);
  }

  // Adds a variant to a product; admin only.
  @Post('products/:productId/variants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ModerateThrottle()
  @ApiOperation({
    summary: '[ADMIN] Add a variant',
    description:
      'Adding the first variant switches the product over: its own price and stock stop being what customers buy against.',
  })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiCreatedResponse({ type: VariantResponseDto })
  @ApiConflictResponse({ description: 'SKU already exists' })
  async create(
    @Param('productId') productId: string,
    @Body() dto: CreateVariantDto,
  ) {
    return await this.variantsService.create(productId, dto);
  }

  // Edits a variant; admin only.
  @Patch('variants/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ModerateThrottle()
  @ApiOperation({ summary: '[ADMIN] Update a variant' })
  @ApiParam({ name: 'id', description: 'Variant ID' })
  @ApiOkResponse({ type: VariantResponseDto })
  @ApiNotFoundResponse({ description: 'Variant not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateVariantDto) {
    return await this.variantsService.update(id, dto);
  }

  // Deletes a variant; admin only.
  @Delete('variants/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ModerateThrottle()
  @ApiOperation({
    summary: '[ADMIN] Delete a variant',
    description:
      'A variant that has been sold is deactivated instead, so past orders keep their meaning. Removing the last one hands control back to the product.',
  })
  @ApiParam({ name: 'id', description: 'Variant ID' })
  @ApiOkResponse({ description: 'Deleted or deactivated' })
  @ApiNotFoundResponse({ description: 'Variant not found' })
  async remove(@Param('id') id: string) {
    return await this.variantsService.remove(id);
  }
}
