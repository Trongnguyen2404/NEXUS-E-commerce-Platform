import { TestingModule } from '@nestjs/testing';
import { ContactsService } from './contacts.service';
import { createTestModule } from '../../common/testing/create-test-module';

describe('ContactsService', () => {
  let service: ContactsService;

  beforeEach(async () => {
    const module: TestingModule = await createTestModule(
      ContactsService,
      'provider',
    );
    service = module.get<ContactsService>(ContactsService);
  });

  it('is constructed with its dependencies resolved', () => {
    expect(service).toBeDefined();
  });
});
