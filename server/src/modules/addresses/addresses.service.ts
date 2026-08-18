import { Injectable, NotFoundException } from '@nestjs/common';
import { Address } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  AddressResponseDto,
  CreateAddressDto,
  UpdateAddressDto,
} from '@/modules/addresses/dto/address.dto';

// Reads and writes a user's address book.
@Injectable()
export class AddressesService {
  constructor(private prisma: PrismaService) {}

  // Returns every address the user owns, default first.
  async findAll(userId: string): Promise<AddressResponseDto[]> {
    const addresses = await this.prisma.address.findMany({
      where: { userId },

      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return addresses.map((address) => this.map(address));
  }

  // Creates an address, making it default when it is the first one.
  async create(
    userId: string,
    dto: CreateAddressDto,
  ): Promise<AddressResponseDto> {
    const existingCount = await this.prisma.address.count({
      where: { userId },
    });

    const shouldBeDefault = dto.isDefault ?? existingCount === 0;

    const address = await this.prisma.$transaction(async (tx) => {
      if (shouldBeDefault) await this.clearDefault(tx, userId);

      return tx.address.create({
        data: {
          ...dto,
          country: dto.country ?? 'VN',
          isDefault: shouldBeDefault,
          userId,
        },
      });
    });

    return this.map(address);
  }

  // Updates an address the caller owns.
  async update(
    id: string,
    userId: string,
    dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    await this.mustOwn(id, userId);

    const address = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await this.clearDefault(tx, userId);

      return tx.address.update({ where: { id }, data: dto });
    });

    return this.map(address);
  }

  // Deletes an address and promotes another to default if needed.
  async remove(id: string, userId: string): Promise<{ message: string }> {
    const address = await this.mustOwn(id, userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } });

      if (address.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });
        if (next) {
          await tx.address.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
        }
      }
    });

    return { message: 'Address deleted' };
  }

  // Marks one address default and clears the flag on the rest.
  async setDefault(id: string, userId: string): Promise<AddressResponseDto> {
    await this.mustOwn(id, userId);

    const address = await this.prisma.$transaction(async (tx) => {
      await this.clearDefault(tx, userId);
      return tx.address.update({ where: { id }, data: { isDefault: true } });
    });

    return this.map(address);
  }

  // Loads an address, throwing unless the caller owns it.
  private async mustOwn(id: string, userId: string): Promise<Address> {
    const address = await this.prisma.address.findFirst({
      where: { id, userId },
    });
    if (!address) throw new NotFoundException('Address not found');
    return address;
  }

  // Clears the default flag from the user's other addresses.
  private async clearDefault(
    tx: { address: { updateMany: (args: unknown) => Promise<unknown> } },
    userId: string,
  ): Promise<void> {
    await tx.address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
  }

  // Flattens an address into the single line stored on an order.
  static format(address: Address): string {
    return [
      address.fullName,
      address.phone,
      address.line1,
      address.line2,
      address.city,
      address.state,
      address.postalCode,
      address.country,
    ]
      .filter(Boolean)
      .join(', ');
  }

  // Shapes a database address into its API response.
  private map(address: Address): AddressResponseDto {
    return {
      id: address.id,
      fullName: address.fullName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
      isDefault: address.isDefault,
      formatted: AddressesService.format(address),
      createdAt: address.createdAt,
      updatedAt: address.updatedAt,
    };
  }
}
