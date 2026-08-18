import { TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/prisma/prisma.service';
import { createTestModule } from '../common/testing/create-test-module';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await createTestModule(
      PrismaService,
      'provider',
    );
    service = module.get<PrismaService>(PrismaService);
  });

  it('is constructed with its dependencies resolved', () => {
    expect(service).toBeDefined();
  });
});
