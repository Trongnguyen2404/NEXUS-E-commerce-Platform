import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

/**
 * Anything at or above this is our fault rather than the caller's.
 *
 * Typed as a plain number on purpose: `describe()` can return any status, so
 * comparing it against the HttpStatus enum member directly is a comparison
 * between two different types, which the linter rightly objects to.
 */
const SERVER_ERROR_FLOOR: number = HttpStatus.INTERNAL_SERVER_ERROR;

/**
 * Single exit point for every error leaving the API.
 *
 * Without it, anything that is not an HttpException — a Prisma error, a typo,
 * a null dereference — reaches the client as a bare 500 whose body contains the
 * stack trace and, for Prisma, the failing SQL and column names. This maps the
 * common cases to honest status codes and keeps internals in the log instead.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message } = this.describe(exception);

    // 5xx means we broke something — log the whole exception. 4xx is the client
    // being told "no", which is routine, so keep it to one line.
    if (status >= SERVER_ERROR_FLOOR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} -> ${status} ${JSON.stringify(message)}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private describe(exception: unknown): { status: number; message: unknown } {
    // Everything thrown deliberately by the app (NotFoundException, etc.).
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      return {
        status: exception.getStatus(),
        // ValidationPipe puts its errors in an object; simple throws use a string.
        message:
          typeof body === 'object' && body !== null && 'message' in body
            ? (body as { message: unknown }).message
            : body,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.describePrisma(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      // Bad arguments to a query — a bug on our side, not something to explain.
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      // Never leak an arbitrary error message to a production client.
      message:
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : exception instanceof Error
            ? exception.message
            : 'Internal server error',
    };
  }

  private describePrisma(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: unknown;
  } {
    switch (exception.code) {
      case 'P2002': {
        // Unique constraint violation.
        const target = exception.meta?.target;
        const field = Array.isArray(target) ? target.join(', ') : 'field';
        return {
          status: HttpStatus.CONFLICT,
          message: `A record with this ${field} already exists`,
        };
      }

      case 'P2025':
        // Record required by the operation was not found.
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'The requested record was not found',
        };

      case 'P2003':
        // Foreign key constraint violation.
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Referenced record does not exist',
        };

      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
        };
    }
  }
}
