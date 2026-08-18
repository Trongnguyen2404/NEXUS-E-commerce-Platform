import { TestingModule } from '@nestjs/testing';
import { CartController } from '@/modules/cart/cart.controller';
import { createTestModule } from '../../common/testing/create-test-module';

describe('CartController', () => {
  let controller: CartController;

  beforeEach(async () => {
    const module: TestingModule = await createTestModule(
      CartController,
      'controller',
    );
    controller = module.get<CartController>(CartController);
  });

  it('is constructed with its dependencies resolved', () => {
    expect(controller).toBeDefined();
  });
});
