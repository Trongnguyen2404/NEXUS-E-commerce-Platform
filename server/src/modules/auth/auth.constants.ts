import type { CookieOptions } from 'express';

export const REFRESH_TOKEN_COOKIE = 'refresh_token';

export const PASSWORD_RESET_EXPIRY_MINUTES = 60;

// Resolves the frontend origin used in emailed links.
export const frontendUrl = (): string =>
  process.env.FRONTEND_URL ??
  process.env.ALLOWED_ORIGINS?.split(',')[0]?.trim() ??
  'http://localhost:5173';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Cookie options for the refresh token, hardened in production.
export const refreshTokenCookieOptions = (): CookieOptions => {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isProduction,

    sameSite: isProduction ? 'none' : 'lax',
    path: '/api/v1/auth',
    maxAge: SEVEN_DAYS_MS,
  };
};
