import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';
// Marks a route with the roles RolesGuard will accept.
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
