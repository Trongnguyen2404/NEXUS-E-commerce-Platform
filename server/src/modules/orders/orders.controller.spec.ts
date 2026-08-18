import { TestingModule } from '@nestjs/testing';
import { OrdersController } from '@/modules/orders/orders.controller';
import { createTestModule } from '../../common/testing/create-test-module';

describe('OrdersController', () => {
  let controller: OrdersController;

  beforeEach(async () => {
    const module: TestingModule = await createTestModule(
      OrdersController,
      'controller',
    );
    controller = module.get<OrdersController>(OrdersController);
  });

  it('is constructed with its dependencies resolved', () => {
    expect(controller).toBeDefined();
  });
});
