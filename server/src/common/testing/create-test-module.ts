import { Test, TestingModule } from '@nestjs/testing';
import type { Type } from '@nestjs/common';

// A stand-in for any dependency the class under test asks for. Every property
// resolves to a jest mock, so nothing has to be listed provider by provider.
const autoMock = (): unknown =>
  new Proxy(
    {},
    {
      get: (target: Record<string | symbol, unknown>, prop) => {
        if (prop === 'then') return undefined; // keep it from looking awaitable
        if (!(prop in target)) target[prop] = jest.fn();
        return target[prop];
      },
    },
  );

// Builds a testing module for one controller or provider, mocking the rest.
export const createTestModule = async (
  target: Type<unknown>,
  kind: 'controller' | 'provider' = 'provider',
): Promise<TestingModule> =>
  Test.createTestingModule(
    kind === 'controller' ? { controllers: [target] } : { providers: [target] },
  )
    .useMocker(() => autoMock())
    .compile();
