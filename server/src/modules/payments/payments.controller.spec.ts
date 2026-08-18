import { TestingModule } from '@nestjs/testing';
import { PaymentsController } from '@/modules/payments/payments.controller';
import { createTestModule } from '../../common/testing/create-test-module';

describe('PaymentsController', () => {
  let controller: PaymentsController;

  beforeEach(async () => {
    const module: TestingModule = await createTestModule(
      PaymentsController,
      'controller',
    );
    controller = module.get<PaymentsController>(PaymentsController);
  });

  it('is constructed with its dependencies resolved', () => {
    expect(controller).toBeDefined();
  });
});
