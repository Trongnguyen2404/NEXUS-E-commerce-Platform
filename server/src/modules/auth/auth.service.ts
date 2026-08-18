import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RegisterDto } from '@/modules/auth/Dto/register.dto';

import { AuthResponseDto } from '@/modules/auth/Dto/auth-responsive.dto';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from '@/modules/auth/Dto/login.dto';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { MailService } from '@/modules/mail/mail.service';
import { passwordResetEmail } from '@/modules/mail/mail.templates';
import {
  PASSWORD_RESET_EXPIRY_MINUTES,
  frontendUrl,
} from '@/modules/auth/auth.constants';

// A cost-12 hash of a constant nobody can sign in with. Verified against it
// when the email is unknown so both login outcomes take the same time.
const DUMMY_PASSWORD_HASH =
  '$2b$12$PucbURZRExRT9YLLk6J./OJpLujusAUwKx8UiUO4Cc0M65x39CksO';

// Account creation, sign-in, token rotation and password recovery.
@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 12;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailService: MailService,
  ) {}

  // Creates the account, hashes the password and issues the first token pair.
  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const { email, password, firstName, lastName } = registerDto;

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    try {
      const hashedPassword = await bcrypt.hash(password, this.SALT_ROUNDS);

      const user = await this.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName,
          lastName,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          password: false,
        },
      });

      const tokens = await this.generateTokens(user.id, user.email);
      await this.updateRefreshToken(user.id, tokens.refreshToken);

      return {
        user,
        ...tokens,
      };
    } catch (e) {
      console.error('Error during user registration:', e);
      // The second argument is the client-visible description, not a cause —
      // passing the raw error here would have leaked it into the response.
      throw new InternalServerErrorException(
        'An error occurred while registering the user',
        { cause: e instanceof Error ? e : undefined },
      );
    }
  }

  // Signs a fresh access and refresh token pair.
  private async generateTokens(
    userId: string,
    email: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = { sub: userId, email };
    const refreshId = randomBytes(16).toString('hex');
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET is not defined');
    }

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '15m',
    });

    const refreshToken = jwt.sign({ ...payload, refreshId }, refreshSecret, {
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }

  // Stores the hashed refresh token against the user.
  private async updateRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    const hashedRefreshToken = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashedRefreshToken },
    });
  }

  // Issues a new token pair for a user whose refresh token checked out.
  async refreshTokens(userId: string): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const tokens = await this.generateTokens(user.id, user.email);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      ...tokens,
      user,
    };
  }

  // Revokes the stored refresh token so the session cannot be resumed.
  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
  }

  // Emails a single-use reset link, staying silent about unknown addresses.
  async forgotPassword(email: string): Promise<{ message: string }> {
    const genericResponse = {
      message:
        'If an account exists for that email, a reset link has been sent.',
    };

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      this.logger.log(`Password reset requested for unknown email: ${email}`);
      return genericResponse;
    }

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const rawToken = randomBytes(32).toString('hex');

    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash: this.hashToken(rawToken),
        userId: user.id,
        expiresAt: new Date(
          Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000,
        ),
      },
    });

    const resetUrl = `${frontendUrl()}/reset-password?token=${rawToken}`;
    const template = passwordResetEmail(
      resetUrl,
      PASSWORD_RESET_EXPIRY_MINUTES,
    );

    await this.mailService.send({ to: user.email, ...template });

    return genericResponse;
  }

  // Validates the reset token and replaces the password.
  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
    });

    const invalid = new BadRequestException(
      'This reset link is invalid or has expired',
    );

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw invalid;
    }

    const hashedPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          password: hashedPassword,

          refreshToken: null,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    this.logger.log(`Password reset completed for user ${record.userId}`);

    return { message: 'Your password has been reset. Please sign in again.' };
  }

  // Hashes a token before it is compared with or written to the database.
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // Verifies credentials and issues a token pair.
  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { email, password } = loginDto;

    const user = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });
    // Short-circuiting on `!user` used to skip bcrypt entirely, so an unknown
    // address answered in milliseconds while a real one cost a ~300ms hash —
    // the identical 401 body was still readable on the clock. Spend the same
    // work either way.
    if (!user) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokens(user.id, user.email);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }
}
