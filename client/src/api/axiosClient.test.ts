import axios from 'axios';
import type { AxiosAdapter, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// This jsdom build ships without Web Storage, and the interceptor reads the token
// from it on every request, so give the tests a real in-memory Storage.
const memoryStorage = (): Storage => {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => (entries.has(key) ? (entries.get(key) as string) : null),
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => void entries.delete(key),
    setItem: (key: string, value: string) => void entries.set(key, String(value)),
  };
};
vi.stubGlobal('localStorage', memoryStorage());

// The interceptor logs the user out when a refresh fails; keep that out of the way.
const { logoutMock } = vi.hoisted(() => ({ logoutMock: vi.fn() }));
vi.mock('../store/useAuthStore', () => ({
  useAuthStore: { getState: () => ({ logout: logoutMock }) },
}));

type Responder = (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>;

interface Route {
  match: string;
  respond: Responder;
}

// Every request the transport saw, in order, with the token it carried.
interface SeenRequest {
  url: string;
  auth: string | undefined;
}

let routes: Route[] = [];
let seen: SeenRequest[] = [];

// A fake transport: real axios, real interceptors, no socket.
const adapter: AxiosAdapter = (config) => {
  const url = config.url ?? '';
  seen.push({ url, auth: config.headers?.Authorization as string | undefined });

  const route = routes.find((r) => url.includes(r.match));
  if (!route) return Promise.reject(new Error('Unrouted request: ' + url));

  return route.respond(config as InternalAxiosRequestConfig);
};

const ok = (data: unknown, config: InternalAxiosRequestConfig): AxiosResponse =>
  ({ data, status: 200, statusText: 'OK', headers: {}, config }) as AxiosResponse;

const httpError = (status: number, data: unknown, config: InternalAxiosRequestConfig) =>
  new axios.AxiosError(
    'Request failed with status code ' + status,
    'ERR_BAD_REQUEST',
    config,
    undefined,
    { data, status, statusText: '', headers: {}, config } as AxiosResponse,
  );

const callsTo = (fragment: string) => seen.filter((s) => s.url.includes(fragment));

// A promise whose settlement the test controls, so the refresh window stays open.
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

// Fresh module per test: the refresh queue is module-level state.
const loadClient = async () => {
  vi.resetModules();
  const mod = await import('./axiosClient');
  (mod.default as unknown as AxiosInstance).defaults.adapter = adapter;
  return mod;
};

const realAdapter = axios.defaults.adapter;

beforeEach(() => {
  routes = [];
  seen = [];
  axios.defaults.adapter = adapter;
  localStorage.setItem('accessToken', 'stale-token');
});

afterEach(() => {
  axios.defaults.adapter = realAdapter;
});

describe('axiosClient 401 handling', () => {
  it('refreshes once for three concurrent 401s and retries all three with the new token', async () => {
    const gate = deferred<void>();
    const firstAttempt = new Set<string>();

    routes = [
      {
        match: '/auth/refresh',
        respond: async (config) => {
          await gate.promise;
          return ok({ accessToken: 'fresh-token' }, config);
        },
      },
      {
        match: '/',
        respond: (config) => {
          const url = config.url ?? '';
          if (!firstAttempt.has(url)) {
            firstAttempt.add(url);
            return Promise.reject(httpError(401, { statusCode: 401, message: 'Expired' }, config));
          }
          return Promise.resolve(ok({ from: url }, config));
        },
      },
    ];

    const client = (await loadClient()).default;

    const pending = [client.get('/cart'), client.get('/orders'), client.get('/wishlist')];

    // Wait until all three have failed and the single refresh is in flight.
    await vi.waitFor(() => expect(callsTo('/auth/refresh')).toHaveLength(1));
    expect(callsTo('/auth/refresh')).toHaveLength(1);

    gate.resolve();
    const results = await Promise.all(pending);

    expect(results).toEqual([{ from: '/cart' }, { from: '/orders' }, { from: '/wishlist' }]);

    // Still exactly one refresh, and every request was tried twice.
    expect(callsTo('/auth/refresh')).toHaveLength(1);
    expect(callsTo('/cart')).toHaveLength(2);
    expect(callsTo('/orders')).toHaveLength(2);
    expect(callsTo('/wishlist')).toHaveLength(2);

    // The retries carried the refreshed token, not the stale one.
    const retries = seen.filter((s) => !s.url.includes('/auth/refresh')).slice(3);
    expect(retries.map((s) => s.auth)).toEqual([
      'Bearer fresh-token',
      'Bearer fresh-token',
      'Bearer fresh-token',
    ]);
    expect(localStorage.getItem('accessToken')).toBe('fresh-token');
  });

  it('rejects every queued request when the refresh fails instead of leaving them pending', async () => {
    const gate = deferred<void>();

    routes = [
      {
        match: '/auth/refresh',
        respond: async (config) => {
          await gate.promise;
          throw httpError(401, { statusCode: 401, message: 'Refresh token expired' }, config);
        },
      },
      {
        match: '/',
        respond: (config) =>
          Promise.reject(httpError(401, { statusCode: 401, message: 'Expired' }, config)),
      },
    ];

    const client = (await loadClient()).default;

    const pending = [client.get('/cart'), client.get('/orders'), client.get('/wishlist')];
    pending.forEach((p) => p.catch(() => undefined));

    await vi.waitFor(() => expect(callsTo('/auth/refresh')).toHaveLength(1));
    gate.resolve();

    const outcome = await Promise.race([
      Promise.allSettled(pending),
      new Promise((resolve) => setTimeout(() => resolve('STILL PENDING'), 1000)),
    ]);

    expect(outcome).not.toBe('STILL PENDING');
    const settled = outcome as PromiseSettledResult<unknown>[];
    expect(settled.map((s) => s.status)).toEqual(['rejected', 'rejected', 'rejected']);

    // Nothing was retried behind a dead refresh.
    expect(callsTo('/cart')).toHaveLength(1);
    expect(callsTo('/orders')).toHaveLength(1);
    expect(callsTo('/wishlist')).toHaveLength(1);
  });

  it('logs the user out when the refresh fails', async () => {
    routes = [
      {
        match: '/auth/refresh',
        respond: (config) =>
          Promise.reject(httpError(401, { statusCode: 401, message: 'No session' }, config)),
      },
      {
        match: '/cart',
        respond: (config) =>
          Promise.reject(httpError(401, { statusCode: 401, message: 'Expired' }, config)),
      },
    ];

    const client = (await loadClient()).default;

    await expect(client.get('/cart')).rejects.toBeDefined();
    expect(logoutMock).toHaveBeenCalledTimes(1);
    // Nothing navigates away from a public page.
    expect(window.location.pathname).toBe('/');
  });

  it('does not restart the refresh cycle when the logout it triggers is itself rejected', async () => {
    // POST /auth/logout is guarded by JwtAuthGuard, so the logout the failure handler
    // fires answers 401 too. If that 401 re-enters the refresh path the pair loops.
    let logoutCalls = 0;

    routes = [
      {
        match: '/auth/refresh',
        respond: (config) =>
          Promise.reject(httpError(401, { statusCode: 401, message: 'No session' }, config)),
      },
      {
        match: '/auth/logout',
        respond: (config) => {
          logoutCalls += 1;
          // Bounded so a looping client fails the assertion instead of hanging.
          if (logoutCalls > 4) return Promise.resolve(ok({ success: true }, config));
          return Promise.reject(httpError(401, { statusCode: 401, message: 'Unauthorized' }, config));
        },
      },
      {
        match: '/cart',
        respond: (config) =>
          Promise.reject(httpError(401, { statusCode: 401, message: 'Expired' }, config)),
      },
    ];

    const client = (await loadClient()).default;

    // The real store action calls the server through this same instance.
    logoutMock.mockImplementation(async () => {
      await client.post('/auth/logout').catch(() => undefined);
    });

    await expect(client.get('/cart')).rejects.toBeDefined();
    await vi.waitFor(() => expect(callsTo('/auth/logout')).toHaveLength(1));
    // Give any follow-on refresh time to fire before asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(callsTo('/auth/logout')).toHaveLength(1);
    expect(callsTo('/auth/refresh')).toHaveLength(1);
    expect(logoutMock).toHaveBeenCalledTimes(1);
    logoutMock.mockReset();
  });

  it('does not retry a request that has already been retried once', async () => {
    routes = [
      {
        match: '/auth/refresh',
        respond: (config) => Promise.resolve(ok({ accessToken: 'fresh-token' }, config)),
      },
      {
        match: '/cart',
        respond: (config) =>
          Promise.reject(httpError(401, { statusCode: 401, message: 'Still unauthorised' }, config)),
      },
    ];

    const client = (await loadClient()).default;

    await expect(client.get('/cart')).rejects.toEqual({
      statusCode: 401,
      message: 'Still unauthorised',
    });

    // One refresh, one retry, then it gives up rather than looping.
    expect(callsTo('/cart')).toHaveLength(2);
    expect(callsTo('/auth/refresh')).toHaveLength(1);
  });

  it('never tries to refresh a rejected login', async () => {
    routes = [
      {
        match: '/auth/login',
        respond: (config) =>
          Promise.reject(
            httpError(401, { statusCode: 401, message: 'Invalid credentials' }, config),
          ),
      },
    ];

    const client = (await loadClient()).default;

    await expect(client.post('/auth/login', { email: 'a@b.c', password: 'nope' })).rejects.toEqual({
      statusCode: 401,
      message: 'Invalid credentials',
    });
    expect(callsTo('/auth/refresh')).toHaveLength(0);
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it('unwraps successful responses to the body and rejects non-401s with the API body', async () => {
    routes = [
      { match: '/products', respond: (config) => Promise.resolve(ok({ data: ['a'] }, config)) },
      {
        match: '/contact',
        respond: (config) =>
          Promise.reject(
            httpError(400, { statusCode: 400, message: ['email must be an email'] }, config),
          ),
      },
    ];

    const client = (await loadClient()).default;

    await expect(client.get('/products')).resolves.toEqual({ data: ['a'] });
    await expect(client.post('/contact', {})).rejects.toEqual({
      statusCode: 400,
      message: ['email must be an email'],
    });
    expect(callsTo('/auth/refresh')).toHaveLength(0);
  });
});

describe('getErrorMessage', () => {
  it('reads the message off an API error body', async () => {
    const { getErrorMessage } = await loadClient();
    expect(getErrorMessage({ statusCode: 409, message: 'Email already registered' })).toBe(
      'Email already registered',
    );
  });

  it('takes the first line of a validation error array', async () => {
    const { getErrorMessage } = await loadClient();
    expect(
      getErrorMessage({ statusCode: 400, message: ['password is too short', 'email is invalid'] }),
    ).toBe('password is too short');
  });

  it('reads the message off a network error that never reached the API', async () => {
    routes = [
      {
        match: '/cart',
        respond: () => Promise.reject(new axios.AxiosError('Network Error', 'ERR_NETWORK')),
      },
    ];
    const { default: client, getErrorMessage } = await loadClient();

    const error = await client.get('/cart').catch((e: unknown) => e);
    expect(getErrorMessage(error)).toBe('Network Error');
  });

  it('falls back when there is nothing usable to show', async () => {
    const { getErrorMessage } = await loadClient();

    expect(getErrorMessage(undefined)).toBe('Something went wrong');
    expect(getErrorMessage(null)).toBe('Something went wrong');
    expect(getErrorMessage({})).toBe('Something went wrong');
    expect(getErrorMessage({ statusCode: 500, message: '' })).toBe('Something went wrong');
    expect(getErrorMessage({ statusCode: 400, message: [] })).toBe('Something went wrong');
  });

  it('uses the caller supplied fallback', async () => {
    const { getErrorMessage } = await loadClient();
    expect(getErrorMessage({}, 'Could not update your wishlist.')).toBe(
      'Could not update your wishlist.',
    );
  });

  // A bare string error carries no `.message`, so the string itself is dropped and the
  // caller shows the generic fallback. Flagged in concerns rather than called desirable.
  it('does not surface a bare string error, falling back instead', async () => {
    const { getErrorMessage } = await loadClient();
    expect(getErrorMessage('Payment declined by issuer')).toBe('Something went wrong');
  });
});
