import { ConflictException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RegisterDto } from '@/modules/auth/Dto/register.dto';

import { AuthResponseDto } from '@/modules/auth/Dto/auth-responsive.dto';
import * as bcrypt from 'bcrypt';
import { ARRAY_UNIQUE } from 'class-validator';
import { promises } from 'dns';
import { randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from '@/modules/auth/Dto/login.dto';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {

    private readonly SALT_ROUNDS = 12;

    constructor(private prisma: PrismaService, private jwtService: JwtService, private configService: ConfigService) { }

    async register(registerDto: RegisterDto): Promise<AuthResponseDto> {

        const { email, password, firstName, lastName } = registerDto;

        const existingUser = await this.prisma.user.findUnique(
            {
                where: { email },
            });


        if (existingUser) {
            throw new ConflictException('User with this email already exists');
        }

        try {

            const hashedPassword = await bcrypt.hash(password, this.SALT_ROUNDS);

            const user = await this.prisma.user.create(
                {
                    data: {
                        email,
                        password: hashedPassword,
                        firstName,
                        lastName
                    },
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        role: true,
                        password: false,
                    }
                }
            );

            const tokens = await this.generateTokens(user.id, user.email);
            await this.updateRefreshToken(user.id, tokens.refreshToken);

            return {
                user,
                ...tokens,
            };
        } catch (e) {
            console.error('Error during user registration:', e);
            throw new InternalServerErrorException("An error occurred while registering the user", e);
        }
    }

    private async generateTokens(userId: string, email: string): Promise<{ accessToken: string; refreshToken: string }> {
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
            { expiresIn: '7d' }
        );

        return { accessToken, refreshToken };
    }

    // Update the refresh token in the database
    private async updateRefreshToken(userId: string, refreshToken: string): Promise<void> {
        const hashedRefreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
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
                role: true
            }
        });

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        const tokens = await this.generateTokens(user.id, user.email);
        await this.updateRefreshToken(user.id, tokens.refreshToken);

        return {
            ...tokens,
            user,
        }
    }

    //log out
    async logout(userId: string): Promise<void> {
        await this.prisma.user.update({
            where: { id: userId },
            data: { refreshToken: null },
        });
    }

    //login
    async login(loginDto: LoginDto): Promise<AuthResponseDto> {
        const { email, password } = loginDto;

        const user = await this.prisma.user.findUnique({
            where: {
                email
            }
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
                role: user.role
            }
        }
    }
}
