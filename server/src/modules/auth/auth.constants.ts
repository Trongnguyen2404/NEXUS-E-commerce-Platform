import type { CookieOptions } from 'express';

export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** Short enough to limit the window if the mailbox is compromised. */
export const PASSWORD_RESET_EXPIRY_MINUTES = 60;

/**
 * Where the emailed reset link points. Falls back to the first allowed CORS
 * origin, which is the frontend in every setup this project ships with.
 */
export const frontendUrl = (): string =>
  process.env.FRONTEND_URL ??
  process.env.ALLOWED_ORIGINS?.split(',')[0]?.trim() ??
  'http://localhost:5173';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The refresh token is kept in an httpOnly cookie so JavaScript — including any
 * injected script — cannot read it. Scoped to the auth routes: no other endpoint
 * needs it, so no other endpoint receives it.
 */
export const refreshTokenCookieOptions = (): CookieOptions => {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isProduction,
    // Production usually serves the API from a different domain than the SPA,
    // which requires SameSite=None (and therefore Secure) for the cookie to be
    // sent at all. Locally, Lax works and avoids the Secure requirement.
    sameSite: isProduction ? 'none' : 'lax',
    path: '/api/v1/auth',
    maxAge: SEVEN_DAYS_MS,
  };
};
