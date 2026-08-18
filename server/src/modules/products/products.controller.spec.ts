import { TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { ProductsController } from '@/modules/products/products.controller';
import { ProductsService } from '@/modules/products/products.service';
import type { QueryProductDto } from '@/modules/products/dto/query-product.dto';
import { createTestModule } from '../../common/testing/create-test-module';

describe('ProductsController', () => {
  let controller: ProductsController;
  let service: { findAll: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await createTestModule(
      ProductsController,
      'controller',
    );
    controller = module.get<ProductsController>(ProductsController);
    service = module.get<{ findAll: jest.Mock }>(ProductsService);
  });

  it('is constructed with its dependencies resolved', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    const query = { page: 1, limit: 10 } as QueryProductDto;

    it('tells the service the caller is an admin so isActive is honoured', async () => {
      await controller.findAll(query, { role: Role.ADMIN });
      expect(service.findAll).toHaveBeenCalledWith(query, true);
    });

    it('tells the service an anonymous caller is not an admin', async () => {
      // The listing is public, so `user` is undefined for most callers and the
      // service must not honour a client-supplied isActive=false.
      await controller.findAll(query, undefined);
      expect(service.findAll).toHaveBeenCalledWith(query, false);
    });

    it('tells the service a signed-in shopper is not an admin', async () => {
      await controller.findAll(query, { role: Role.USER });
      expect(service.findAll).toHaveBeenCalledWith(query, false);
    });
  });
});
