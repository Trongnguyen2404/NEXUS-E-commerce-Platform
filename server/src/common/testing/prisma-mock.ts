import { mockDeep, mockReset, type DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '@/prisma/prisma.service';

export type PrismaMock = DeepMockProxy<PrismaService>;

// A fully mocked Prisma client. Every delegate method is a jest mock, so a test
// only has to stub the calls it actually cares about.
export const createPrismaMock = (): PrismaMock => {
  const prisma = mockDeep<PrismaService>();

  // $transaction has two shapes and services here use both:
  //   $transaction(fn)   -> run the callback against a client
  //   $transaction([..]) -> settle an array of promises
  // Interactive callbacks get the same mock back, so writes inside a
  // transaction land on the delegates the test already stubbed.
  (prisma.$transaction as unknown as jest.Mock).mockImplementation(
    (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: PrismaMock) => unknown)(prisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    },
  );

  return prisma;
};

// Clears call history and stubs between tests without rebuilding the mock.
export const resetPrismaMock = (prisma: PrismaMock): void => {
  mockReset(prisma);
  (prisma.$transaction as unknown as jest.Mock).mockImplementation(
    (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: PrismaMock) => unknown)(prisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    },
  );
};
