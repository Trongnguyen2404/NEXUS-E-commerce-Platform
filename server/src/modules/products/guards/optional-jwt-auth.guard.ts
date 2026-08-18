import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Lets an anonymous caller through but still resolves the user when a valid
// access token is present, so a public route can vary its answer by role.
// Unlike JwtAuthGuard, a missing or expired token is not an error here.
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(_err: unknown, user: TUser | false): TUser | null {
    return user || null;
  }
}
