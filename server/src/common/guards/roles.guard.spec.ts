import 'reflect-metadata';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { aUser } from '@/common/testing/factories';

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Stands in for a route handler; @Roles() writes its metadata onto exactly this.
  const aHandler = (roles?: Role[]) => {
    const handler = function findAll() {};
    if (roles) Reflect.defineMetadata(ROLES_KEY, roles, handler);
    return handler;
  };

  // Stands in for the controller class the handler lives on.
  const aController = (roles?: Role[]) => {
    class OrdersController {}
    if (roles) Reflect.defineMetadata(ROLES_KEY, roles, OrdersController);
    return OrdersController;
  };

  const contextFor = (opts: {
    handler?: ReturnType<typeof aHandler>;
    controller?: ReturnType<typeof aController>;
    user?: unknown;
  }) => {
    const request: Record<string, unknown> = {};
    if ('user' in opts) request.user = opts.user;

    const getRequest = jest.fn().mockReturnValue(request);
    const switchToHttp = jest.fn().mockReturnValue({ getRequest });
    const context = {
      getHandler: () => opts.handler ?? aHandler(),
      getClass: () => opts.controller ?? aController(),
      switchToHttp,
    } as unknown as ExecutionContext;

    return { context, switchToHttp, getRequest };
  };

  describe('routes that declare no roles', () => {
    it('allows a request to a route with no @Roles metadata', () => {
      const { context } = contextFor({ user: aUser() });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows an anonymous caller through, without reading the request at all', () => {
      const { context, switchToHttp } = contextFor({});

      expect(guard.canActivate(context)).toBe(true);
      expect(switchToHttp).not.toHaveBeenCalled();
    });
  });

  describe('routes that declare roles', () => {
    it('allows a caller holding the single role the route requires', () => {
      const { context } = contextFor({
        handler: aHandler([Role.ADMIN]),
        user: aUser({ role: Role.ADMIN }),
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows a caller holding one of several accepted roles', () => {
      const { context } = contextFor({
        handler: aHandler([Role.ADMIN, Role.USER]),
        user: aUser({ role: Role.USER }),
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('denies a caller whose role is not one the route accepts', () => {
      const { context } = contextFor({
        handler: aHandler([Role.ADMIN]),
        user: aUser({ role: Role.USER }),
      });

      expect(guard.canActivate(context)).toBe(false);
    });

    it('denies a caller whose token carries no role', () => {
      const { context } = contextFor({
        handler: aHandler([Role.ADMIN]),
        user: { id: 'user-1', email: 'buyer@nexus.test' },
      });

      expect(guard.canActivate(context)).toBe(false);
    });

    it('denies a caller whose role is an unrelated string', () => {
      const { context } = contextFor({
        handler: aHandler([Role.ADMIN]),
        user: aUser({ role: 'SUPERADMIN' }),
      });

      expect(guard.canActivate(context)).toBe(false);
    });

    it('denies everyone when the route declares an empty role list', () => {
      // @Roles() with no arguments fails closed rather than waving everyone through.
      const { context } = contextFor({
        handler: aHandler([]),
        user: aUser({ role: Role.ADMIN }),
      });

      expect(guard.canActivate(context)).toBe(false);
    });
  });

  describe('handler versus controller metadata', () => {
    it('applies the controller roles to a handler that declares none', () => {
      const controller = aController([Role.ADMIN]);

      expect(
        guard.canActivate(
          contextFor({ controller, user: aUser({ role: Role.ADMIN }) }).context,
        ),
      ).toBe(true);
      expect(
        guard.canActivate(
          contextFor({ controller, user: aUser({ role: Role.USER }) }).context,
        ),
      ).toBe(false);
    });

    it('lets the handler roles override the controller roles', () => {
      const controller = aController([Role.ADMIN]);
      const handler = aHandler([Role.USER]);

      expect(
        guard.canActivate(
          contextFor({ handler, controller, user: aUser({ role: Role.USER }) })
            .context,
        ),
      ).toBe(true);
    });

    it('narrows to the handler roles even when the controller is more permissive', () => {
      const controller = aController([Role.ADMIN, Role.USER]);
      const handler = aHandler([Role.ADMIN]);

      expect(
        guard.canActivate(
          contextFor({ handler, controller, user: aUser({ role: Role.USER }) })
            .context,
        ),
      ).toBe(false);
    });

    it('looks the roles up on the handler first and the controller second', () => {
      const spy = jest.spyOn(reflector, 'getAllAndOverride');
      const handler = aHandler([Role.ADMIN]);
      const controller = aController([Role.USER]);

      void guard.canActivate(
        contextFor({ handler, controller, user: aUser({ role: Role.ADMIN }) })
          .context,
      );

      // Order is the contract: handler-level @Roles must win over class-level.
      expect(spy).toHaveBeenCalledWith(ROLES_KEY, [handler, controller]);
    });
  });
});
