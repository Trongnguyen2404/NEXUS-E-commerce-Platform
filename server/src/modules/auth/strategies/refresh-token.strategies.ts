import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { PrismaService } from '@/prisma/prisma.service';
import { Request } from 'express';
import * as crypto from 'crypto';
import { REFRESH_TOKEN_COOKIE } from '@/modules/auth/auth.constants';

// Pulls the refresh token out of the httpOnly cookie.
const fromRefreshCookie = (req: Request): string | null =>
  req?.cookies?.[REFRESH_TOKEN_COOKIE] ?? null;

// Validates the refresh cookie against the hash stored on the user.
@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([fromRefreshCookie]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  // Confirms the presented token matches the stored hash.
  async validate(req: Request, payload: { sub: string; email: string }) {
    const refreshToken = fromRefreshCookie(req);

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not provided');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        refreshToken: true,
      },
    });

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const hashedInputToken = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    const storedToken = Buffer.from(user.refreshToken);
    const inputToken = Buffer.from(hashedInputToken);

    const refreshTokenMatches =
      storedToken.length === inputToken.length &&
      crypto.timingSafeEqual(inputToken, storedToken);

    if (!refreshTokenMatches) {
      throw new UnauthorizedException(
        'Invalid refresh does not match stored token',
      );
    }

    return { id: user.id, email: user.email, role: user.role };
  }
}
