import { TestingModule } from '@nestjs/testing';
import { AppController } from '@/app.controller';
import { createTestModule } from './common/testing/create-test-module';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await createTestModule(
      AppController,
      'controller',
    );
    controller = module.get<AppController>(AppController);
  });

  it('is constructed with its dependencies resolved', () => {
    expect(controller).toBeDefined();
  });
});
