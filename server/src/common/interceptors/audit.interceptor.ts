import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { currentRequestId } from '@/common/logging/request-context';

// Never store these, whatever route they arrive on.
const SECRET_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'token',
  'refreshtoken',
  'accesstoken',
  'clientsecret',
  'authorization',
  'cardnumber',
  'cvc',
]);

const MAX_STRING = 500;

// Recursively copies a request body, replacing anything secret and truncating
// anything long enough to bloat the table.
const redact = (value: unknown, depth = 0): unknown => {
  if (depth > 5) return '[deep]';
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (Array.isArray(value))
    return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      out[key] = SECRET_KEYS.has(key.toLowerCase())
        ? '[redacted]'
        : redact(item, depth + 1);
    }
    return out;
  }
  return value;
};

// Records every write an admin performs.
//
// This sits at the HTTP layer on purpose. Putting the call inside each service
// means a new admin route is only audited once someone remembers to add it;
// here, anything that is a mutation and comes from an ADMIN is covered the day
// the route exists.
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<
        Request & { user?: { id?: string; email?: string; role?: Role } }
      >();

    const user = request.user;
    const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);

    if (!isMutation || user?.role !== Role.ADMIN || !user.id) {
      return next.handle();
    }

    const route =
      (request.route as { path?: string } | undefined)?.path ?? request.url;
    const action = `${request.method} ${String(request.baseUrl ?? '')}${route}`;
    const targetId =
      typeof request.params?.id === 'string' ? request.params.id : null;
    const body = redact(request.body);

    const write = (status: number) => {
      // Auditing must never break the request it is auditing.
      void this.prisma.auditLog
        .create({
          data: {
            actorId: user.id as string,
            actorEmail: user.email ?? 'unknown',
            action,
            targetId,
            payload: body as never,
            status,
            ip: request.ip ?? null,
            requestId: currentRequestId() ?? null,
          },
        })
        .catch((error: unknown) =>
          this.logger.warn(
            `Could not record audit entry for ${action}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
    };

    return next.handle().pipe(
      tap({
        next: () =>
          write(context.switchToHttp().getResponse<Response>().statusCode),
        // A rejected attempt is worth keeping too — that is what an attempted
        // privilege abuse looks like in the trail.
        error: (error: unknown) =>
          write(error instanceof HttpException ? error.getStatus() : 500),
      }),
    );
  }
}
