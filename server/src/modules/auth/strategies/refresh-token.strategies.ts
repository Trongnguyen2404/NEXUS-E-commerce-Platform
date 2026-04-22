// Refresh Token Strategy
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy,ExtractJwt } from 'passport-jwt';
import { PrismaService } from '@/prisma/prisma.service';
import { Request } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
       
constructor( private configService: ConfigService, private prisma: PrismaService) {
        // THÊM 2 DÒNG LOG NÀY VÀO ĐỂ SOI:
        const secret = configService.get<string>('JWT_REFRESH_SECRET');
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: secret, // Truyền biến vừa log vào đây
            passReqToCallback: true,
        });
    }

    // Validate the refresh token
    async validate(req: Request, payload: { sub: string, email: string }) {
        console.log('Validating refresh token for user:', payload.email);
        console.log('Payload', { sub: payload.sub, email: payload.email });
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            console.log('No authorization header found in the request');
            throw new UnauthorizedException ('Refresh token not provided');
        }

        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
             throw new UnauthorizedException('Invalid authorization header format');
        }   
        const refreshToken = parts[1];

        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token is empty after extraction');
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
        const hashedInputToken = crypto.createHash('sha256').update(refreshToken).digest('hex');

        // 2. So sánh 2 chuỗi Hash với nhau
        const refreshTokenMatches = hashedInputToken === user.refreshToken;

        if (!refreshTokenMatches) {
            throw new UnauthorizedException('Invalid refresh does not match stored token');
        }

        return { id: user.id, email: user.email, role: user.role };
    }
}