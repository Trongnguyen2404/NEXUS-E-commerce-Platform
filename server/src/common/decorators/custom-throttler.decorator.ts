import { Throttle } from '@nestjs/throttler';

// NOTE: `ttl` is in MILLISECONDS since @nestjs/throttler v5. These all use a
// one-minute window; only the allowance per window differs.
const ONE_MINUTE = 60_000;

// Strict rate for auth, payments — the endpoints worth brute-forcing.
export const StrictThrottle = () =>
  Throttle({
    default: {
      ttl: ONE_MINUTE,
      limit: 5,
    },
  });

// Moderate rate for orders and other state-changing operations
export const ModerateThrottle = () =>
  Throttle({
    default: {
      ttl: ONE_MINUTE,
      limit: 20,
    },
  });

// Relaxed rate for read operations
export const RelaxedThrottle = () =>
  Throttle({
    default: {
      ttl: ONE_MINUTE,
      limit: 60,
    },
  });
