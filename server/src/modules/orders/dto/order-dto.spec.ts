import 'reflect-metadata';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { OrderStatus } from '@prisma/client';
import { QueryOrderDto } from '@/modules/orders/dto/query-order.dto';
import { CreateOrderDto } from '@/modules/orders/dto/create-order.dto';
import { QuoteOrderDto } from '@/modules/orders/dto/quote-order.dto';
import { UpdateOrderDto } from '@/modules/orders/dto/update-order.dto';
import { UpdateOrderUserDto } from '@/modules/orders/dto/update-order-user.dto';

// Flattens nested errors so a test can assert on the message a caller would see.
const collect = (errors: ValidationError[]): string[] =>
  errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...collect(error.children ?? []),
  ]);

// Exactly the pipeline main.ts installs: implicit conversion first, then the
// whitelisting validator. Anything that passes here reaches the service.
const parse = async <T extends object>(
  cls: ClassConstructor<T>,
  payload: Record<string, unknown>,
): Promise<{ dto: T; messages: string[] }> => {
  const dto = plainToInstance(cls, payload, { enableImplicitConversion: true });
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, messages: collect(errors) };
};

const accept = async <T extends object>(
  cls: ClassConstructor<T>,
  payload: Record<string, unknown>,
): Promise<T> => {
  const { dto, messages } = await parse(cls, payload);
  expect(messages).toEqual([]);
  return dto;
};

const reject = async <T extends object>(
  cls: ClassConstructor<T>,
  payload: Record<string, unknown>,
): Promise<string> => {
  const { messages } = await parse(cls, payload);
  expect(messages.length).toBeGreaterThan(0);
  return messages.join(' | ');
};

const anItem = (over: Record<string, unknown> = {}) => ({
  productId: 'prod-1',
  quantity: 2,
  ...over,
});

describe('QueryOrderDto', () => {
  it('falls back to page 1 and ten orders per page for an empty query', async () => {
    const dto = await accept(QueryOrderDto, {});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(10);
    expect(dto.status).toBeUndefined();
    expect(dto.search).toBeUndefined();
  });

  describe('status', () => {
    // Regression: @Type(() => Number) on this field made Number('CANCELLED')
    // NaN, which failed no validator and silently dropped the filter.
    it('keeps a status filter as the enum string Prisma expects, not a number', async () => {
      const dto = await accept(QueryOrderDto, { status: 'CANCELLED' });
      expect(dto.status).toBe(OrderStatus.CANCELLED);
      expect(typeof dto.status).toBe('string');
      expect(Number.isNaN(dto.status as unknown as number)).toBe(false);
    });

    it.each(Object.values(OrderStatus))(
      'accepts %s as a status filter',
      async (status) => {
        const dto = await accept(QueryOrderDto, { status });
        expect(dto.status).toBe(status);
      },
    );

    it('rejects a status that no order can ever have', async () => {
      await expect(
        reject(QueryOrderDto, { status: 'REFUNDED' }),
      ).resolves.toContain('status must be one of');
    });

    it('names the statuses that would have worked', async () => {
      const message = await reject(QueryOrderDto, { status: 'REFUNDED' });
      expect(message).toContain('PENDING');
      expect(message).toContain('CANCELLED');
    });

    it('rejects a status that differs only in case', async () => {
      await expect(
        reject(QueryOrderDto, { status: 'cancelled' }),
      ).resolves.toContain('status must be one of');
    });

    it('rejects a blank status instead of filtering on nothing', async () => {
      await expect(reject(QueryOrderDto, { status: '' })).resolves.toContain(
        'status must be one of',
      );
    });

    // The old NaN bug arrived here as a number; a number must never validate.
    it('rejects a numeric status', async () => {
      await expect(reject(QueryOrderDto, { status: 4 })).resolves.toContain(
        'status must be one of',
      );
    });
  });

  describe('paging', () => {
    it('converts the page number sent as a query string', async () => {
      const dto = await accept(QueryOrderDto, { page: '3' });
      expect(dto.page).toBe(3);
      expect(typeof dto.page).toBe('number');
    });

    it('accepts 1, the smallest usable page size', async () => {
      const dto = await accept(QueryOrderDto, { limit: '1' });
      expect(dto.limit).toBe(1);
    });

    it('accepts 100, the largest page size allowed', async () => {
      const dto = await accept(QueryOrderDto, { limit: '100' });
      expect(dto.limit).toBe(100);
    });

    it('rejects 101, one past the cap', async () => {
      await expect(reject(QueryOrderDto, { limit: '101' })).resolves.toContain(
        'limit must not be greater than 100',
      );
    });

    // ?limit=99999 used to be accepted and returned every order in the table.
    it('rejects a limit that tries to pull the whole table', async () => {
      await expect(
        reject(QueryOrderDto, { limit: '99999' }),
      ).resolves.toContain('limit must not be greater than 100');
    });

    it('rejects limit 0', async () => {
      await expect(reject(QueryOrderDto, { limit: '0' })).resolves.toContain(
        'limit must not be less than 1',
      );
    });

    it('rejects a limit that is not a number', async () => {
      await expect(reject(QueryOrderDto, { limit: 'lots' })).resolves.toContain(
        'limit must not be less than 1',
      );
    });

    it('rejects a fractional limit that would reach take as 2.5', async () => {
      await expect(reject(QueryOrderDto, { limit: '2.5' })).resolves.toContain(
        'limit must be an integer number',
      );
    });

    // page had no constraint at all, so each of these reached
    // `skip = (page - 1) * limit` and came back from Prisma as a 500.
    it('rejects page 0, which used to reach Prisma as a negative skip', async () => {
      await expect(reject(QueryOrderDto, { page: '0' })).resolves.toContain(
        'page must not be less than 1',
      );
    });

    it('rejects a negative page', async () => {
      await expect(reject(QueryOrderDto, { page: '-5' })).resolves.toContain(
        'page must not be less than 1',
      );
    });

    it('rejects a page that is not a number instead of skipping NaN rows', async () => {
      await expect(reject(QueryOrderDto, { page: 'abc' })).resolves.toContain(
        'page must be an integer number',
      );
    });

    it('rejects a page so large it overflows to Infinity', async () => {
      await expect(reject(QueryOrderDto, { page: '1e999' })).resolves.toContain(
        'page must be an integer number',
      );
    });

    it('rejects a fractional page', async () => {
      await expect(reject(QueryOrderDto, { page: '1.5' })).resolves.toContain(
        'page must be an integer number',
      );
    });
  });

  describe('search', () => {
    it('keeps an order number search exactly as sent', async () => {
      const dto = await accept(QueryOrderDto, { search: 'ORD-1042' });
      expect(dto.search).toBe('ORD-1042');
    });

    it('rejects a parameter the DTO does not declare', async () => {
      await expect(
        reject(QueryOrderDto, { userId: 'someone-else' }),
      ).resolves.toContain('property userId should not exist');
    });
  });
});

