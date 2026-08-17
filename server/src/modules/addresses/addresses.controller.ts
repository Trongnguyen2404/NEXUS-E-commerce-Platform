import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { GetUser } from '@/common/decorators/get-user.decorator';
import { AddressesService } from '@/modules/addresses/addresses.service';
import {
  AddressResponseDto,
  CreateAddressDto,
  UpdateAddressDto,
} from '@/modules/addresses/dto/address.dto';
import {
  ModerateThrottle,
  RelaxedThrottle,
} from '@/common/decorators/custom-throttler.decorator';

@ApiTags('addresses')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  @RelaxedThrottle()
  @ApiOperation({ summary: 'Your saved addresses, default first' })
  @ApiOkResponse({ type: [AddressResponseDto] })
  async findAll(@GetUser('id') userId: string) {
    return await this.addressesService.findAll(userId);
  }

  @Post()
  @ModerateThrottle()
  @ApiOperation({
    summary: 'Save a new address',
    description: 'The first address saved becomes the default automatically.',
  })
  @ApiCreatedResponse({ type: AddressResponseDto })
  async create(@Body() dto: CreateAddressDto, @GetUser('id') userId: string) {
    return await this.addressesService.create(userId, dto);
  }

  @Patch(':id/default')
  @ModerateThrottle()
  @ApiOperation({ summary: 'Make this your default shipping address' })
  @ApiParam({ name: 'id', description: 'Address ID' })
  @ApiOkResponse({ type: AddressResponseDto })
  @ApiNotFoundResponse({ description: 'Address not found' })
  async setDefault(@Param('id') id: string, @GetUser('id') userId: string) {
    return await this.addressesService.setDefault(id, userId);
  }

  @Patch(':id')
  @ModerateThrottle()
  @ApiOperation({ summary: 'Update a saved address' })
  @ApiParam({ name: 'id', description: 'Address ID' })
  @ApiOkResponse({ type: AddressResponseDto })
  @ApiNotFoundResponse({ description: 'Address not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
    @GetUser('id') userId: string,
  ) {
    return await this.addressesService.update(id, userId, dto);
  }

  @Delete(':id')
  @ModerateThrottle()
  @ApiOperation({
    summary: 'Delete a saved address',
    description: 'Deleting the default promotes the next address to default.',
  })
  @ApiParam({ name: 'id', description: 'Address ID' })
  @ApiOkResponse({ description: 'Address deleted' })
  @ApiNotFoundResponse({ description: 'Address not found' })
  async remove(@Param('id') id: string, @GetUser('id') userId: string) {
    return await this.addressesService.remove(id, userId);
  }
}
