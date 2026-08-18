import { NotFoundException } from '@nestjs/common';
import type { Address } from '@prisma/client';
import { AddressesService } from '@/modules/addresses/addresses.service';
import { PrismaService } from '@/prisma/prisma.service';
import {
  createPrismaMock,
  resetPrismaMock,
  type PrismaMock,
} from '@/common/testing/prisma-mock';
import { anAddress } from '@/common/testing/factories';
import type { CreateAddressDto } from '@/modules/addresses/dto/address.dto';

// An address row exactly as Prisma would hand it back.
const addr = (over: Record<string, unknown> = {}): Address =>
  anAddress(over) as unknown as Address;

// The minimum a caller has to send to save a new address.
const NEW_ADDRESS: CreateAddressDto = {
  fullName: 'Lan Pham',
  phone: '0900000000',
  line1: '1 Test St',
  city: 'Ho Chi Minh',
  postalCode: '700000',
};

describe('AddressesService', () => {
  let prisma: PrismaMock;
  let addresses: AddressesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    addresses = new AddressesService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    resetPrismaMock(prisma);
  });

  // Inserts echo back the row they were asked to store, the way a real one would.
  const echoCreate = (): void => {
    (prisma.address.create as unknown as jest.Mock).mockImplementation(
      (args: { data: Record<string, unknown> }) =>
        Promise.resolve(addr(args.data)),
    );
  };

  // Gives the caller one address they own; anything else looked up is not theirs.
  const givenOwned = (over: Record<string, unknown> = {}): Address => {
    const owned = addr({ id: 'addr-1', userId: 'user-1', ...over });

    (prisma.address.findFirst as unknown as jest.Mock).mockImplementation(
      (args: { where: { id?: string } }) =>
        Promise.resolve(args.where.id === owned.id ? owned : null),
    );
    (prisma.address.update as unknown as jest.Mock).mockImplementation(
      (args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...owned, ...args.data }),
    );

    return owned;
  };

  describe('findAll', () => {
    it('asks the database for the default address first and the newest after it', async () => {
      prisma.address.findMany.mockResolvedValue([] as never);

      await addresses.findAll('user-7');

      expect(prisma.address.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-7' },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });
    });

    it('returns an empty address book for a user who has saved nothing', async () => {
      prisma.address.findMany.mockResolvedValue([] as never);
      await expect(addresses.findAll('user-1')).resolves.toEqual([]);
    });

    it('returns every saved address in the order the database gave them', async () => {
      prisma.address.findMany.mockResolvedValue([
        addr({ id: 'addr-1', isDefault: true }),
        addr({ id: 'addr-2', isDefault: false }),
      ] as never);

      const book = await addresses.findAll('user-1');

      expect(book.map((entry) => entry.id)).toEqual(['addr-1', 'addr-2']);
      expect(book[0].isDefault).toBe(true);
    });

    it('renders each address as a single line alongside its fields', async () => {
      prisma.address.findMany.mockResolvedValue([
        addr({ fullName: 'Minh Tran', line2: null, state: null }),
      ] as never);

      const [entry] = await addresses.findAll('user-1');

      expect(entry.formatted).toBe(
        'Minh Tran, 0900000000, 1 Test St, Ho Chi Minh, 700000, Vietnam',
      );
    });

    it('keeps the owning user id out of the response', async () => {
      prisma.address.findMany.mockResolvedValue([addr()] as never);

      const [entry] = await addresses.findAll('user-1');

      expect(entry).not.toHaveProperty('userId');
    });
  });

  describe('create', () => {
    it('makes the very first address the default one', async () => {
      prisma.address.count.mockResolvedValue(0 as never);
      echoCreate();

      const created = await addresses.create('user-1', NEW_ADDRESS);

      expect(created.isDefault).toBe(true);
    });

    it('leaves a later address non-default unless the caller asks for it', async () => {
      prisma.address.count.mockResolvedValue(1 as never);
      echoCreate();

      const created = await addresses.create('user-1', NEW_ADDRESS);

      expect(created.isDefault).toBe(false);
      expect(prisma.address.updateMany).not.toHaveBeenCalled();
    });

    it('demotes the previous default when a new address is created as default', async () => {
      prisma.address.count.mockResolvedValue(3 as never);
      echoCreate();

      const created = await addresses.create('user-1', {
        ...NEW_ADDRESS,
        isDefault: true,
      });

      expect(created.isDefault).toBe(true);
      expect(prisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true },
        data: { isDefault: false },
      });
    });

    it('files the new address under the calling user', async () => {
      prisma.address.count.mockResolvedValue(0 as never);
      echoCreate();

      await addresses.create('user-9', NEW_ADDRESS);

      expect(prisma.address.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'user-9' }),
      });
    });

    it('counts only the calling user addresses when deciding on the default', async () => {
      prisma.address.count.mockResolvedValue(0 as never);
      echoCreate();

      await addresses.create('user-9', NEW_ADDRESS);

      expect(prisma.address.count).toHaveBeenCalledWith({
        where: { userId: 'user-9' },
      });
    });

    it('defaults the country to VN when the body leaves it out', async () => {
      prisma.address.count.mockResolvedValue(0 as never);
      echoCreate();

      const created = await addresses.create('user-1', NEW_ADDRESS);

      expect(created.country).toBe('VN');
    });

    it('keeps the country the caller supplied', async () => {
      prisma.address.count.mockResolvedValue(0 as never);
      echoCreate();

      const created = await addresses.create('user-1', {
        ...NEW_ADDRESS,
        country: 'JP',
      });

      expect(created.country).toBe('JP');
    });

    it('returns the saved address rendered as a single line', async () => {
      prisma.address.count.mockResolvedValue(0 as never);
      echoCreate();

      const created = await addresses.create('user-1', {
        ...NEW_ADDRESS,
        line2: 'Apartment 4B',
        state: 'District 1',
      });

      expect(created.formatted).toBe(
        'Lan Pham, 0900000000, 1 Test St, Apartment 4B, Ho Chi Minh, District 1, 700000, VN',
      );
    });
  });

  describe('update', () => {
    it('refuses an address that belongs to somebody else', async () => {
      givenOwned({ id: 'addr-1' });

      await expect(
        addresses.update('addr-2', 'user-1', { city: 'Hue' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('says the address was not found rather than admitting it is someone else', async () => {
      givenOwned({ id: 'addr-1' });

      await expect(
        addresses.update('addr-2', 'user-1', { city: 'Hue' }),
      ).rejects.toThrow('Address not found');
    });

    it('writes nothing when the caller does not own the address', async () => {
      (prisma.address.findFirst as unknown as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        addresses.update('addr-1', 'intruder', { city: 'Hue' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.address.update).not.toHaveBeenCalled();
    });

    it('scopes the ownership lookup to the id and the owner together', async () => {
      givenOwned();

      await addresses.update('addr-1', 'user-1', { city: 'Hue' });

      expect(prisma.address.findFirst).toHaveBeenCalledWith({
        where: { id: 'addr-1', userId: 'user-1' },
      });
    });

    it('applies the changed fields and re-renders the single line', async () => {
      givenOwned({ city: 'Ho Chi Minh', line2: null });

      const updated = await addresses.update('addr-1', 'user-1', {
        city: 'Da Nang',
        line2: 'Apartment 4B',
      });

      expect(updated.city).toBe('Da Nang');
      expect(updated.formatted).toContain('Apartment 4B, Da Nang');
    });

    it('demotes the previous default when the update promotes this address', async () => {
      givenOwned({ isDefault: false });

      const updated = await addresses.update('addr-1', 'user-1', {
        isDefault: true,
      });

      expect(prisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true },
        data: { isDefault: false },
      });
      expect(updated.isDefault).toBe(true);
    });

    it('leaves the other addresses alone when the update does not mention the default flag', async () => {
      givenOwned();

      await addresses.update('addr-1', 'user-1', { phone: '0911111111' });

      expect(prisma.address.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('refuses to delete an address that belongs to somebody else', async () => {
      (prisma.address.findFirst as unknown as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(addresses.remove('addr-1', 'intruder')).rejects.toThrow(
        'Address not found',
      );
      expect(prisma.address.delete).not.toHaveBeenCalled();
    });

    it('deletes the address and confirms it', async () => {
      givenOwned({ isDefault: false });

      await expect(addresses.remove('addr-1', 'user-1')).resolves.toEqual({
        message: 'Address deleted',
      });
      expect(prisma.address.delete).toHaveBeenCalledWith({
        where: { id: 'addr-1' },
      });
    });

    it('promotes the newest remaining address when the deleted one was the default', async () => {
      const owned = addr({ id: 'addr-1', isDefault: true });
      const survivor = addr({ id: 'addr-2', isDefault: false });
      // mustOwn looks up by id; the search for a replacement does not.
      (prisma.address.findFirst as unknown as jest.Mock).mockImplementation(
        (args: { where: { id?: string } }) =>
          Promise.resolve(args.where.id ? owned : survivor),
      );

      await addresses.remove('addr-1', 'user-1');

      expect(prisma.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-2' },
        data: { isDefault: true },
      });
    });

    it('looks for the replacement default only among the same user addresses', async () => {
      const owned = addr({ id: 'addr-1', isDefault: true });
      (prisma.address.findFirst as unknown as jest.Mock).mockImplementation(
        (args: { where: { id?: string } }) =>
          Promise.resolve(args.where.id ? owned : null),
      );

      await addresses.remove('addr-1', 'user-1');

      expect(prisma.address.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('promotes nobody when the deleted default was the last address left', async () => {
      const owned = addr({ id: 'addr-1', isDefault: true });
      (prisma.address.findFirst as unknown as jest.Mock).mockImplementation(
        (args: { where: { id?: string } }) =>
          Promise.resolve(args.where.id ? owned : null),
      );

      await expect(addresses.remove('addr-1', 'user-1')).resolves.toEqual({
        message: 'Address deleted',
      });
      expect(prisma.address.update).not.toHaveBeenCalled();
    });

    it('does not disturb the default when the deleted address was not the default', async () => {
      givenOwned({ isDefault: false });

      await addresses.remove('addr-1', 'user-1');

      expect(prisma.address.update).not.toHaveBeenCalled();
    });
  });

  describe('setDefault', () => {
    it('refuses an address that belongs to somebody else', async () => {
      (prisma.address.findFirst as unknown as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(addresses.setDefault('addr-1', 'intruder')).rejects.toThrow(
        'Address not found',
      );
      expect(prisma.address.update).not.toHaveBeenCalled();
    });

    it('marks the chosen address as the default and returns it', async () => {
      givenOwned({ isDefault: false });

      const promoted = await addresses.setDefault('addr-1', 'user-1');

      expect(promoted.isDefault).toBe(true);
      expect(prisma.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-1' },
        data: { isDefault: true },
      });
    });

    it('clears the flag from the caller other addresses and nobody else', async () => {
      givenOwned({ isDefault: false });

      await addresses.setDefault('addr-1', 'user-1');

      expect(prisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true },
        data: { isDefault: false },
      });
    });
  });

  describe('format', () => {
    it('joins the address into one comma-separated line in postal order', () => {
      expect(
        AddressesService.format(
          addr({ line2: 'Apartment 4B', state: 'District 1' }),
        ),
      ).toBe(
        'Lan Pham, 0900000000, 1 Test St, Apartment 4B, Ho Chi Minh, District 1, 700000, Vietnam',
      );
    });

    it('skips the optional lines that were never filled in', () => {
      expect(AddressesService.format(addr({ line2: null, state: null }))).toBe(
        'Lan Pham, 0900000000, 1 Test St, Ho Chi Minh, 700000, Vietnam',
      );
    });

    it('leaves no empty gap for a field saved as a blank string', () => {
      expect(AddressesService.format(addr({ line2: '', state: '' }))).toBe(
        'Lan Pham, 0900000000, 1 Test St, Ho Chi Minh, 700000, Vietnam',
      );
    });
  });
});
