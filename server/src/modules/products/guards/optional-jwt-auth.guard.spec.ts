import { UnauthorizedException } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '@/modules/products/guards/optional-jwt-auth.guard';

describe('OptionalJwtAuthGuard', () => {
  const guard = new OptionalJwtAuthGuard();

  it('lets an anonymous caller through with no user attached', () => {
    // Passport hands `false` to handleRequest when no token was sent; the
    // stock guard turns that into a 401, which would close the public listing.
    expect(guard.handleRequest(null, false)).toBeNull();
  });

  it('lets a caller with an expired or invalid token through anonymously', () => {
    expect(
      guard.handleRequest(new UnauthorizedException('jwt expired'), false),
    ).toBeNull();
  });

  it('attaches the user when the token is valid, so the route can read the role', () => {
    const user = { id: 'user-1', role: 'ADMIN' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });
});
