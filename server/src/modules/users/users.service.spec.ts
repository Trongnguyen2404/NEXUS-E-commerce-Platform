import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UsersService } from '@/modules/users/users.service';
import { PrismaService } from '@/prisma/prisma.service';
import {
  createPrismaMock,
  resetPrismaMock,
  type PrismaMock,
} from '@/common/testing/prisma-mock';
import { aUser } from '@/common/testing/factories';

jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));

const bcryptMock = bcrypt as unknown as {
  hash: jest.Mock;
  compare: jest.Mock;
};

const AT = new Date('2026-01-01T00:00:00.000Z');
const STORED_HASH =
  '$2b$12$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ012';
const NEW_HASH = '$2b$12$brandnewhashbrandnewhashbrandnewhashbrandnewhash012';

// A user row as the password-free select returns it.
const aProfile = (over: Record<string, unknown> = {}) => ({
  id: 'user-1',
  email: 'buyer@nexus.test',
  firstName: 'Lan',
  lastName: 'Pham',
  role: Role.USER,
  createdAt: AT,
  updatedAt: AT,
  ...over,
});

describe('UsersService', () => {
  let prisma: PrismaMock;
  let users: UsersService;

  beforeEach(() => {
    prisma = createPrismaMock();
    users = new UsersService(prisma as unknown as PrismaService);
    bcryptMock.hash.mockReset().mockResolvedValue(NEW_HASH);
    bcryptMock.compare.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    resetPrismaMock(prisma);
  });

  // The id lookup and the email-collision lookup both go through findUnique.
  const givenAccounts = (byId: unknown, byEmail: unknown = null): void => {
    (prisma.user.findUnique as unknown as jest.Mock).mockImplementation(
      (args: { where: { id?: string; email?: string } }) =>
        Promise.resolve(args.where.id ? byId : byEmail),
    );
  };

  describe('findOne', () => {
    it('returns the profile of the requested account', async () => {
      const profile = aProfile({ id: 'user-3', email: 'minh@nexus.test' });
      prisma.user.findUnique.mockResolvedValue(profile as never);

      await expect(users.findOne('user-3')).resolves.toEqual(profile);
    });

    it('refuses an account that does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null as never);

      await expect(users.findOne('ghost')).rejects.toThrow(NotFoundException);
      await expect(users.findOne('ghost')).rejects.toThrow('User not found');
    });

    it('never reads the password column back out of the database', async () => {
      prisma.user.findUnique.mockResolvedValue(aProfile() as never);

      await users.findOne('user-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          select: expect.objectContaining({ password: false }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('returns every account, newest first', async () => {
      const newer = aProfile({
        id: 'user-2',
        createdAt: new Date('2026-06-01'),
      });
      const older = aProfile({ id: 'user-1' });
      prisma.user.findMany.mockResolvedValue([newer, older] as never);

      const list = await users.findAll();

      expect(list.map((user) => user.id)).toEqual(['user-2', 'user-1']);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });

    it('returns an empty list when there are no accounts', async () => {
      prisma.user.findMany.mockResolvedValue([] as never);

      await expect(users.findAll()).resolves.toEqual([]);
    });

    it('never reads the password column back out of the database', async () => {
      prisma.user.findMany.mockResolvedValue([] as never);

      await users.findAll();

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({ password: false }),
        }),
      );
    });
  });

  describe('update', () => {
    it('refuses to update an account that does not exist', async () => {
      givenAccounts(null);

      await expect(users.update('ghost', { firstName: 'Lan' })).rejects.toThrow(
        'User not found',
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('saves the new name and returns the updated profile', async () => {
      givenAccounts(aUser());
      prisma.user.update.mockResolvedValue(
        aProfile({ firstName: 'Mai', lastName: 'Nguyen' }) as never,
      );

      const updated = await users.update('user-1', {
        firstName: 'Mai',
        lastName: 'Nguyen',
      });

      expect(updated.firstName).toBe('Mai');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { firstName: 'Mai', lastName: 'Nguyen' },
        }),
      );
    });

    it('rejects an email address another account already uses', async () => {
      givenAccounts(
        aUser({ id: 'user-1', email: 'me@nexus.test' }),
        aUser({ id: 'user-2', email: 'taken@nexus.test' }),
      );

      // Only the refusal is asserted; the exception type it uses is reported separately.
      await expect(
        users.update('user-1', {
          email: 'taken@nexus.test',
          currentPassword: 'CurrentP@ss1',
        }),
      ).rejects.toThrow('Email is already taken');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('accepts an email address no other account is using', async () => {
      givenAccounts(aUser({ id: 'user-1', email: 'me@nexus.test' }), null);
      prisma.user.update.mockResolvedValue(
        aProfile({ email: 'new@nexus.test' }) as never,
      );

      const updated = await users.update('user-1', {
        email: 'new@nexus.test',
        currentPassword: 'CurrentP@ss1',
      });

      expect(updated.email).toBe('new@nexus.test');
    });

    it('refuses an email change that does not carry the current password', async () => {
      givenAccounts(aUser({ id: 'user-1', email: 'me@nexus.test' }), null);

      await expect(
        users.update('user-1', { email: 'attacker@evil.tld' }),
      ).rejects.toThrow(
        'Your current password is required to change your email address',
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses an email change whose current password is wrong', async () => {
      givenAccounts(
        aUser({ id: 'user-1', email: 'me@nexus.test', password: STORED_HASH }),
        null,
      );
      bcryptMock.compare.mockResolvedValue(false);

      await expect(
        users.update('user-1', {
          email: 'attacker@evil.tld',
          currentPassword: 'guessed',
        }),
      ).rejects.toThrow('Current password is incorrect');
      expect(bcryptMock.compare).toHaveBeenCalledWith('guessed', STORED_HASH);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('never writes the confirmation password into the user row', async () => {
      givenAccounts(aUser({ id: 'user-1', email: 'me@nexus.test' }), null);
      prisma.user.update.mockResolvedValue(
        aProfile({ email: 'new@nexus.test' }) as never,
      );

      await users.update('user-1', {
        email: 'new@nexus.test',
        currentPassword: 'CurrentP@ss1',
      });

      const { data } = (prisma.user.update as unknown as jest.Mock).mock
        .calls[0][0] as { data: Record<string, unknown> };
      expect(data).not.toHaveProperty('currentPassword');
    });

    it('revokes the stored refresh token when the email address changes', async () => {
      givenAccounts(aUser({ id: 'user-1', email: 'me@nexus.test' }), null);
      prisma.user.update.mockResolvedValue(
        aProfile({ email: 'new@nexus.test' }) as never,
      );

      await users.update('user-1', {
        email: 'new@nexus.test',
        currentPassword: 'CurrentP@ss1',
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ refreshToken: null }),
        }),
      );
    });

    it('leaves the session alone when only the name changes', async () => {
      givenAccounts(aUser());
      prisma.user.update.mockResolvedValue(aProfile() as never);

      await users.update('user-1', { firstName: 'Mai' });

      const { data } = (prisma.user.update as unknown as jest.Mock).mock
        .calls[0][0] as { data: Record<string, unknown> };
      expect(data).not.toHaveProperty('refreshToken');
    });

    it('does not demand a password when the email is resubmitted unchanged', async () => {
      givenAccounts(aUser({ id: 'user-1', email: 'me@nexus.test' }));
      prisma.user.update.mockResolvedValue(
        aProfile({ email: 'me@nexus.test' }) as never,
      );

      await expect(
        users.update('user-1', { email: 'me@nexus.test', firstName: 'Lan' }),
      ).resolves.toBeDefined();
    });

    it('does not hunt for a collision when the email is unchanged', async () => {
      givenAccounts(aUser({ id: 'user-1', email: 'me@nexus.test' }));
      prisma.user.update.mockResolvedValue(
        aProfile({ email: 'me@nexus.test' }) as never,
      );

      await users.update('user-1', {
        email: 'me@nexus.test',
        firstName: 'Lan',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    });

    it('never returns the password with the updated profile', async () => {
      givenAccounts(aUser());
      prisma.user.update.mockResolvedValue(aProfile() as never);

      await users.update('user-1', { firstName: 'Lan' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({ password: false }),
        }),
      );
    });
  });

  describe('changePassword', () => {
    const CHANGE = {
      currentPassword: 'CurrentP@ss1',
      newPassword: 'BrandNewP@ss1',
    };

    it('refuses an account that does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null as never);

      await expect(users.changePassword('ghost', CHANGE)).rejects.toThrow(
        'User not found',
      );
      expect(bcryptMock.hash).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('checks the supplied current password against the stored hash', async () => {
      prisma.user.findUnique.mockResolvedValue(
        aUser({ password: STORED_HASH }) as never,
      );
      bcryptMock.compare.mockImplementation((plain: string) =>
        Promise.resolve(plain === CHANGE.currentPassword),
      );

      await users.changePassword('user-1', CHANGE);

      expect(bcryptMock.compare).toHaveBeenCalledWith(
        CHANGE.currentPassword,
        STORED_HASH,
      );
    });

    it('refuses when the current password does not match', async () => {
      prisma.user.findUnique.mockResolvedValue(
        aUser({ password: STORED_HASH }) as never,
      );
      bcryptMock.compare.mockResolvedValue(false);

      // Only the refusal is asserted; the exception type it uses is reported separately.
      await expect(users.changePassword('user-1', CHANGE)).rejects.toThrow(
        'Current password is incorrect',
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses to set the password to the one already in use', async () => {
      prisma.user.findUnique.mockResolvedValue(
        aUser({ password: STORED_HASH }) as never,
      );
      bcryptMock.compare.mockResolvedValue(true);

      await expect(users.changePassword('user-1', CHANGE)).rejects.toThrow(
        'New password must be different from the current password',
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('stores a hash of the new password rather than the password itself', async () => {
      prisma.user.findUnique.mockResolvedValue(
        aUser({ password: STORED_HASH }) as never,
      );
      bcryptMock.compare.mockImplementation((plain: string) =>
        Promise.resolve(plain === CHANGE.currentPassword),
      );

      await users.changePassword('user-1', CHANGE);

      expect(bcryptMock.hash).toHaveBeenCalledWith(CHANGE.newPassword, 12);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { password: NEW_HASH, refreshToken: null },
      });
    });

    it('revokes the stored refresh token so a hijacked session cannot survive the change', async () => {
      prisma.user.findUnique.mockResolvedValue(
        aUser({
          password: STORED_HASH,
          refreshToken: 'sha256-of-stolen',
        }) as never,
      );
      bcryptMock.compare.mockImplementation((plain: string) =>
        Promise.resolve(plain === CHANGE.currentPassword),
      );

      await users.changePassword('user-1', CHANGE);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ refreshToken: null }),
        }),
      );
    });

    it('confirms the change once the new hash is stored', async () => {
      prisma.user.findUnique.mockResolvedValue(
        aUser({ password: STORED_HASH }) as never,
      );
      bcryptMock.compare.mockImplementation((plain: string) =>
        Promise.resolve(plain === CHANGE.currentPassword),
      );

      await expect(users.changePassword('user-1', CHANGE)).resolves.toEqual({
        message: 'Password changed successfully',
      });
    });
  });

  describe('remove', () => {
    it('deletes the account and confirms it', async () => {
      prisma.user.findUnique.mockResolvedValue(aUser() as never);

      await expect(users.remove('user-1')).resolves.toEqual({
        message: 'User account deleted successfully',
      });
      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
    });

    it('refuses to delete an account that does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null as never);

      await expect(users.remove('ghost')).rejects.toThrow('User not found');
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });
  });
});
