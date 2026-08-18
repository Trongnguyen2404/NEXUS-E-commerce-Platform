import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { QueryContactsDto } from '@/modules/contacts/dto/query-contacts.dto';

// Flattens nested errors so a test can assert on the message a caller would see.
const collect = (errors: ValidationError[]): string[] =>
  errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...collect(error.children ?? []),
  ]);

// Exactly the pipeline main.ts installs: implicit conversion first, then the
// whitelisting validator. Anything that passes here reaches the service.
const parse = async (
  query: Record<string, unknown>,
): Promise<{ dto: QueryContactsDto; messages: string[] }> => {
  const dto = plainToInstance(QueryContactsDto, query, {
    enableImplicitConversion: true,
  });
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, messages: collect(errors) };
};

const accept = async (
  query: Record<string, unknown>,
): Promise<QueryContactsDto> => {
  const { dto, messages } = await parse(query);
  expect(messages).toEqual([]);
  return dto;
};

const reject = async (query: Record<string, unknown>): Promise<string> => {
  const { messages } = await parse(query);
  expect(messages.length).toBeGreaterThan(0);
  return messages.join(' | ');
};

describe('QueryContactsDto', () => {
  describe('defaults', () => {
    it('falls back to page 1 and ten per page for an empty query', async () => {
      const dto = await accept({});
      expect(dto.page).toBe(1);
      expect(dto.limit).toBe(10);
      expect(dto.search).toBeUndefined();
    });
  });

  describe('limit', () => {
    it('accepts 100, the largest page size allowed', async () => {
      const dto = await accept({ limit: '100' });
      expect(dto.limit).toBe(100);
    });

    it('rejects 101, one past the cap', async () => {
      await expect(reject({ limit: '101' })).resolves.toContain(
        'limit must not be greater than 100',
      );
    });

    // ?limit=99999 used to be accepted and pulled every submission, message
    // bodies included, into one response.
    it('rejects a limit that tries to pull the whole contacts table', async () => {
      await expect(reject({ limit: '99999' })).resolves.toContain(
        'limit must not be greater than 100',
      );
    });

    it('rejects limit 0', async () => {
      await expect(reject({ limit: '0' })).resolves.toContain(
        'limit must not be less than 1',
      );
    });

    it('rejects a fractional limit that would reach take', async () => {
      await expect(reject({ limit: '10.5' })).resolves.toContain(
        'limit must be an integer number',
      );
    });

    it('rejects a limit that is not a number', async () => {
      await expect(reject({ limit: 'many' })).resolves.toContain(
        'limit must be an integer number',
      );
    });
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

    it('rejects a fractional page that would reach skip', async () => {
      await expect(reject({ page: '1.5' })).resolves.toContain(
        'page must be an integer number',
      );
    });
  });

  describe('unknown parameters', () => {
    it('rejects a parameter the DTO does not declare', async () => {
      await expect(reject({ status: 'PENDING' })).resolves.toContain(
        'property status should not exist',
      );
    });
  });
});
