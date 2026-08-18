import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { AuthService } from '@/modules/auth/auth.service';
import { PASSWORD_RESET_EXPIRY_MINUTES } from '@/modules/auth/auth.constants';
import type { MailService } from '@/modules/mail/mail.service';
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

const REFRESH_SECRET = 'unit-test-refresh-secret';
const BCRYPT_HASH =
  '$2b$12$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ012';

// The refresh guard and the reset-token lookup both recompute this hash, so the
// algorithm is a contract between components, not an implementation detail.
const sha256 = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

// A password reset row as Prisma would hand it back.
const aResetToken = (over: Record<string, unknown> = {}) => ({
  id: 'prt-1',
  tokenHash: sha256('raw-reset-token'),
  expiresAt: new Date(Date.now() + 60_000),
  usedAt: null,
  userId: 'user-1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...over,
});

// The first argument of every recorded call to a mocked prisma delegate.
const argsOf = (fn: unknown): any[] =>
  (fn as jest.Mock).mock.calls.map((call) => call[0]);

// Awaits a call that is expected to reject and hands back the thrown error.
const rejectionOf = async (call: Promise<unknown>): Promise<Error> => {
  let caught: unknown;
  await call.catch((error: unknown) => {
    caught = error;
  });
  expect(caught).toBeInstanceOf(Error);
  return caught as Error;
};

