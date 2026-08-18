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
import { currentRequestId } from '@/common/logging/request-context';

const isProduction = () => process.env.NODE_ENV === 'production';

interface AccessLine {
  msg: 'http';
  requestId?: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  userId?: string;
  error?: string;
}

// Logs one line per request: method, path, status, duration and the request id.
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  // Records the outcome on BOTH branches. The previous version passed a bare
  // callback to tap(), which only runs on success, so every failing request
  // went unlogged — exactly the ones worth having.
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();

    // Health checks are polled every few seconds and would drown the log.
    if (request.url.startsWith('/api/v1/health')) {
      return next.handle();
    }

    const { method } = request;
    // Log the route pattern, not the raw URL: query strings carry tokens and
    // email addresses, and ids would fragment any grouping.
    const path = (request.route as { path?: string } | undefined)?.path
      ? String(request.baseUrl ?? '') +
        String((request.route as { path: string }).path)
      : request.url.split('?')[0];

    // Passport attaches the user after the guard runs; express-serve-static-core
    // does not declare it, hence the narrow cast.
    const userId = (request as Request & { user?: { id?: string } }).user?.id;
    const startedAt = Date.now();

    const emit = (status: number, error?: unknown) => {
      const line: AccessLine = {
        msg: 'http',
        requestId: currentRequestId(),
        method,
        path,
        status,
        durationMs: Date.now() - startedAt,
        ...(userId ? { userId } : {}),
        ...(error instanceof Error ? { error: error.message } : {}),
      };

      // Structured in production so a log platform can index it; readable in
      // development so a human can.
      const text = isProduction()
        ? JSON.stringify(line)
        : `${method} ${path} ${status} - ${line.durationMs}ms${line.error ? ` - ${line.error}` : ''}`;

      if (status >= 500) this.logger.error(text);
      else if (status >= 400) this.logger.warn(text);
      else this.logger.log(text);
    };

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse<Response>();
          emit(response.statusCode);
        },
        error: (error: unknown) => {
          const status =
            error instanceof HttpException ? error.getStatus() : 500;
          emit(status, error);
        },
      }),
    );
  }
}
