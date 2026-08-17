// Refresh Token Strategy
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { PrismaService } from '@/prisma/prisma.service';
import { Request } from 'express';
import * as crypto from 'crypto';
import { REFRESH_TOKEN_COOKIE } from '@/modules/auth/auth.constants';

// The token lives in an httpOnly cookie, never in a header the browser's
// JavaScript could set — that is the whole point of moving it off localStorage.
const fromRefreshCookie = (req: Request): string | null =>
  req?.cookies?.[REFRESH_TOKEN_COOKIE] ?? null;

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

  // Validate the refresh token
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

    // So sánh 2 chuỗi Hash với nhau. timingSafeEqual throws on a length
    // mismatch, so that case is ruled out first.
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
