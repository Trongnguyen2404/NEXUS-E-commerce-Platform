import { TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { UsersController } from '@/modules/users/users.controller';
import { UsersService } from '@/modules/users/users.service';
import { REFRESH_TOKEN_COOKIE } from '@/modules/auth/auth.constants';
import { createTestModule } from '../../common/testing/create-test-module';

describe('UsersController', () => {
  let controller: UsersController;
  let users: { changePassword: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await createTestModule(
      UsersController,
      'controller',
    );
    controller = module.get<UsersController>(UsersController);
    users = module.get(UsersService);
  });

  it('is constructed with its dependencies resolved', () => {
    expect(controller).toBeDefined();
  });

  describe('changePassword', () => {
    const CHANGE = {
      currentPassword: 'CurrentP@ss1',
      newPassword: 'BrandNewP@ss1',
    };

    // A response object that only records the cookie calls made against it.
    const aResponse = () =>
      ({ clearCookie: jest.fn(), cookie: jest.fn() }) as unknown as Response & {
        clearCookie: jest.Mock;
      };

    it('clears the refresh cookie so the browser stops sending a revoked token', async () => {
      users.changePassword.mockResolvedValue({
        message: 'Password changed successfully',
      });
      const res = aResponse();

      await controller.changePassword('user-1', CHANGE, res);

      expect(res.clearCookie).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE,
        expect.objectContaining({ httpOnly: true, path: '/api/v1/auth' }),
      );
    });

    it('leaves the cookie in place when the change itself was refused', async () => {
      users.changePassword.mockRejectedValue(new Error('nope'));
      const res = aResponse();

      await expect(
        controller.changePassword('user-1', CHANGE, res),
      ).rejects.toThrow('nope');
      expect(res.clearCookie).not.toHaveBeenCalled();
    });
  });
});
