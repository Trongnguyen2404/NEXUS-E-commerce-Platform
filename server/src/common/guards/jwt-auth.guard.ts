import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

// Rejects requests without a valid access token. Applied per controller, not
// globally, so an unannotated controller is public by default.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  // Defers entirely to Passport; kept as an override point.
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