describe('AuthService', () => {
  let prisma: PrismaMock;
  let jwtService: { signAsync: jest.Mock };
  let config: { get: jest.Mock };
  let mail: { send: jest.Mock };
  let auth: AuthService;

  const ENV = { ...process.env };

  beforeEach(() => {
    prisma = createPrismaMock();
    jwtService = { signAsync: jest.fn().mockResolvedValue('access.jwt.token') };
    config = {
      get: jest.fn((key: string) =>
        key === 'JWT_REFRESH_SECRET' ? REFRESH_SECRET : undefined,
      ),
    };
    mail = { send: jest.fn().mockResolvedValue(true) };

    auth = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      config as unknown as ConfigService,
      mail as unknown as MailService,
    );

    bcryptMock.hash.mockReset().mockResolvedValue(BCRYPT_HASH);
    bcryptMock.compare.mockReset().mockResolvedValue(true);

    process.env.FRONTEND_URL = 'https://shop.test';
  });

  afterEach(() => {
    resetPrismaMock(prisma);
    process.env = { ...ENV };
  });

  describe('register', () => {
    const dto = {
      email: 'new@nexus.test',
      password: 'Sup3rSecret!',
      firstName: 'Lan',
      lastName: 'Pham',
    };

    const createdUser = {
      id: 'user-9',
      email: 'new@nexus.test',
      firstName: 'Lan',
      lastName: 'Pham',
      role: Role.USER,
    };

    const givenEmailIsFree = () => {
      prisma.user.findUnique.mockResolvedValue(null as never);
      prisma.user.create.mockResolvedValue(createdUser as never);
    };

    it('refuses an email that already has an account', async () => {
      prisma.user.findUnique.mockResolvedValue(
        aUser({ email: dto.email }) as never,
      );

      const error = await rejectionOf(auth.register(dto));

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.message).toBe('User with this email already exists');
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('hashes the password with 12 rounds and stores the hash, never the plain text', async () => {
      givenEmailIsFree();

      await auth.register(dto);

      expect(bcryptMock.hash).toHaveBeenCalledWith('Sup3rSecret!', 12);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'new@nexus.test',
            password: BCRYPT_HASH,
          }),
        }),
      );
      expect(JSON.stringify(argsOf(prisma.user.create))).not.toContain(
        'Sup3rSecret!',
      );
    });

    it('signs the new account in by returning a token pair and the created user', async () => {
      givenEmailIsFree();

      const result = await auth.register(dto);

      expect(result.accessToken).toBe('access.jwt.token');
      const payload = jwt.verify(
        result.refreshToken,
        REFRESH_SECRET,
      ) as jwt.JwtPayload;
      expect(payload.sub).toBe('user-9');
      expect(payload.email).toBe('new@nexus.test');
      expect(result.user).toEqual(createdUser);
    });

    it('stores only the hash of the new refresh token against the account', async () => {
      givenEmailIsFree();

      const result = await auth.register(dto);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-9' },
        data: { refreshToken: sha256(result.refreshToken) },
      });
      expect(JSON.stringify(argsOf(prisma.user.update))).not.toContain(
        result.refreshToken,
      );
    });
  });

  describe('login', () => {
    const credentials = { email: 'buyer@nexus.test', password: 'hunter2!A' };

    it('rejects an email that has no account', async () => {
      prisma.user.findUnique.mockResolvedValue(null as never);

      const error = await rejectionOf(auth.login(credentials));

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.message).toBe('Invalid email or password');
    });

    it('rejects a password that does not match the stored hash', async () => {
      prisma.user.findUnique.mockResolvedValue(aUser() as never);
      bcryptMock.compare.mockResolvedValue(false);

      const error = await rejectionOf(auth.login(credentials));

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.message).toBe('Invalid email or password');
    });

    it('gives an unknown email and a wrong password the identical error so accounts cannot be enumerated', async () => {
      prisma.user.findUnique.mockResolvedValue(null as never);
      const unknownEmail = await rejectionOf(auth.login(credentials));

      prisma.user.findUnique.mockResolvedValue(aUser() as never);
      bcryptMock.compare.mockResolvedValue(false);
      const wrongPassword = await rejectionOf(auth.login(credentials));

      expect(unknownEmail.message).toBe(wrongPassword.message);
      expect(unknownEmail.constructor).toBe(wrongPassword.constructor);
      expect((unknownEmail as UnauthorizedException).getStatus()).toBe(
        (wrongPassword as UnauthorizedException).getStatus(),
      );
    });

    // Skipping bcrypt for an unknown address answered in milliseconds while a
    // real one cost a full cost-12 verification, so the identical 401 could be
    // told apart on the clock.
    it('still spends a bcrypt verification when the email has no account', async () => {
      prisma.user.findUnique.mockResolvedValue(null as never);

      await rejectionOf(auth.login(credentials));

      expect(bcryptMock.compare).toHaveBeenCalledTimes(1);
      const [submitted, against] = bcryptMock.compare.mock.calls[0] as [
        string,
        string,
      ];
      expect(submitted).toBe(credentials.password);
      expect(against).toMatch(/^\$2[aby]\$12\$/);
    });

    it('does the same amount of hashing whether or not the account exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null as never);
      await rejectionOf(auth.login(credentials));
      const forUnknownEmail = bcryptMock.compare.mock.calls.length;

      bcryptMock.compare.mockClear();
      prisma.user.findUnique.mockResolvedValue(aUser() as never);
      bcryptMock.compare.mockResolvedValue(false);
      await rejectionOf(auth.login(credentials));

      expect(forUnknownEmail).toBe(bcryptMock.compare.mock.calls.length);
    });

    it('compares the submitted password against the stored hash', async () => {
      prisma.user.findUnique.mockResolvedValue(
        aUser({ password: 'stored-hash' }) as never,
      );

      await auth.login(credentials);

      expect(bcryptMock.compare).toHaveBeenCalledWith(
        'hunter2!A',
        'stored-hash',
      );
    });

    it('returns the signed-in user without the password hash', async () => {
      prisma.user.findUnique.mockResolvedValue(
        aUser({ password: 'stored-hash' }) as never,
      );

      const result = await auth.login(credentials);

      expect(result.user).toEqual({
        id: 'user-1',
        email: 'buyer@nexus.test',
        firstName: 'Lan',
        lastName: 'Pham',
        role: Role.USER,
      });
      expect(result.user).not.toHaveProperty('password');
      expect(JSON.stringify(result)).not.toContain('stored-hash');
    });

    it('stores the hash of the refresh token it just issued', async () => {
      prisma.user.findUnique.mockResolvedValue(aUser() as never);

      const result = await auth.login(credentials);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshToken: sha256(result.refreshToken) },
      });
    });
  });

  describe('token issuance', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(aUser() as never);
    });

    it('signs the access token for the user with a fifteen minute expiry', async () => {
      await auth.login({ email: 'buyer@nexus.test', password: 'pw' });

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        { sub: 'user-1', email: 'buyer@nexus.test' },
        { expiresIn: '15m' },
      );
    });

    it('signs a refresh token that carries the user id, email and a random id', async () => {
      const result = await auth.login({
        email: 'buyer@nexus.test',
        password: 'pw',
      });

      const payload = jwt.verify(
        result.refreshToken,
        REFRESH_SECRET,
      ) as jwt.JwtPayload;
      expect(payload.sub).toBe('user-1');
      expect(payload.email).toBe('buyer@nexus.test');
      expect(payload.refreshId).toMatch(/^[a-f0-9]{32}$/);
    });

    it('signs the refresh token with the refresh secret, so another key cannot verify it', async () => {
      const result = await auth.login({
        email: 'buyer@nexus.test',
        password: 'pw',
      });

      expect(() =>
        jwt.verify(result.refreshToken, 'some-other-secret'),
      ).toThrow(/invalid signature/);
    });

    it('issues a different refresh token on every sign-in so an old one cannot be replayed', async () => {
      const first = await auth.login({
        email: 'buyer@nexus.test',
        password: 'pw',
      });
      const second = await auth.login({
        email: 'buyer@nexus.test',
        password: 'pw',
      });

      expect(second.refreshToken).not.toBe(first.refreshToken);
      const stored = argsOf(prisma.user.update).map(
        (args) => args.data.refreshToken,
      );
      expect(stored[1]).not.toBe(stored[0]);
      expect(stored[1]).toBe(sha256(second.refreshToken));
    });

    it('refuses to issue tokens when JWT_REFRESH_SECRET is not configured', async () => {
      config.get.mockReturnValue(undefined);

      await expect(auth.refreshTokens('user-1')).rejects.toThrow(
        'JWT_REFRESH_SECRET is not defined',
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('refreshTokens', () => {
    it('rejects a user id that no longer exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null as never);

      const error = await rejectionOf(auth.refreshTokens('ghost'));

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.message).toBe('User not found');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rotates the stored hash to the newly issued refresh token', async () => {
      prisma.user.findUnique.mockResolvedValue(
        aUser({ refreshToken: sha256('the-old-token') }) as never,
      );

      const result = await auth.refreshTokens('user-1');

      expect(result.accessToken).toBe('access.jwt.token');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshToken: sha256(result.refreshToken) },
      });
      expect(argsOf(prisma.user.update)[0].data.refreshToken).not.toBe(
        sha256('the-old-token'),
      );
    });

    it('never reads the password column while refreshing a session', async () => {
      prisma.user.findUnique.mockResolvedValue(aUser() as never);

      await auth.refreshTokens('user-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      });
    });
  });

  describe('logout', () => {
    it('revokes the stored refresh token for that user', async () => {
      await auth.logout('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshToken: null },
      });
    });
  });

  describe('forgotPassword', () => {
    const GENERIC =
      'If an account exists for that email, a reset link has been sent.';

    it('answers an unknown email with exactly the same message as a known one', async () => {
      prisma.user.findUnique.mockResolvedValue(aUser() as never);
      const known = await auth.forgotPassword('buyer@nexus.test');

      prisma.user.findUnique.mockResolvedValue(null as never);
      const unknown = await auth.forgotPassword('nobody@nexus.test');

      expect(known.message).toBe(GENERIC);
      expect(unknown).toEqual(known);
    });

    it('creates no reset token and sends no email for an unknown address', async () => {
      prisma.user.findUnique.mockResolvedValue(null as never);

      await auth.forgotPassword('nobody@nexus.test');

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('emails the raw token but stores only its hash', async () => {
      prisma.user.findUnique.mockResolvedValue(aUser() as never);

      await auth.forgotPassword('buyer@nexus.test');

      const sent = mail.send.mock.calls[0][0];
      const rawToken = /token=([a-f0-9]{64})/.exec(sent.text)?.[1];
      expect(rawToken).toBeDefined();

      expect(prisma.passwordResetToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tokenHash: sha256(rawToken as string),
            userId: 'user-1',
          }),
        }),
      );
      expect(
        JSON.stringify(argsOf(prisma.passwordResetToken.create)),
      ).not.toContain(rawToken);
    });

    it('sends the reset link to the address on the account', async () => {
      prisma.user.findUnique.mockResolvedValue(
        aUser({ email: 'buyer@nexus.test' }) as never,
      );

      await auth.forgotPassword('buyer@nexus.test');

      const sent = mail.send.mock.calls[0][0];
      expect(sent.to).toBe('buyer@nexus.test');
      expect(sent.subject).toBe('Reset your NEXUS password');
      expect(sent.html).toContain('https://shop.test/reset-password?token=');
    });

    it('invalidates every reset token still outstanding before issuing a new one', async () => {
      prisma.user.findUnique.mockResolvedValue(aUser() as never);

      await auth.forgotPassword('buyer@nexus.test');

      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('expires the new token PASSWORD_RESET_EXPIRY_MINUTES from now', async () => {
      prisma.user.findUnique.mockResolvedValue(aUser() as never);
      const lifetimeMs = PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000;

      const before = Date.now();
      await auth.forgotPassword('buyer@nexus.test');
      const after = Date.now();

      const expiresAt = new Date(
        argsOf(prisma.passwordResetToken.create)[0].data.expiresAt,
      ).getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(before + lifetimeMs);
      expect(expiresAt).toBeLessThanOrEqual(after + lifetimeMs);
    });
  });

  describe('resetPassword', () => {
    const INVALID = 'This reset link is invalid or has expired';

    it('rejects a token that was never issued', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null as never);

      const error = await rejectionOf(
        auth.resetPassword('made-up-token', 'BrandNewP@ss1'),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe(INVALID);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects a token that has already been spent', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(
        aResetToken({ usedAt: new Date('2026-01-02T00:00:00.000Z') }) as never,
      );

      const error = await rejectionOf(
        auth.resetPassword('raw-reset-token', 'BrandNewP@ss1'),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe(INVALID);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects a token whose expiry has passed', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(
        aResetToken({ expiresAt: new Date(Date.now() - 1000) }) as never,
      );

      const error = await rejectionOf(
        auth.resetPassword('raw-reset-token', 'BrandNewP@ss1'),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe(INVALID);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('accepts a token that still has a second left to live', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(
        aResetToken({ expiresAt: new Date(Date.now() + 1000) }) as never,
      );

      await expect(
        auth.resetPassword('raw-reset-token', 'BrandNewP@ss1'),
      ).resolves.toEqual({
        message: 'Your password has been reset. Please sign in again.',
      });
    });

    it('looks the token up by its hash, never by the raw value', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(
        aResetToken() as never,
      );

      await auth.resetPassword('raw-reset-token', 'BrandNewP@ss1');

      expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: sha256('raw-reset-token') },
      });
      expect(
        JSON.stringify(argsOf(prisma.passwordResetToken.findUnique)),
      ).not.toContain('raw-reset-token');
    });

    it('replaces the password with a fresh hash and revokes the open session', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(
        aResetToken({ userId: 'user-7' }) as never,
      );
      bcryptMock.hash.mockResolvedValue('$2b$12$brandnewhash');

      await auth.resetPassword('raw-reset-token', 'BrandNewP@ss1');

      expect(bcryptMock.hash).toHaveBeenCalledWith('BrandNewP@ss1', 12);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-7' },
        data: { password: '$2b$12$brandnewhash', refreshToken: null },
      });
      expect(JSON.stringify(argsOf(prisma.user.update))).not.toContain(
        'BrandNewP@ss1',
      );
    });

    it('burns the token in the same transaction as the password change so it works only once', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(
        aResetToken() as never,
      );

      await auth.resetPassword('raw-reset-token', 'BrandNewP@ss1');

      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'prt-1' },
        data: { usedAt: expect.any(Date) },
      });
      // Both writes are handed to one $transaction call, so the token cannot
      // end up spent while the password change rolls back.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(argsOf(prisma.$transaction)[0]).toHaveLength(2);
    });
  });

  describe('token hashing', () => {
    it('hashes the same token to the same value on every call', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null as never);

      await rejectionOf(auth.resetPassword('repeatable', 'BrandNewP@ss1'));
      await rejectionOf(auth.resetPassword('repeatable', 'BrandNewP@ss1'));

      const [first, second] = argsOf(prisma.passwordResetToken.findUnique);
      expect(first.where.tokenHash).toBe(second.where.tokenHash);
      expect(first.where.tokenHash).toBe(sha256('repeatable'));
    });

    it('hashes different tokens to different values', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null as never);

      await rejectionOf(auth.resetPassword('token-a', 'BrandNewP@ss1'));
      await rejectionOf(auth.resetPassword('token-b', 'BrandNewP@ss1'));

      const [first, second] = argsOf(prisma.passwordResetToken.findUnique);
      expect(first.where.tokenHash).not.toBe(second.where.tokenHash);
    });
  });
});
