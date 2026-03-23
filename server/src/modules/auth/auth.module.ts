import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { Prisma } from '@prisma/client';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategies';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategies';

@Module({
	imports: [
		PassportModule.register({ defaultStrategy: 'jwt' }),
		JwtModule.registerAsync({
			inject: [ConfigService],
			useFactory: (ConfigService: ConfigService) => ({
				secret: ConfigService.get<string>('JWT_SECRET') ?? 'defaultSecret2026',
				signOptions: {
					expiresIn: Number(ConfigService.get<number>('JWT_EXPIRES_IN', 900))
				},
			}),
		}),
	],
	providers: [AuthService, JwtStrategy, RefreshTokenStrategy],
	controllers: [AuthController]
})
export class AuthModule { }
