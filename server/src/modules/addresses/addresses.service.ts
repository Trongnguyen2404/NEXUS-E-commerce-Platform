import { Injectable, NotFoundException } from '@nestjs/common';
import { Address } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  AddressResponseDto,
  CreateAddressDto,
  UpdateAddressDto,
} from '@/modules/addresses/dto/address.dto';

@Injectable()
export class AddressesService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string): Promise<AddressResponseDto[]> {
    const addresses = await this.prisma.address.findMany({
      where: { userId },
      // Default first, then newest — the one checkout preselects sits on top.
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return addresses.map((address) => this.map(address));
  }

  async create(
    userId: string,
    dto: CreateAddressDto,
  ): Promise<AddressResponseDto> {
    const existingCount = await this.prisma.address.count({
      where: { userId },
    });
    // The first address saved is the default whether or not it was asked for,
    // otherwise checkout has nothing to preselect.
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

  async remove(id: string, userId: string): Promise<{ message: string }> {
    const address = await this.mustOwn(id, userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } });

      // Deleting the default promotes the next one, so the account never ends
      // up with several addresses and no default.
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

  async setDefault(id: string, userId: string): Promise<AddressResponseDto> {
    await this.mustOwn(id, userId);

    const address = await this.prisma.$transaction(async (tx) => {
      await this.clearDefault(tx, userId);
      return tx.address.update({ where: { id }, data: { isDefault: true } });
    });

    return this.map(address);
  }

  /** Orders reference addresses by id, so ownership has to be proven first. */
  private async mustOwn(id: string, userId: string): Promise<Address> {
    const address = await this.prisma.address.findFirst({
      where: { id, userId },
    });
    if (!address) throw new NotFoundException('Address not found');
    return address;
  }

  private async clearDefault(
    tx: { address: { updateMany: (args: unknown) => Promise<unknown> } },
    userId: string,
  ): Promise<void> {
    await tx.address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
  }

  /** Must match OrdersService.formatAddress — both render the same snapshot. */
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
