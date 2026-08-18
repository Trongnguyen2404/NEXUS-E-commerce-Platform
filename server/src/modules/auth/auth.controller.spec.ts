import { TestingModule } from '@nestjs/testing';
import { AuthController } from '@/modules/auth/auth.controller';
import { createTestModule } from '../../common/testing/create-test-module';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await createTestModule(
      AuthController,
      'controller',
    );
    controller = module.get<AuthController>(AuthController);
  });

  it('is constructed with its dependencies resolved', () => {
    expect(controller).toBeDefined();
  });
});
