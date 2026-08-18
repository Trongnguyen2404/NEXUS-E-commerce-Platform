import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';

type Envelope = {
  statusCode: number;
  message: unknown;
  path: string;
  timestamp: string;
};

const CLIENT_VERSION = '7.4.2';

// Prisma's own text quotes the failing query, so every fixture carries a
// recognisable marker that the client must never receive.
const PRISMA_INTERNAL_TEXT =
  'Invalid `prisma.user.create()` invocation in /app/dist/users.service.js';

const prismaKnownError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError(PRISMA_INTERNAL_TEXT, {
    code,
    clientVersion: CLIENT_VERSION,
    meta,
  });

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let logged: { error: jest.SpyInstance; warn: jest.SpyInstance };

  const ENV = { ...process.env };

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    // The filter logs every failure; silence it so suite output stays readable.
    logged = {
      error: jest.spyOn(Logger.prototype, 'error').mockImplementation(),
      warn: jest.spyOn(Logger.prototype, 'warn').mockImplementation(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...ENV };
  });

  const catchIt = (
    exception: unknown,
    req: { method?: string; url?: string } = {},
  ) => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const request = {
      method: req.method ?? 'GET',
      url: req.url ?? '/api/products/prod-1',
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;

    filter.catch(exception, host);

    return {
      httpStatus: status.mock.calls[0][0] as number,
      body: json.mock.calls[0][0] as Envelope,
      serialised: JSON.stringify(json.mock.calls[0][0]),
    };
  };

  describe('exceptions the application threw on purpose', () => {
    it('keeps the status and the message of a NotFoundException', () => {
      const { httpStatus, body } = catchIt(
        new NotFoundException('Product prod-1 not found'),
      );

      expect(httpStatus).toBe(HttpStatus.NOT_FOUND);
      expect(body.statusCode).toBe(404);
      expect(body.message).toBe('Product prod-1 not found');
    });

    it('keeps the status of a ForbiddenException rather than flattening it to 500', () => {
      const { httpStatus, body } = catchIt(
        new ForbiddenException('This order belongs to someone else'),
      );

      expect(httpStatus).toBe(HttpStatus.FORBIDDEN);
      expect(body.message).toBe('This order belongs to someone else');
    });

    it('keeps the status of an HttpException Nest has no subclass for', () => {
      const { httpStatus, body } = catchIt(
        new HttpException('I am a teapot', HttpStatus.I_AM_A_TEAPOT),
      );

      expect(httpStatus).toBe(418);
      expect(body.message).toBe('I am a teapot');
    });

    it('passes a validation pipe list of field errors through untouched', () => {
      const { httpStatus, body } = catchIt(
        new BadRequestException([
          'email must be an email',
          'password must be longer than 8 characters',
        ]),
      );

      expect(httpStatus).toBe(HttpStatus.BAD_REQUEST);
      expect(body.message).toEqual([
        'email must be an email',
        'password must be longer than 8 characters',
      ]);
    });

    it('unwraps the message instead of nesting the whole Nest error body', () => {
      const { body } = catchIt(new NotFoundException('Order not found'));

      // Nest's own body is { statusCode, message, error }; only message survives.
      expect(body.message).toBe('Order not found');
      expect(body).not.toHaveProperty('error');
    });

    it('returns the whole response body when a custom exception carries no message key', () => {
      const { httpStatus, body } = catchIt(
        new HttpException(
          { reason: 'coupon_expired', code: 'CPN-004' },
          HttpStatus.UNPROCESSABLE_ENTITY,
        ),
      );

      expect(httpStatus).toBe(422);
      expect(body.message).toEqual({
        reason: 'coupon_expired',
        code: 'CPN-004',
      });
    });
  });

  describe('unexpected errors', () => {
    it('answers 500 with a generic message for a plain Error in production', () => {
      process.env.NODE_ENV = 'production';

      const { httpStatus, body } = catchIt(
        new Error('getaddrinfo ENOTFOUND db.internal'),
      );

      expect(httpStatus).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body.statusCode).toBe(500);
      expect(body.message).toBe('Internal server error');
    });

    it('does not leak the original error text to the client in production', () => {
      process.env.NODE_ENV = 'production';

      const { serialised } = catchIt(
        new Error(
          'connect ECONNREFUSED postgres://admin:hunter2@10.0.0.4:5432/shop',
        ),
      );

      expect(serialised).not.toContain('hunter2');
      expect(serialised).not.toContain('ECONNREFUSED');
    });

    it('never puts the stack trace in the response body', () => {
      process.env.NODE_ENV = 'production';

      const { body, serialised } = catchIt(new Error('kaboom'));

      expect(body).not.toHaveProperty('stack');
      expect(serialised).not.toContain('all-exceptions.filter.spec');
      expect(serialised).not.toContain('    at ');
    });

    it('records the stack server-side even though the client only sees a generic message', () => {
      process.env.NODE_ENV = 'production';
      const boom = new Error('kaboom');

      catchIt(boom, { method: 'POST', url: '/api/orders' });

      expect(logged.error).toHaveBeenCalledWith(
        'POST /api/orders -> 500',
        boom.stack,
      );
    });

    it('answers 500 with a generic message when a non-Error value is thrown', () => {
      const { httpStatus, body } = catchIt('just a string');

      expect(httpStatus).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body.message).toBe('Internal server error');
    });
  });

  describe('Prisma errors', () => {
    it('turns a unique constraint violation into 409 naming the conflicting field', () => {
      const { httpStatus, body } = catchIt(
        prismaKnownError('P2002', { target: ['email'] }),
      );

      expect(httpStatus).toBe(HttpStatus.CONFLICT);
      expect(body.message).toBe('A record with this email already exists');
    });

    it('names every column of a composite unique constraint', () => {
      const { body } = catchIt(
        prismaKnownError('P2002', { target: ['cartId', 'productId'] }),
      );

      expect(body.message).toBe(
        'A record with this cartId, productId already exists',
      );
    });

    it('falls back to "field" when the unique constraint reports no target', () => {
      const { httpStatus, body } = catchIt(prismaKnownError('P2002'));

      expect(httpStatus).toBe(HttpStatus.CONFLICT);
      expect(body.message).toBe('A record with this field already exists');
    });

    it('turns a missing record error into 404', () => {
      const { httpStatus, body } = catchIt(
        prismaKnownError('P2025', { cause: 'Record to update not found.' }),
      );

      expect(httpStatus).toBe(HttpStatus.NOT_FOUND);
      expect(body.message).toBe('The requested record was not found');
    });

    it('turns a foreign key violation into 400', () => {
      const { httpStatus, body } = catchIt(
        prismaKnownError('P2003', { field_name: 'Order_userId_fkey (index)' }),
      );

      expect(httpStatus).toBe(HttpStatus.BAD_REQUEST);
      expect(body.message).toBe('Referenced record does not exist');
    });

    it('hides an unmapped Prisma error code behind a generic 500', () => {
      const { httpStatus, body, serialised } = catchIt(
        prismaKnownError('P2024'),
      );

      expect(httpStatus).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body.message).toBe('Internal server error');
      expect(serialised).not.toContain('prisma.user.create');
    });

    it('hides a malformed query behind a generic 500 without echoing the query', () => {
      const { httpStatus, body, serialised } = catchIt(
        new Prisma.PrismaClientValidationError(PRISMA_INTERNAL_TEXT, {
          clientVersion: CLIENT_VERSION,
        }),
      );

      expect(httpStatus).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body.message).toBe('Internal server error');
      expect(serialised).not.toContain('prisma.user.create');
    });
  });

  describe('response envelope', () => {
    it('answers with exactly statusCode, message, path and timestamp', () => {
      const { body } = catchIt(new NotFoundException('nope'));

      expect(Object.keys(body).sort()).toEqual([
        'message',
        'path',
        'statusCode',
        'timestamp',
      ]);
    });

    it('echoes the requested path so the client can tell which call failed', () => {
      const { body } = catchIt(new NotFoundException('nope'), {
        method: 'PATCH',
        url: '/api/orders/order-9/cancel?force=1',
      });

      expect(body.path).toBe('/api/orders/order-9/cancel?force=1');
    });

    it('stamps a current ISO-8601 timestamp', () => {
      const before = Date.now();
      const { body } = catchIt(new NotFoundException('nope'));

      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
      const stamped = Date.parse(body.timestamp);
      expect(stamped).toBeGreaterThanOrEqual(before - 1000);
      expect(stamped).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('sends the same status on the HTTP response and inside the body', () => {
      const { httpStatus, body } = catchIt(prismaKnownError('P2025'));

      expect(httpStatus).toBe(404);
      expect(body.statusCode).toBe(404);
    });

    it('logs a client error as a warning rather than as a server error', () => {
      catchIt(new NotFoundException('nope'), {
        method: 'GET',
        url: '/api/products/ghost',
      });

      expect(logged.warn).toHaveBeenCalledWith(
        'GET /api/products/ghost -> 404 "nope"',
      );
      expect(logged.error).not.toHaveBeenCalled();
    });
  });
});
