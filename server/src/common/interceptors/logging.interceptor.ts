import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';

/**
 * One line per request: method, path, status, duration.
 *
 * Nest logs routes at boot but nothing at runtime, so a production incident
 * currently leaves no trace of what was actually called. Errors are skipped
 * here — AllExceptionsFilter already logs those, with the stack.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();

    // The health check is polled constantly by orchestrators; logging it would
    // bury everything else.
    if (request.url.startsWith('/api/v1/health')) {
      return next.handle();
    }

    const { method, url } = request;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse<Response>();
        this.logger.log(
          `${method} ${url} ${response.statusCode} - ${Date.now() - startedAt}ms`,
        );
      }),
    );
  }
}
