import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from '@/modules/auth/auth.service';
import { RegisterDto } from '@/modules/auth/Dto/register.dto';
import { AuthHttpResponseDto } from '@/modules/auth/Dto/auth-responsive.dto';
import { RefreshTokenGuard } from '@/modules/auth/guards/refresh-token.guard';
import { GetUser } from '@/common/decorators/get-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { LoginDto } from '@/modules/auth/Dto/login.dto';
import { ForgotPasswordDto } from '@/modules/auth/Dto/forgot-password.dto';
import { ResetPasswordDto } from '@/modules/auth/Dto/reset-password.dto';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { StrictThrottle } from '@/common/decorators/custom-throttler.decorator';
import {
  REFRESH_TOKEN_COOKIE,
  refreshTokenCookieOptions,
} from '@/modules/auth/auth.constants';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Moves the refresh token out of the response body and into an httpOnly cookie.
  private issueRefreshCookie(
    res: Response,
    result: {
      accessToken: string;
      refreshToken: string;
      user: AuthHttpResponseDto['user'];
    },
  ): AuthHttpResponseDto {
    const { refreshToken, ...body } = result;
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, refreshTokenCookieOptions());
    return body;
  }

  //   Register api
  @Post('register')
  @HttpCode(201)
  @StrictThrottle()
  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Creates a new user account. The refresh token is returned as an httpOnly cookie, not in the body.',
  })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
    type: AuthHttpResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request. Validation failed or user already exists',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error',
  })
  @ApiResponse({
    status: 429,
    description: 'Too Many Requests. Rate limit exceeded',
  })
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthHttpResponseDto> {
    return this.issueRefreshCookie(
      res,
      await this.authService.register(registerDto),
    );
  }

  // Refresh access token
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @StrictThrottle()
  @UseGuards(RefreshTokenGuard)
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Generates a new access token. Reads the refresh token from the httpOnly cookie set at login.',
  })
  @ApiResponse({
    status: 200,
    description: 'New access token generated successfully',
    type: AuthHttpResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Invalid or expired refresh token',
  })
  @ApiResponse({
    status: 429,
    description: 'Too Many Requests. Rate limit exceeded',
  })
  async refresh(
    @GetUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthHttpResponseDto> {
    return this.issueRefreshCookie(
      res,
      await this.authService.refreshTokens(userId),
    );
  }

  // Request a password reset link
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @StrictThrottle()
  @ApiOperation({
    summary: 'Request a password reset link',
    description:
      'Emails a single-use reset link. Always returns 200, even for an unknown address, so the endpoint cannot be used to discover which emails are registered.',
  })
  @ApiResponse({
    status: 200,
    description: 'Reset link sent if the account exists',
  })
  @ApiResponse({
    status: 429,
    description: 'Too Many Requests. Rate limit exceeded',
  })
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    return await this.authService.forgotPassword(forgotPasswordDto.email);
  }

  // Complete a password reset
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @StrictThrottle()
  @ApiOperation({
    summary: 'Set a new password using a reset token',
    description:
      'Consumes the token from the emailed link. All existing sessions are signed out.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password successfully reset',
  })
  @ApiResponse({
    status: 400,
    description: 'Token is invalid, already used, or expired',
  })
  @ApiResponse({
    status: 429,
    description: 'Too Many Requests. Rate limit exceeded',
  })
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const result = await this.authService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.newPassword,
    );

    // The stored refresh token was just cleared, so the cookie on this device
    // is dead too — drop it rather than leaving a stale one behind.
    res.clearCookie(REFRESH_TOKEN_COOKIE, refreshTokenCookieOptions());

    return result;
  }

  // Logout user and invalidate refresh token
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Logout user',
    description:
      'Logs out the user, invalidates the refresh token and clears its cookie',
  })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged out',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Invalid or expired access token',
  })
  @ApiResponse({
    status: 429,
    description: 'Too Many Requests. Rate limit exceeded',
  })
  async logout(
    @GetUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    await this.authService.logout(userId);
    res.clearCookie(REFRESH_TOKEN_COOKIE, refreshTokenCookieOptions());
    return { message: 'Successfully logged out' };
  }

  // Login
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @StrictThrottle()
  @ApiOperation({
    summary: 'User login',
    description:
      'Authenticates a user. Returns an access token in the body and the refresh token as an httpOnly cookie.',
  })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged in',
    type: AuthHttpResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Invalid credentials',
  })
  @ApiResponse({
    status: 429,
    description: 'Too Many Requests. Rate limit exceeded',
  })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthHttpResponseDto> {
    return this.issueRefreshCookie(res, await this.authService.login(loginDto));
  }
}
