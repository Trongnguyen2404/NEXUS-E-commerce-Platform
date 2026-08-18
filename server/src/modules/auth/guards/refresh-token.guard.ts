import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Guards the refresh route using the refresh-cookie strategy.
@Injectable()
export class RefreshTokenGuard extends AuthGuard('jwt-refresh') {}
