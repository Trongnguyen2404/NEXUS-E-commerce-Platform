import { TestingModule } from '@nestjs/testing';
import { ContactsController } from './contacts.controller';
import { createTestModule } from '../../common/testing/create-test-module';

describe('ContactsController', () => {
  let controller: ContactsController;

  beforeEach(async () => {
    const module: TestingModule = await createTestModule(
      ContactsController,
      'controller',
    );
    controller = module.get<ContactsController>(ContactsController);
  });

  it('is constructed with its dependencies resolved', () => {
    expect(controller).toBeDefined();
  });
});
