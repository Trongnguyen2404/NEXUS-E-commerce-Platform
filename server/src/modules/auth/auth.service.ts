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
      throw new InternalServerErrorException(
        'An error occurred while registering the user',
        e,
      );
    }
  }

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
    // 1. Dùng NestJS JWT tạo Access Token (Nó tự lấy JWT_SECRET chuẩn)
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '15m',
    });

    // 2. Dùng jwt gốc tạo Refresh Token ĐỂ ÉP NÓ DÙNG ĐÚNG refreshSecret
    const refreshToken = jwt.sign(
      { ...payload, refreshId },
      refreshSecret, // Truyền trực tiếp chìa khóa vào đây, không thể sai lệch được nữa
      { expiresIn: '7d' },
    );

    return { accessToken, refreshToken };
  }

  // Update the refresh token in the database
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

  // Refresh access token
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

  //log out
  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
  }

  /**
   * Starts a password reset.
   *
   * Always reports success, even for an address that has no account: a
   * different response for "unknown email" would turn this endpoint into a
   * way to enumerate who has registered.
   */
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

    // Any earlier link stops working the moment a new one is requested.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    // The raw token only ever exists here and in the email; the database
    // holds nothing but its hash.
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

  /** Completes a reset. The token is single-use and expires. */
  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
    });

    // One message for missing, already-used and expired alike — no hint
    // about which token strings happen to exist.
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
          // Whoever triggered the reset may have been locked out by an
          // attacker holding a live session. Killing the stored refresh
          // token logs every device out.
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

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  //login
  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { email, password } = loginDto;

    const user = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });
    if (!user || !(await bcrypt.compare(password, user.password))) {
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