describe('CreateOrderDto', () => {
  it('accepts a single line with a free-text address', async () => {
    const dto = await accept(CreateOrderDto, {
      items: [anItem()],
      shippingAddress: '1 Le Loi, District 1',
    });
    expect(dto.items).toHaveLength(1);
    expect(dto.items[0].productId).toBe('prod-1');
    expect(dto.shippingAddress).toBe('1 Le Loi, District 1');
  });

  it('accepts a saved address id and a promo code', async () => {
    const dto = await accept(CreateOrderDto, {
      items: [anItem()],
      addressId: 'addr-1',
      couponCode: 'WELCOME10',
    });
    expect(dto.addressId).toBe('addr-1');
    expect(dto.couponCode).toBe('WELCOME10');
  });

  it('converts a quantity that arrives as a string', async () => {
    const dto = await accept(CreateOrderDto, {
      items: [anItem({ quantity: '3' })],
    });
    expect(dto.items[0].quantity).toBe(3);
    expect(typeof dto.items[0].quantity).toBe('number');
  });

  it('carries a chosen variant through to the service', async () => {
    const dto = await accept(CreateOrderDto, {
      items: [anItem({ variantId: 'var-1' })],
      shippingAddress: '1 Le Loi',
    });
    expect(dto.items[0].variantId).toBe('var-1');
  });

  it('requires the items list', async () => {
    await expect(
      reject(CreateOrderDto, { shippingAddress: '1 Le Loi' }),
    ).resolves.toContain('items must be an array');
  });

  it('rejects a line with no product id', async () => {
    await expect(
      reject(CreateOrderDto, { items: [{ quantity: 1 }] }),
    ).resolves.toContain('productId should not be empty');
  });

  it('rejects a line whose product id is an empty string', async () => {
    await expect(
      reject(CreateOrderDto, { items: [anItem({ productId: '' })] }),
    ).resolves.toContain('productId should not be empty');
  });

  it('rejects a quantity that is not a number', async () => {
    await expect(
      reject(CreateOrderDto, { items: [anItem({ quantity: 'two' })] }),
    ).resolves.toContain('quantity must be a number');
  });

  it('rejects an unknown field smuggled inside a line', async () => {
    await expect(
      reject(CreateOrderDto, { items: [anItem({ price: 0.01 })] }),
    ).resolves.toContain('property price should not exist');
  });

  // Prices are recalculated server-side; a client must not be able to name one.
  it('rejects a client-supplied total', async () => {
    await expect(
      reject(CreateOrderDto, { items: [anItem()], totalAmount: 0.01 }),
    ).resolves.toContain('property totalAmount should not exist');
  });

  it('rejects a client-supplied discount', async () => {
    await expect(
      reject(CreateOrderDto, { items: [anItem()], discountAmount: 999 }),
    ).resolves.toContain('property discountAmount should not exist');
  });

  it('rejects an attempt to place the order under another user', async () => {
    await expect(
      reject(CreateOrderDto, { items: [anItem()], userId: 'user-2' }),
    ).resolves.toContain('property userId should not exist');
  });

  it('rejects an attempt to choose the order status', async () => {
    await expect(
      reject(CreateOrderDto, { items: [anItem()], status: 'DELIVERED' }),
    ).resolves.toContain('property status should not exist');
  });
});

