import 'reflect-metadata';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import {
  PRODUCT_SORTS,
  QueryProductDto,
} from '@/modules/products/dto/query-product.dto';

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
  query: Record<string, unknown>,
): Promise<{ dto: T; messages: string[] }> => {
  const dto = plainToInstance(cls, query, { enableImplicitConversion: true });
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, messages: collect(errors) };
};

const accept = async (
  query: Record<string, unknown>,
): Promise<QueryProductDto> => {
  const { dto, messages } = await parse(QueryProductDto, query);
  expect(messages).toEqual([]);
  return dto;
};

const reject = async (query: Record<string, unknown>): Promise<string> => {
  const { messages } = await parse(QueryProductDto, query);
  expect(messages.length).toBeGreaterThan(0);
  return messages.join(' | ');
};

describe('QueryProductDto', () => {
  describe('defaults', () => {
    it('falls back to page 1, ten per page and newest-first for an empty query', async () => {
      const dto = await accept({});
      expect(dto.page).toBe(1);
      expect(dto.limit).toBe(10);
      expect(dto.sort).toBe('newest');
    });

    it('leaves every optional filter unset for an empty query', async () => {
      const dto = await accept({});
      expect(dto.category).toBeUndefined();
      expect(dto.search).toBeUndefined();
      expect(dto.isActive).toBeUndefined();
      expect(dto.inStock).toBeUndefined();
      expect(dto.minPrice).toBeUndefined();
      expect(dto.maxPrice).toBeUndefined();
    });
  });

  describe.each(['isActive', 'inStock'] as const)('%s', (field) => {
    const inputs: Array<[string | boolean, boolean]> = [
      ['true', true],
      ['false', false],
      [true, true],
      [false, false],
    ];

    it.each(inputs)('reads %p as the boolean %p', async (raw, expected) => {
      const dto = await accept({ [field]: raw });
      expect(dto[field]).toBe(expected);
    });

    // Regression: implicit conversion runs before @Transform and Boolean('false')
    // is true, so a transform reading the converted value inverted the filter.
    it('turns the string "false" into false, not into its opposite', async () => {
      const dto = await accept({ [field]: 'false' });
      expect(dto[field]).toBe(false);
      expect(dto[field]).not.toBe(true);
    });

    it('yields a real boolean rather than the raw string', async () => {
      const dto = await accept({ [field]: 'true' });
      expect(typeof dto[field]).toBe('boolean');
    });

    it('treats a blank value as no filter at all', async () => {
      const dto = await accept({ [field]: '' });
      expect(dto[field]).toBeUndefined();
    });
  });

  it('keeps isActive and inStock independent of one another', async () => {
    const dto = await accept({ isActive: 'false', inStock: 'true' });
    expect(dto.isActive).toBe(false);
    expect(dto.inStock).toBe(true);
  });

  describe('page', () => {
    it('converts the page number sent as a query string', async () => {
      const dto = await accept({ page: '3' });
      expect(dto.page).toBe(3);
      expect(typeof dto.page).toBe('number');
    });

    it('rejects page 0 because paging starts at one', async () => {
      await expect(reject({ page: '0' })).resolves.toContain(
        'page must not be less than 1',
      );
    });

    it('rejects a negative page', async () => {
      await expect(reject({ page: '-5' })).resolves.toContain(
        'page must not be less than 1',
      );
    });

    it('rejects a page that is not a number instead of paging by NaN', async () => {
      await expect(reject({ page: 'abc' })).resolves.toContain(
        'page must be a number',
      );
    });

    it('rejects a blank page= rather than silently paging from the start', async () => {
      await expect(reject({ page: '' })).resolves.toContain(
        'page must not be less than 1',
      );
    });
  });

  describe('limit', () => {
    it('accepts 1, the smallest usable page size', async () => {
      const dto = await accept({ limit: '1' });
      expect(dto.limit).toBe(1);
    });

    it('accepts 100, the largest page size allowed', async () => {
      const dto = await accept({ limit: '100' });
      expect(dto.limit).toBe(100);
    });

    it('rejects 101, one past the cap', async () => {
      await expect(reject({ limit: '101' })).resolves.toContain(
        'limit must not be greater than 100',
      );
    });

    // ?limit=99999 used to be accepted and returned the whole catalogue.
    it('rejects a limit that tries to pull the whole table', async () => {
      await expect(reject({ limit: '99999' })).resolves.toContain(
        'limit must not be greater than 100',
      );
    });

    it('rejects limit 0', async () => {
      await expect(reject({ limit: '0' })).resolves.toContain(
        'limit must not be less than 1',
      );
    });

    it('rejects a limit that is not a number', async () => {
      await expect(reject({ limit: 'many' })).resolves.toContain(
        'limit must be a number',
      );
    });
  });

  describe.each(['minPrice', 'maxPrice'] as const)('%s', (field) => {
    it('converts a price sent as a query string', async () => {
      const dto = await accept({ [field]: '10.5' });
      expect(dto[field]).toBe(10.5);
    });

    it('accepts 0, the lowest price there can be', async () => {
      const dto = await accept({ [field]: '0' });
      expect(dto[field]).toBe(0);
    });

    it('rejects a negative price', async () => {
      await expect(reject({ [field]: '-1' })).resolves.toContain(
        `${field} must not be less than 0`,
      );
    });

    it('rejects a price just below zero', async () => {
      await expect(reject({ [field]: '-0.01' })).resolves.toContain(
        `${field} must not be less than 0`,
      );
    });

    it('rejects a price that is not a number', async () => {
      await expect(reject({ [field]: 'cheap' })).resolves.toContain(
        `${field} must be a number`,
      );
    });
  });

  it('accepts a minimum and maximum price together', async () => {
    const dto = await accept({ minPrice: '50', maxPrice: '500' });
    expect(dto.minPrice).toBe(50);
    expect(dto.maxPrice).toBe(500);
  });

  describe('sort', () => {
    it.each(PRODUCT_SORTS)('accepts the %s sort key', async (sort) => {
      const dto = await accept({ sort });
      expect(dto.sort).toBe(sort);
    });

    it('rejects an unknown sort key and lists the ones that work', async () => {
      const message = await reject({ sort: 'cheapest' });
      expect(message).toContain('sort must be one of');
      expect(message).toContain('price_asc');
    });

    it('rejects a blank sort key', async () => {
      await expect(reject({ sort: '' })).resolves.toContain(
        'sort must be one of',
      );
    });

    it('rejects a sort key that differs only in case', async () => {
      await expect(reject({ sort: 'Newest' })).resolves.toContain(
        'sort must be one of',
      );
    });
  });

  describe('search', () => {
    it('trims the whitespace around a term', async () => {
      const dto = await accept({ search: '  headphones  ' });
      expect(dto.search).toBe('headphones');
    });

    it('collapses runs of spaces between words', async () => {
      const dto = await accept({ search: '  wireless   over   ear  ' });
      expect(dto.search).toBe('wireless over ear');
    });

    it('collapses tabs and newlines the same way as spaces', async () => {
      const dto = await accept({ search: 'wireless\t\nover\near' });
      expect(dto.search).toBe('wireless over ear');
    });

    it('drops a search made only of whitespace', async () => {
      const dto = await accept({ search: '   ' });
      expect(dto.search).toBeUndefined();
    });

    it('drops an empty search rather than filtering on nothing', async () => {
      const dto = await accept({ search: '' });
      expect(dto.search).toBeUndefined();
    });

    it('leaves an already-clean term untouched', async () => {
      const dto = await accept({ search: 'nexus hub' });
      expect(dto.search).toBe('nexus hub');
    });
  });

  describe('category', () => {
    it('keeps the category id, name or slug exactly as sent', async () => {
      const dto = await accept({ category: 'audio' });
      expect(dto.category).toBe('audio');
    });
  });

  describe('unknown parameters', () => {
    it('rejects a parameter the DTO does not declare', async () => {
      await expect(reject({ colour: 'black' })).resolves.toContain(
        'property colour should not exist',
      );
    });

    it('refuses a smuggled prisma clause', async () => {
      await expect(reject({ where: '{"isActive":false}' })).resolves.toContain(
        'property where should not exist',
      );
    });
  });

  it('parses a full realistic query in one pass', async () => {
    const dto = await accept({
      category: 'audio',
      search: '  noise   cancelling ',
      isActive: 'false',
      inStock: 'true',
      minPrice: '25',
      maxPrice: '250',
      sort: 'price_desc',
      page: '2',
      limit: '50',
    });

    expect(dto).toMatchObject({
      category: 'audio',
      search: 'noise cancelling',
      isActive: false,
      inStock: true,
      minPrice: 25,
      maxPrice: 250,
      sort: 'price_desc',
      page: 2,
      limit: 50,
    });
  });
});
