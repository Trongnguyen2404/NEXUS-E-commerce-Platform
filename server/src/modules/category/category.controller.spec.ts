import { TestingModule } from '@nestjs/testing';
import { CategoryController } from '@/modules/category/category.controller';
import { createTestModule } from '../../common/testing/create-test-module';

describe('CategoryController', () => {
  let controller: CategoryController;

  beforeEach(async () => {
    const module: TestingModule = await createTestModule(
      CategoryController,
      'controller',
    );
    controller = module.get<CategoryController>(CategoryController);
  });

  it('is constructed with its dependencies resolved', () => {
    expect(controller).toBeDefined();
  });
});