describe('QuoteOrderDto', () => {
  it('accepts a basket with one line', async () => {
    const dto = await accept(QuoteOrderDto, { items: [anItem()] });
    expect(dto.items[0].quantity).toBe(2);
  });

  it('converts a quantity that arrives as a string', async () => {
    const dto = await accept(QuoteOrderDto, {
      items: [anItem({ quantity: '3' })],
    });
    expect(dto.items[0].quantity).toBe(3);
  });

  it('refuses an empty basket with a message that says what to do', async () => {
    await expect(reject(QuoteOrderDto, { items: [] })).resolves.toContain(
      'Add at least one item to price a basket',
    );
  });

  it('refuses a quantity below one', async () => {
    await expect(
      reject(QuoteOrderDto, { items: [anItem({ quantity: 0 })] }),
    ).resolves.toContain('quantity must not be less than 1');
  });

  it('refuses a negative quantity', async () => {
    await expect(
      reject(QuoteOrderDto, { items: [anItem({ quantity: -2 })] }),
    ).resolves.toContain('quantity must not be less than 1');
  });

  it('refuses a fractional quantity', async () => {
    await expect(
      reject(QuoteOrderDto, { items: [anItem({ quantity: '1.5' })] }),
    ).resolves.toContain('quantity must be an integer number');
  });

  it('refuses a line with no quantity at all', async () => {
    await expect(
      reject(QuoteOrderDto, { items: [{ productId: 'prod-1' }] }),
    ).resolves.toContain('quantity must be an integer number');
  });

  it('refuses a line with no product id', async () => {
    await expect(
      reject(QuoteOrderDto, { items: [{ quantity: 1 }] }),
    ).resolves.toContain('productId should not be empty');
  });

  it('validates every line, not just the first', async () => {
    await expect(
      reject(QuoteOrderDto, {
        items: [anItem(), anItem({ productId: '' })],
      }),
    ).resolves.toContain('productId should not be empty');
  });

  it('rejects a client-supplied price on the quote', async () => {
    await expect(
      reject(QuoteOrderDto, { items: [anItem()], total: 0 }),
    ).resolves.toContain('property total should not exist');
  });
});

describe('UpdateOrderDto', () => {
  it.each(Object.values(OrderStatus))(
    'lets an admin move an order to %s',
    async (status) => {
      const dto = await accept(UpdateOrderDto, { status });
      expect(dto.status).toBe(status);
    },
  );

  it('accepts a corrected shipping address on its own', async () => {
    const dto = await accept(UpdateOrderDto, {
      shippingAddress: '2 Nguyen Hue',
    });
    expect(dto.shippingAddress).toBe('2 Nguyen Hue');
    expect(dto.status).toBeUndefined();
  });

  it('rejects a status that differs only in case', async () => {
    await expect(
      reject(UpdateOrderDto, { status: 'shipped' }),
    ).resolves.toMatch(/status must be one of/);
  });

  it('rejects a status that no order can ever have', async () => {
    await expect(
      reject(UpdateOrderDto, { status: 'REFUNDED' }),
    ).resolves.toMatch(/status must be one of/);
  });

  it('rejects an admin trying to rewrite the total', async () => {
    await expect(
      reject(UpdateOrderDto, { status: 'SHIPPED', totalAmount: 1 }),
    ).resolves.toContain('property totalAmount should not exist');
  });
});

describe('UpdateOrderUserDto', () => {
  it('accepts a new shipping address from the customer', async () => {
    const dto = await accept(UpdateOrderUserDto, {
      shippingAddress: '3 Dong Khoi',
    });
    expect(dto.shippingAddress).toBe('3 Dong Khoi');
  });

  // Status is admin-only: the customer-facing body must not carry it.
  it('refuses a status change sent by the customer', async () => {
    await expect(
      reject(UpdateOrderUserDto, { status: 'DELIVERED' }),
    ).resolves.toContain('property status should not exist');
  });

  it('refuses a customer trying to reassign the order', async () => {
    await expect(
      reject(UpdateOrderUserDto, { userId: 'user-2' }),
    ).resolves.toContain('property userId should not exist');
  });
});
